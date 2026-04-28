import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { getExternalAgentRegistration } from '@/src/external-agents/service';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { executeUniversalToolCall } from '@/src/mcp/registry';
import { toErrorResponse, NotFoundError, PermissionError } from '@/src/utils/errors';
import { callClaude, tokenSet, tokenGet, tokenDel, TOKEN_TTL_SECONDS } from '@/src/studio/planner';
import { DEFAULT_QUOTAS } from '@/src/auth/permissions';
import type { AgentContext } from '@/src/auth/permissions';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = requireAgentContext(request.headers);
    const { id } = await params;

    const registration = await getExternalAgentRegistration(id);
    if (!registration) throw new NotFoundError(`Agent '${id}' not found`);
    if (registration.owner_email !== ctx.agentId.toLowerCase()) throw new PermissionError('Access denied');

    let body: { instruction?: string; confirm?: boolean; confirmToken?: string | null };
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { instruction, confirm = false, confirmToken } = body;

    // ── CONFIRM EXECUTION ───────────────────────────────────────────────────
    if (confirm && confirmToken) {
      const stored = await tokenGet(`agent-cmd:${confirmToken}`);
      if (!stored) return NextResponse.json({ error: 'Plan expired — please re-submit your instruction.' }, { status: 400 });

      const plan = JSON.parse(stored) as {
        summary: string;
        steps: Array<{ order: number; tool: string; input: Record<string, unknown>; description: string }>;
        schedule: string | null;
        workflowName: string;
        subAgentId: string;
        callerId: string;
      };

      if (plan.callerId !== ctx.agentId || plan.subAgentId !== id) {
        return NextResponse.json({ error: 'Token mismatch' }, { status: 403 });
      }

      await tokenDel(`agent-cmd:${confirmToken}`);

      const subAgentCtx: AgentContext = {
        agentId: id,
        allowedDomains: registration.allowed_domains ?? ['*'],
        quotas: DEFAULT_QUOTAS,
        tier: 'free',
      };

      const results: unknown[] = [];
      for (const step of plan.steps.sort((a, b) => a.order - b.order)) {
        const result = await executeUniversalToolCall({
          agentContext: subAgentCtx,
          name: step.tool,
          server: undefined,
          arguments: step.input,
        });
        results.push({ step: step.order, tool: step.tool.replace(/^agentos\./, ''), result });
      }

      const supabase = getSupabaseAdmin();
      const { data: wf } = await supabase.from('agent_workflows').insert({
        agent_id: id,
        name: plan.workflowName,
        summary: plan.summary,
        steps: plan.steps,
        schedule: plan.schedule,
        status: 'active',
      }).select('id').single();

      return NextResponse.json({ executed: true, results, workflowId: wf?.id ?? null });
    }

    // ── PLAN GENERATION ─────────────────────────────────────────────────────
    if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
      return NextResponse.json({ error: 'instruction is required' }, { status: 400 });
    }

    const plan = await callClaude(instruction.trim());

    const token = crypto.randomUUID().replace(/-/g, '');
    await tokenSet(`agent-cmd:${token}`, TOKEN_TTL_SECONDS, JSON.stringify({
      ...plan,
      workflowName: instruction.trim().slice(0, 80),
      subAgentId: id,
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
