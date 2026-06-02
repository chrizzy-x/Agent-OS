import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { registerExternalAgent, resolveVisibleExternalAgentRef } from '@/src/external-agents/service';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { executeUniversalToolCall } from '@/src/mcp/registry';
import { toErrorResponse, NotFoundError } from '@/src/utils/errors';
import { sanitizeErrorMessage, sanitizeOutput } from '@/src/utils/output-sanitizer';
import { callClaude, tokenSet, tokenGet, tokenDel, TOKEN_TTL_SECONDS } from '@/src/studio/planner';
import { DEFAULT_QUOTAS } from '@/src/auth/permissions';
import { logOperation } from '@/src/runtime/audit';
import type { AgentContext } from '@/src/auth/permissions';

export const runtime = 'nodejs';

type CommandStep = { order: number; tool: string; input: Record<string, unknown>; description: string };

type StoredCommandPlan = {
  summary: string;
  steps: CommandStep[];
  schedule: string | null;
  workflowName: string;
  subAgentId: string;
  callerId: string;
  delegatedTasks?: string[];
};

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28) || 'task';
}

function splitDelegatedTasks(instruction: string): string[] {
  const lines = instruction
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);

  if (lines.length > 1) return lines;
  const semicolon = instruction.split(';').map(part => part.trim()).filter(Boolean);
  if (semicolon.length > 1) return semicolon;
  const numbered = [...instruction.matchAll(/(?:^|\s)(?:\d+[.)])\s+(.+?)(?=\s+\d+[.)]\s+|$)/g)]
    .map(match => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
  return numbered.length > 1 ? numbered : [instruction.trim()];
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

    if (typeof bitcoin?.usd === 'number') return `Bitcoin is $${bitcoin.usd.toLocaleString('en-US')} USD.`;
    if (typeof ethereum?.usd === 'number') return `Ethereum is $${ethereum.usd.toLocaleString('en-US')} USD.`;
  }

  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function buildAgentAnswer(results: unknown[]): string | null {
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
  if ('body' in payload) return formatNaturalAnswer(parseJsonBody(payload.body));
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

async function executeAgentPlan(params: {
  agentId: string;
  agentName: string;
  allowedDomains: string[];
  plan: { summary: string; steps: CommandStep[]; schedule: string | null; workflowName: string };
}) {
  const agentCtx: AgentContext = {
    agentId: params.agentId,
    allowedDomains: params.allowedDomains,
    quotas: DEFAULT_QUOTAS,
    tier: 'free',
  };

  const results: unknown[] = [];
  const startedAt = Date.now();
  for (const step of params.plan.steps.sort((a, b) => a.order - b.order)) {
    const result = await executeUniversalToolCall({
      agentContext: agentCtx,
      name: step.tool,
      server: undefined,
      arguments: step.input,
    });
    results.push({ step: step.order, tool: step.tool.replace(/^agentos\./, ''), result });
  }

  const answer = buildAgentAnswer(results);
  const taskId = findScheduledTaskId(results);
  const publicResults = sanitizeOutput(results);
  const publicAnswer = answer ? sanitizeErrorMessage(answer) : null;
  const ranAt = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  const { data: wf } = await supabase.from('agent_workflows').insert({
    agent_id: params.agentId,
    name: params.plan.workflowName,
    summary: params.plan.summary,
    steps: params.plan.steps,
    schedule: params.plan.schedule,
    task_id: taskId,
    last_result: publicAnswer ? { answer: publicAnswer, results: publicResults } : { results: publicResults },
    last_run_at: ranAt,
    status: 'active',
  }).select('id').single();

  if (wf?.id && taskId) {
    await supabase
      .from('scheduled_tasks')
      .update({ workflow_id: wf.id })
      .eq('id', taskId)
      .eq('agent_id', params.agentId);
  }

  await logOperation({
    agentId: params.agentId,
    primitive: 'workflow',
    operation: params.plan.workflowName,
    success: true,
    durationMs: Date.now() - startedAt,
    metadata: {
      workflowId: wf?.id ?? null,
      schedule: params.plan.schedule,
      agentName: params.agentName,
      result: publicAnswer ? { answer: publicAnswer, results: publicResults } : { results: publicResults },
    },
  });

  return { results: publicResults, answer: publicAnswer, workflowId: wf?.id ?? null };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = requireAgentContext(request.headers);
    const { id } = await params;

    const registration = await resolveVisibleExternalAgentRef(ctx.agentId, id);
    if (!registration) throw new NotFoundError('Agent not found');

    let body: { instruction?: string; confirm?: boolean; confirmToken?: string | null };
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { instruction, confirm = false, confirmToken } = body;

    // ── CONFIRM EXECUTION ───────────────────────────────────────────────────
    if (confirm && confirmToken) {
      const stored = await tokenGet(`agent-cmd:${confirmToken}`);
      if (!stored) return NextResponse.json({ error: 'Plan expired — please re-submit your instruction.' }, { status: 400 });

      const plan = JSON.parse(stored) as StoredCommandPlan;

      if (plan.callerId !== ctx.agentId || plan.subAgentId !== registration.agent_id) {
        return NextResponse.json({ error: 'Token mismatch' }, { status: 403 });
      }

      await tokenDel(`agent-cmd:${confirmToken}`);

      if (plan.delegatedTasks && plan.delegatedTasks.length > 1) {
        const delegated = await Promise.all(plan.delegatedTasks.map(async (task, index) => {
          const suffix = crypto.randomBytes(3).toString('hex');
          const childName = `${registration.name} Task ${index + 1} ${suffix}`;
          const child = await registerExternalAgent({
            agentId: `${slugify(registration.name)}-${slugify(task)}-${suffix}`,
            name: childName,
            description: task,
            ownerEmail: registration.agent_id,
            allowedDomains: registration.allowed_domains ?? ['*'],
            allowedTools: registration.allowed_tools ?? [],
          });
          const taskPlan = await callClaude(task);
          const run = await executeAgentPlan({
            agentId: child.agentId,
            agentName: childName,
            allowedDomains: child.allowedDomains,
            plan: { ...taskPlan, workflowName: task.slice(0, 80) },
          });
          return { task, subAgentId: child.agentId, ...run };
        }));

        const answer = delegated.map((item, index) => {
          const text = item.answer ?? JSON.stringify(item.results);
          return `${index + 1}. ${item.task}: ${text}`;
        }).join('\n');
        const results = delegated.map((item, index) => ({
          step: index + 1,
          tool: 'delegate_task',
          result: item,
        }));
        const publicResults = sanitizeOutput(results);
        const publicAnswer = sanitizeErrorMessage(answer);
        const ranAt = new Date().toISOString();
        const supabase = getSupabaseAdmin();
        const { data: wf } = await supabase.from('agent_workflows').insert({
          agent_id: registration.agent_id,
          name: plan.workflowName,
          summary: plan.summary,
          steps: plan.steps,
          schedule: null,
          last_result: { answer: publicAnswer, results: publicResults },
          last_run_at: ranAt,
          status: 'active',
        }).select('id').single();

        await logOperation({
          agentId: registration.agent_id,
          primitive: 'workflow',
          operation: plan.workflowName,
          success: true,
          metadata: {
            workflowId: wf?.id ?? null,
            delegatedCount: delegated.length,
            result: { answer: publicAnswer, results: publicResults },
          },
        });

        return NextResponse.json({ executed: true, delegated: true, results: publicResults, answer: publicAnswer, workflowId: wf?.id ?? null });
      }

      const run = await executeAgentPlan({
        agentId: registration.agent_id,
        agentName: registration.name,
        allowedDomains: registration.allowed_domains ?? ['*'],
        plan,
      });

      return NextResponse.json({ executed: true, results: run.results, answer: run.answer, workflowId: run.workflowId });
    }

    // ── PLAN GENERATION ─────────────────────────────────────────────────────
    if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
      return NextResponse.json({ error: 'instruction is required' }, { status: 400 });
    }

    const token = crypto.randomUUID().replace(/-/g, '');
    const delegatedTasks = splitDelegatedTasks(instruction.trim());
    if (delegatedTasks.length > 1) {
      const steps = delegatedTasks.map((task, index) => ({
        order: index + 1,
        tool: 'agentos.proc_spawn',
        input: { task },
        description: `Delegate task ${index + 1}: ${task}`,
      }));
      await tokenSet(`agent-cmd:${token}`, TOKEN_TTL_SECONDS, JSON.stringify({
        summary: `${registration.name} will spawn ${delegatedTasks.length} subagents and run these tasks in parallel.`,
        steps,
        schedule: null,
        workflowName: instruction.trim().slice(0, 80),
        subAgentId: registration.agent_id,
        callerId: ctx.agentId,
        delegatedTasks,
      }));

      return NextResponse.json({
        summary: `${registration.name} will spawn ${delegatedTasks.length} subagents and run these tasks in parallel.`,
        steps,
        schedule: null,
        confirmToken: token,
      });
    }

    const plan = await callClaude(instruction.trim());

    await tokenSet(`agent-cmd:${token}`, TOKEN_TTL_SECONDS, JSON.stringify({
      ...plan,
      workflowName: instruction.trim().slice(0, 80),
      subAgentId: registration.agent_id,
      callerId: ctx.agentId,
    }));

    return NextResponse.json({
      summary: plan.summary,
      steps: plan.steps,
      schedule: plan.schedule,
      confirmToken: token,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
