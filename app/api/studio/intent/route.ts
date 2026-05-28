import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';
import { registerExternalAgent } from '@/src/external-agents/service';
import { executeUniversalToolCall } from '@/src/mcp/registry';
import { withStudioDefaultAllowedDomains } from '@/src/studio/domains';
import { callClaude, tokenSet, tokenGet, tokenDel, TOKEN_TTL_SECONDS } from '@/src/studio/planner';

export const runtime = 'nodejs';

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

      const plan = JSON.parse(stored) as {
        summary: string;
        steps: Array<{ order: number; tool: string; input: Record<string, unknown>; description: string }>;
        schedule: string | null;
        workflowName: string;
        agentId: string;
      };

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
          results.push({ step: step.order, tool: 'agent_deploy', result: { agentId: deployResult.agentId, token: deployResult.token, message: 'Agent deployed successfully' } });
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

      // Save workflow to DB
      const supabase = getSupabaseAdmin();
      const { data: wf } = await supabase.from('agent_workflows').insert({
        agent_id: ctx.agentId,
        name: plan.workflowName,
        summary: plan.summary,
        steps: plan.steps,
        schedule: plan.schedule,
        status: 'active',
      }).select('id').single();

      return NextResponse.json({
        executed: true,
        results,
        workflowId: wf?.id ?? null,
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
