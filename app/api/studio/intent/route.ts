import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { capabilityMessage, hasCapability } from '@/src/auth/capabilities';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';
import { sanitizeErrorMessage, sanitizeOutput } from '@/src/utils/output-sanitizer';
import { registerExternalAgent } from '@/src/external-agents/service';
import { executeUniversalToolCall } from '@/src/mcp/registry';
import { withStudioDefaultAllowedDomains } from '@/src/studio/domains';
import { callClaude, tokenSet, tokenGet, tokenDel, TOKEN_TTL_SECONDS } from '@/src/studio/planner';
import { appendStudioEvent, appendStudioMessage } from '@/src/studio/persistence';
import { syncWorkflowDocument } from '@/src/workflows/canonical';

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

function restrictedStudioCapability(instruction: string): 'access_sdk' | 'create_app' | 'create_skill' | null {
  const lower = instruction.toLowerCase();
  if (/\b(sdk|developer console|manifest|webhook|publishing panel)\b/.test(lower)) return 'access_sdk';
  if (/\b(create|build|publish|submit|package|convert)\b.*\bapp\b/.test(lower) || /\bapp\b.*\b(create|publish|submit|manifest)\b/.test(lower)) return 'create_app';
  if (/\b(create|build|publish|submit)\b.*\bskill\b/.test(lower) || /\bskill\b.*\b(create|publish|submit)\b/.test(lower)) return 'create_skill';
  return null;
}

async function recordStudioTurn(agentId: string, sessionId: string | undefined, role: 'user' | 'assistant', content: string): Promise<void> {
  if (!sessionId) return;
  try {
    await appendStudioMessage({ ownerAgentId: agentId, sessionId, role, content });
  } catch {
    // Persistence failure is surfaced by dedicated session APIs; do not block legacy Studio intent calls.
  }
}

async function recordStudioEvent(agentId: string, sessionId: string | undefined, type: Parameters<typeof appendStudioEvent>[0]['type'], payload: Record<string, unknown>): Promise<void> {
  if (!sessionId) return;
  try {
    await appendStudioEvent({ ownerAgentId: agentId, sessionId, type, payload });
  } catch {
    // Keep legacy intent endpoint compatible when Studio persistence is not attached.
  }
}

async function resolveSessionWorkspaceId(agentId: string, sessionId: string | undefined): Promise<string | null> {
  if (!sessionId) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('nl_studio_sessions')
    .select('workspace_id')
    .eq('id', sessionId)
    .eq('owner_agent_id', agentId)
    .maybeSingle();
  if (error || !data || typeof data.workspace_id !== 'string') return null;
  return data.workspace_id;
}

