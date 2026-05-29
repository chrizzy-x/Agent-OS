import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { requireAgentContext } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';
import { registerExternalAgent } from '@/src/external-agents/service';
import { executeUniversalToolCall } from '@/src/mcp/registry';
import { withStudioDefaultAllowedDomains } from '@/src/studio/domains';
import { callClaude, tokenSet, tokenGet, tokenDel, TOKEN_TTL_SECONDS } from '@/src/studio/planner';

export const runtime = 'nodejs';

type StoredPlan = {
  summary: string;
  steps: Array<{ order: number; tool: string; input: Record<string, unknown>; description: string }>;
  schedule: string | null;
  workflowName: string;
  agentId: string;
};

const READ_ONLY_INTENT_TOOLS = new Set([
  'net_http_get',
  'net_dns_resolve',
  'mem_get',
  'mem_list',
  'mem_recall',
  'db_query',
  'fs_read',
  'fs_list',
  'events_subscribe',
]);

function normalizeToolName(tool: string): string {
  return tool.replace(/^agentos\./, '');
}

function shouldPersistWorkflow(plan: StoredPlan): boolean {
  if (plan.schedule) return true;
  return plan.steps.some(step => !READ_ONLY_INTENT_TOOLS.has(normalizeToolName(step.tool)));
}

function parseJsonBody(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function formatNaturalAnswer(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const payload = value as Record<string, unknown>;
    const bitcoin = payload.bitcoin as { usd?: unknown } | undefined;
    const ethereum = payload.ethereum as { usd?: unknown } | undefined;

    if (typeof bitcoin?.usd === 'number') {
      return `Bitcoin is $${bitcoin.usd.toLocaleString('en-US')} USD.`;
    }
    if (typeof ethereum?.usd === 'number') {
      return `Ethereum is $${ethereum.usd.toLocaleString('en-US')} USD.`;
    }
  }

  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function buildStudioAnswer(results: unknown[]): string | null {
  const last = [...results].reverse().find(item => {
    if (!item || typeof item !== 'object') return false;
    const result = (item as { result?: unknown }).result;
    return Boolean(result && typeof result === 'object' && 'body' in (result as Record<string, unknown>));
  }) ?? results.at(-1);
  if (!last || typeof last !== 'object') return null;

  const result = (last as { result?: unknown }).result;
  if (!result || typeof result !== 'object') {
    return result === undefined ? null : JSON.stringify(result, null, 2);
  }

  const payload = result as Record<string, unknown>;
  if ('body' in payload) {
    const parsed = parseJsonBody(payload.body);
    return formatNaturalAnswer(parsed);
  }

  return formatNaturalAnswer(result);
}

function findScheduledTaskId(results: unknown[]): string | null {
  for (const item of results) {
    if (!item || typeof item !== 'object') continue;
    const result = (item as { result?: unknown }).result;
    if (!result || typeof result !== 'object') continue;
    const taskId = (result as { taskId?: unknown }).taskId;
    if (typeof taskId === 'string' && taskId.length > 0) return taskId;
  }
  return null;
}

// POST /api/studio/intent
export async function POST(req: NextRequest) {
  try {
    const ctx = requireAgentContext(req.headers);
    const studioCtx = withStudioDefaultAllowedDomains(ctx);

    let body: { instruction?: string; confirm?: boolean; confirmToken?: string | null };
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { instruction, confirm = false, confirmToken } = body;

    // ── CONFIRM EXECUTION ───────────────────────────────────────────────────
    if (confirm && confirmToken) {
      const stored = await tokenGet(`intent:token:${confirmToken}`);
      if (!stored) return NextResponse.json({ error: 'Plan expired — please re-submit your instruction and confirm within 30 minutes.' }, { status: 400 });

      const plan = JSON.parse(stored) as StoredPlan;

      if (plan.agentId !== ctx.agentId) return NextResponse.json({ error: 'Token mismatch' }, { status: 403 });

      // Delete token immediately (one-time use)
      await tokenDel(`intent:token:${confirmToken}`);

      // Execute steps in order via MCP router
      const results: unknown[] = [];
      for (const step of plan.steps.sort((a, b) => a.order - b.order)) {
        const toolName = step.tool.replace(/^agentos\./, '');

        if (step.tool === 'agentos.agent_deploy') {
          const agentName = typeof step.input.name === 'string' && step.input.name.trim()
            ? step.input.name.trim()
            : 'Studio Agent';
          const desc = typeof step.input.description === 'string' ? step.input.description : null;
          const suffix = crypto.randomBytes(4).toString('hex');
          const agentId = agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) + '-' + suffix;
          const deployResult = await registerExternalAgent({
            agentId,
            name: agentName,
            description: desc,
            ownerEmail: ctx.agentId,
            allowedDomains: ['*'],
            allowedTools: [],
          });
          results.push({ step: step.order, tool: 'agent_deploy', result: { token: deployResult.token, message: 'Agent deployed successfully' } });
          continue;
        }

        const result = await executeUniversalToolCall({
          agentContext: studioCtx,
          name: step.tool,
          server: undefined,
          arguments: step.input,
        });
        results.push({ step: step.order, tool: toolName, result });
      }

      const answer = buildStudioAnswer(results);
      const taskId = findScheduledTaskId(results);
      const publicResults = omitAgentIdentifierFields(results);
      let workflowId: string | null = null;
      if (shouldPersistWorkflow(plan)) {
        const supabase = getSupabaseAdmin();
        const { data: wf } = await supabase.from('agent_workflows').insert({
          agent_id: ctx.agentId,
          name: plan.workflowName,
          summary: plan.summary,
          steps: plan.steps,
          schedule: plan.schedule,
          task_id: taskId,
          last_result: answer ? { answer, results: publicResults } : { results: publicResults },
          last_run_at: new Date().toISOString(),
          status: 'active',
        }).select('id').single();
        workflowId = wf?.id ?? null;

        if (workflowId && taskId) {
          await supabase
            .from('scheduled_tasks')
            .update({ workflow_id: workflowId })
            .eq('id', taskId)
            .eq('agent_id', ctx.agentId);
        }
      }

      return NextResponse.json({
        executed: true,
        results: publicResults,
        answer,
        workflowId,
        schedule: plan.schedule,
      });
    }

    // ── PLAN GENERATION ─────────────────────────────────────────────────────
    if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
      return NextResponse.json({ error: 'instruction is required' }, { status: 400 });
    }

    const plan = await callClaude(instruction.trim());

    // Generate confirm token
    const token = crypto.randomUUID().replace(/-/g, '');
    await tokenSet(`intent:token:${token}`, TOKEN_TTL_SECONDS, JSON.stringify({
      ...plan,
      workflowName: instruction.trim().slice(0, 80),
      agentId: ctx.agentId,
    }));

    return NextResponse.json({
      summary: plan.summary,
      steps: plan.steps,
      schedule: plan.schedule,
      missingParams: [],
      confirmToken: token,
      requiresInput: false,
    });
  } catch (error: unknown) {
    console.error('[studio/intent]', error instanceof Error ? error.message : error);
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
