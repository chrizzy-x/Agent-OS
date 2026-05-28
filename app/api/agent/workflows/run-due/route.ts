import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { executeUniversalToolCall } from '@/src/mcp/registry';
import { withStudioDefaultAllowedDomains } from '@/src/studio/domains';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

type ScheduledTask = {
  id: string;
  agent_id: string;
  code: string;
  language: string;
  cron_expression: string;
  last_run_at: string | null;
  workflow_id: string | null;
};

function parseCronIntervalMs(expression: string): number | null {
  const everyMin = expression.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (everyMin) return parseInt(everyMin[1], 10) * 60 * 1000;

  const everyHour = expression.match(/^0\s+\*\/(\d+)\s+\*\s+\*\s+\*$/);
  if (everyHour) return parseInt(everyHour[1], 10) * 60 * 60 * 1000;

  if (/^(?:\*|\*\/1)\s+\*\s+\*\s+\*\s+\*$/.test(expression)) return 60 * 1000;
  if (/^0\s+\*\s+\*\s+\*\s+\*$/.test(expression)) return 60 * 60 * 1000;
  if (/^0\s+0\s+\*\s+\*\s+\*$/.test(expression)) return 24 * 60 * 60 * 1000;
  if (expression === '@hourly') return 60 * 60 * 1000;
  if (expression === '@daily' || expression === '@midnight') return 24 * 60 * 60 * 1000;

  return null;
}

function isDue(lastRunAt: string | null, expression: string): boolean {
  if (!lastRunAt) return true;
  const intervalMs = parseCronIntervalMs(expression);
  if (!intervalMs) return false;
  return Date.now() - new Date(lastRunAt).getTime() >= intervalMs;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = withStudioDefaultAllowedDomains(requireAgentContext(request.headers));
    const supabase = getSupabaseAdmin();
    const { data: tasks, error } = await supabase
      .from('scheduled_tasks')
      .select('id, agent_id, code, language, cron_expression, last_run_at, workflow_id')
      .eq('agent_id', ctx.agentId)
      .eq('enabled', true);

    if (error) throw new Error(`Failed to fetch scheduled tasks: ${error.message}`);

    const dueTasks = ((tasks ?? []) as ScheduledTask[]).filter(task =>
      task.language === 'tool' && isDue(task.last_run_at, task.cron_expression),
    );
    const results: Array<{ taskId: string; tool: string; success: boolean; error?: string }> = [];

    for (const task of dueTasks) {
      let parsed: { tool: string; input: Record<string, unknown> };
      try {
        parsed = JSON.parse(task.code) as typeof parsed;
      } catch {
        results.push({ taskId: task.id, tool: 'unknown', success: false, error: 'Invalid task code JSON' });
        continue;
      }

      try {
        const result = await executeUniversalToolCall({
          agentContext: ctx,
          name: parsed.tool,
          server: undefined,
          arguments: parsed.input,
        });
        const ranAt = new Date().toISOString();

        await supabase
          .from('scheduled_tasks')
          .update({ last_run_at: ranAt, last_result: result, last_error: null, last_success: true })
          .eq('id', task.id)
          .eq('agent_id', ctx.agentId);

        if (task.workflow_id) {
          await supabase
            .from('agent_workflows')
            .update({ last_run_at: ranAt, last_result: result, last_error: null, updated_at: ranAt })
            .eq('id', task.workflow_id)
            .eq('agent_id', ctx.agentId);
        }

        results.push({ taskId: task.id, tool: parsed.tool, success: true });
      } catch (err) {
        const ranAt = new Date().toISOString();
        const message = err instanceof Error ? err.message : String(err);

        await supabase
          .from('scheduled_tasks')
          .update({ last_run_at: ranAt, last_error: message, last_success: false })
          .eq('id', task.id)
          .eq('agent_id', ctx.agentId);

        if (task.workflow_id) {
          await supabase
            .from('agent_workflows')
            .update({ last_run_at: ranAt, last_error: message, updated_at: ranAt })
            .eq('id', task.workflow_id)
            .eq('agent_id', ctx.agentId);
        }

        results.push({ taskId: task.id, tool: parsed.tool, success: false, error: message });
      }
    }

    return NextResponse.json({ ran: results.length, results });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