// POST /api/studio/intent
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireRouteCapability(req.headers, 'studio.intent');

    let body: { instruction?: string; confirm?: boolean; confirmToken?: string | null; sessionId?: string };
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { instruction, confirm = false, confirmToken, sessionId } = body;
    const studioCtx = withStudioDefaultAllowedDomains({ ...ctx, studioSessionId: sessionId ?? null });

    // ── CONFIRM EXECUTION ───────────────────────────────────────────────────
    if (confirm && confirmToken) {
      const stored = await tokenGet(`intent:token:${confirmToken}`);
      if (!stored) return NextResponse.json({ error: 'Plan expired — please re-submit your instruction and confirm within 30 minutes.' }, { status: 400 });

      const plan = JSON.parse(stored) as StoredPlan;

      if (plan.agentId !== ctx.agentId) return NextResponse.json({ error: 'Token mismatch' }, { status: 403 });
      await recordStudioEvent(ctx.agentId, sessionId, 'task_started', { summary: plan.summary, stepCount: plan.steps.length });

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

        await recordStudioEvent(ctx.agentId, sessionId, 'task_progress', { step: step.order, tool: toolName });
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
      const publicResults = sanitizeOutput(results);
      const publicAnswer = answer ? sanitizeErrorMessage(answer) : null;
      let workflowId: string | null = null;
      if (shouldPersistWorkflow(plan)) {
        const supabase = getSupabaseAdmin();
        const workflowSync = syncWorkflowDocument({
          mode: 'conversation',
          steps: plan.steps,
          metadata: { source: 'studio_intent_confirmed_plan' },
        });
        const workspaceId = await resolveSessionWorkspaceId(ctx.agentId, sessionId);
        const { data: wf } = await supabase.from('agent_workflows').insert({
          agent_id: ctx.agentId,
          workspace_id: workspaceId,
          name: plan.workflowName,
          summary: plan.summary,
          steps: workflowSync.steps,
          graph_state: workflowSync.graphState,
          code_state: workflowSync.codeState,
          canonical_doc: workflowSync.canonical,
          schedule: plan.schedule,
          task_id: taskId,
          last_result: publicAnswer ? { answer: publicAnswer, results: publicResults } : { results: publicResults },
          last_run_at: new Date().toISOString(),
          status: 'active',
        }).select('id').single();
        workflowId = wf?.id ?? null;
        if (workflowId) {
          await recordStudioEvent(ctx.agentId, sessionId, 'workflow_created', { workflowId, name: plan.workflowName });
        }

        if (workflowId && taskId) {
          await supabase
            .from('scheduled_tasks')
            .update({ workflow_id: workflowId })
            .eq('id', taskId)
            .eq('agent_id', ctx.agentId);
        }
      }

      await recordStudioEvent(ctx.agentId, sessionId, 'task_completed', { workflowId, schedule: plan.schedule });
      if (publicAnswer) await recordStudioTurn(ctx.agentId, sessionId, 'assistant', publicAnswer);

      return NextResponse.json({
        executed: true,
        results: publicResults,
        answer: publicAnswer,
        workflowId,
        schedule: plan.schedule,
      });
    }

    // ── PLAN GENERATION ─────────────────────────────────────────────────────
    if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
      return NextResponse.json({ error: 'instruction is required' }, { status: 400 });
    }

    const trimmedInstruction = instruction.trim();
    await recordStudioTurn(ctx.agentId, sessionId, 'user', trimmedInstruction);
    await recordStudioEvent(ctx.agentId, sessionId, 'thinking_started', { instruction: trimmedInstruction.slice(0, 180) });

    const restricted = restrictedStudioCapability(trimmedInstruction);
    if (restricted && !hasCapability(ctx.tier, restricted)) {
      const summary = capabilityMessage(restricted);
      const eventType = restricted === 'create_app'
        ? 'app_creation_blocked'
        : restricted === 'create_skill'
          ? 'skill_creation_blocked'
          : 'sdk_access_blocked';
      await recordStudioEvent(ctx.agentId, sessionId, eventType, { capability: restricted });
      await recordStudioTurn(ctx.agentId, sessionId, 'assistant', summary);
      return NextResponse.json({
        summary,
        steps: [],
        schedule: null,
        missingParams: [],
        confirmToken: null,
        requiresInput: false,
        blocked: true,
      }, { status: 403 });
    }

    const plan = await callClaude(trimmedInstruction);

    // Generate confirm token
    const token = crypto.randomUUID().replace(/-/g, '');
    await tokenSet(`intent:token:${token}`, TOKEN_TTL_SECONDS, JSON.stringify({
      ...plan,
      workflowName: trimmedInstruction.slice(0, 80),
      agentId: ctx.agentId,
    }));
    await recordStudioEvent(ctx.agentId, sessionId, 'plan_created', { summary: plan.summary, stepCount: plan.steps.length, schedule: plan.schedule });

    return NextResponse.json({
      summary: plan.summary,
      steps: plan.steps,
      schedule: plan.schedule,
      missingParams: [],
      confirmToken: token,
      requiresInput: false,
    });
  } catch (error: unknown) {
    console.error('[studio/intent]', sanitizeErrorMessage(error));
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
