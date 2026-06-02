import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { executeUniversalToolCall } from '@/src/mcp/registry';
import { requireCronAccess } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';
import { DEFAULT_QUOTAS } from '@/src/auth/permissions';
import { logOperation } from '@/src/runtime/audit';
import { sanitizeErrorMessage, sanitizeOutput } from '@/src/utils/output-sanitizer';
import type { AgentContext } from '@/src/auth/permissions';

export const runtime = 'nodejs';

function parseCronIntervalMs(expression: string): number | null {
  // */N * * * *  → every N minutes
  const everyMin = expression.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (everyMin) return parseInt(everyMin[1], 10) * 60 * 1000;

  // 0 */N * * *  → every N hours
  const everyHour = expression.match(/^0\s+\*\/(\d+)\s+\*\s+\*\s+\*$/);
  if (everyHour) return parseInt(everyHour[1], 10) * 60 * 60 * 1000;

  // 0 * * * *   → every hour
  if (/^0\s+\*\s+\*\s+\*\s+\*$/.test(expression)) return 60 * 60 * 1000;
  if (/^(?:\*|\*\/1)\s+\*\s+\*\s+\*\s+\*$/.test(expression)) return 60 * 1000;

  // 0 0 * * *   → every day
  if (/^0\s+0\s+\*\s+\*\s+\*$/.test(expression)) return 24 * 60 * 60 * 1000;

  // @hourly
  if (expression === '@hourly') return 60 * 60 * 1000;

  // @daily
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
    requireCronAccess(request.headers);

    const supabase = getSupabaseAdmin();
    const { data: tasks, error } = await supabase
      .from('scheduled_tasks')
      .select('id, agent_id, code, language, cron_expression, last_run_at, workflow_id')
      .eq('enabled', true);

    if (error) throw new Error(`Failed to fetch scheduled tasks: ${error.message}`);

    const dueTasks = (tasks ?? []).filter(t =>
      t.language === 'tool' && isDue(t.last_run_at as string | null, t.cron_expression as string),
    );

    const results: Array<{ taskId: string; tool: string; success: boolean; error?: string }> = [];

    for (const task of dueTasks) {
      let parsed: { tool: string; input: Record<string, unknown> };
      try {
        parsed = JSON.parse(task.code as string) as typeof parsed;
      } catch {
        results.push({ taskId: task.id as string, tool: 'unknown', success: false, error: 'Invalid task code JSON' });
        continue;
      }

      const agentCtx: AgentContext = {
        agentId: task.agent_id as string,
        allowedDomains: ['*'],
        quotas: DEFAULT_QUOTAS,
        tier: 'free',
      };

      try {
        const result = sanitizeOutput(await executeUniversalToolCall({
          agentContext: agentCtx,
          name: parsed.tool,
          server: undefined,
          arguments: parsed.input,
        }));

        const ranAt = new Date().toISOString();
        await supabase
          .from('scheduled_tasks')
          .update({
            last_run_at: ranAt,
            last_result: result,
            last_error: null,
            last_success: true,
          })
          .eq('id', task.id);

        if (task.workflow_id) {
          await supabase
            .from('agent_workflows')
            .update({
              last_run_at: ranAt,
              last_result: result,
              last_error: null,
              updated_at: ranAt,
            })
            .eq('id', task.workflow_id);
        }

        await logOperation({
          agentId: task.agent_id as string,
          primitive: 'workflow',
          operation: 'run',
          success: true,
          metadata: { workflowId: task.workflow_id, taskId: task.id, tool: parsed.tool, result },
        });

        results.push({ taskId: task.id as string, tool: parsed.tool, success: true });
      } catch (err) {
        const ranAt = new Date().toISOString();
        const message = sanitizeErrorMessage(err);
        await supabase
          .from('scheduled_tasks')
          .update({
            last_run_at: ranAt,
            last_error: message,
            last_success: false,
          })
          .eq('id', task.id);

        if (task.workflow_id) {
          await supabase
            .from('agent_workflows')
            .update({
              last_run_at: ranAt,
              last_error: message,
              updated_at: ranAt,
            })
            .eq('id', task.workflow_id);
        }

        await logOperation({
          agentId: task.agent_id as string,
          primitive: 'workflow',
          operation: 'run',
          success: false,
          error: message,
          metadata: { workflowId: task.workflow_id, taskId: task.id, tool: parsed.tool },
        });

        results.push({
          taskId: task.id as string,
          tool: parsed.tool,
          success: false,
          error: message,
        });
      }
    }

    return NextResponse.json({ ran: results.length, results: sanitizeOutput(results) });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
