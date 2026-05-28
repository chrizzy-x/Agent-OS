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

type WorkflowRow = {
  id: string;
  task_id: string | null;
  steps: unknown;
  schedule: string | null;
  status: string;
};

type ToolExecution = {
  tool: string;
  input: Record<string, unknown>;
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

function normalizeToolName(tool: string): string {
  return tool.replace(/^agentos\./, '');
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseTaskCode(code: string): ToolExecution {
  const parsed = JSON.parse(code) as { tool?: unknown; input?: unknown };
  const input = asObject(parsed.input) ?? {};
  if (typeof parsed.tool !== 'string' || parsed.tool.length === 0) {
    throw new Error('Invalid task tool');
  }
  return { tool: parsed.tool, input };
}

function runnableFromWorkflow(workflow: WorkflowRow): ToolExecution | null {
  const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
  for (const rawStep of [...steps].reverse()) {
    const step = asObject(rawStep);
    if (!step || typeof step.tool !== 'string') continue;
    const input = asObject(step.input) ?? {};
    if (normalizeToolName(step.tool) !== 'proc_schedule') continue;

    const nestedTool = typeof input.tool === 'string' ? input.tool : '';
    const nestedInput = asObject(input.input) ?? {};
    if (nestedTool) return { tool: nestedTool, input: nestedInput };
  }

  for (const rawStep of [...steps].reverse()) {
    const step = asObject(rawStep);
    if (!step || typeof step.tool !== 'string') continue;
    const tool = normalizeToolName(step.tool);
    if (tool === 'proc_schedule') continue;
    return { tool: step.tool, input: asObject(step.input) ?? {} };
  }

  return null;
}

async function updateWorkflowResult(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  agentId: string,
  task: Pick<ScheduledTask, 'id' | 'workflow_id'>,
  patch: Record<string, unknown>,
) {
  if (task.workflow_id) {
    await supabase
      .from('agent_workflows')
      .update(patch)
      .eq('id', task.workflow_id)
      .eq('agent_id', agentId);
  }

  await supabase
    .from('agent_workflows')
    .update(patch)
    .eq('task_id', task.id)
    .eq('agent_id', agentId);
}

export async function POST(request: NextRequest) {
  try {
    const ctx = withStudioDefaultAllowedDomains(requireAgentContext(request.headers));
    const supabase = getSupabaseAdmin();
    let body: { workflowId?: string; force?: boolean } = {};
    try { body = await request.json(); } catch { /* empty body */ }

    let candidateTasks: ScheduledTask[] = [];
    let adHocWorkflow: { workflow: WorkflowRow; execution: ToolExecution } | null = null;

    if (body.workflowId) {
      const { data: workflow, error: workflowError } = await supabase
        .from('agent_workflows')
        .select('id, task_id, steps, schedule, status')
        .eq('id', body.workflowId)
        .eq('agent_id', ctx.agentId)
        .maybeSingle();

      if (workflowError) throw workflowError;
      if (!workflow) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });

      const taskQuery = supabase
        .from('scheduled_tasks')
        .select('id, agent_id, code, language, cron_expression, last_run_at, workflow_id')
        .eq('agent_id', ctx.agentId);

      const { data: task, error: taskError } = workflow.task_id
        ? await taskQuery.eq('id', workflow.task_id).maybeSingle()
        : await taskQuery.eq('workflow_id', workflow.id).maybeSingle();

      if (taskError) throw taskError;
      if (task) {
        candidateTasks = [task as ScheduledTask];
      } else {
        const execution = runnableFromWorkflow(workflow as WorkflowRow);
        if (!execution) return NextResponse.json({ ran: 0, results: [{ workflowId: workflow.id, success: false, error: 'No runnable workflow step found' }] });
        adHocWorkflow = { workflow: workflow as WorkflowRow, execution };
      }
    } else {
      const { data: tasks, error } = await supabase
        .from('scheduled_tasks')
        .select('id, agent_id, code, language, cron_expression, last_run_at, workflow_id')
        .eq('agent_id', ctx.agentId)
        .eq('enabled', true);

      if (error) throw new Error(`Failed to fetch scheduled tasks: ${error.message}`);
      candidateTasks = (tasks ?? []) as ScheduledTask[];
    }

    const dueTasks = candidateTasks.filter(task =>
      task.language === 'tool' && (body.force || isDue(task.last_run_at, task.cron_expression)),
    );
    const results: Array<{ taskId?: string; workflowId?: string | null; tool: string; success: boolean; result?: unknown; error?: string }> = [];

    if (adHocWorkflow) {
      const { workflow, execution } = adHocWorkflow;
      try {
        const result = await executeUniversalToolCall({
          agentContext: ctx,
          name: execution.tool,
          server: undefined,
          arguments: execution.input,
        });
        const ranAt = new Date().toISOString();

        await supabase
          .from('agent_workflows')
          .update({ last_run_at: ranAt, last_result: result, last_error: null, updated_at: ranAt })
          .eq('id', workflow.id)
          .eq('agent_id', ctx.agentId);

        results.push({ workflowId: workflow.id, tool: execution.tool, success: true, result });
      } catch (err) {
        const ranAt = new Date().toISOString();
        const message = err instanceof Error ? err.message : String(err);

        await supabase
          .from('agent_workflows')
          .update({ last_run_at: ranAt, last_error: message, updated_at: ranAt })
          .eq('id', workflow.id)
          .eq('agent_id', ctx.agentId);

        results.push({ workflowId: workflow.id, tool: execution.tool, success: false, error: message });
      }
    }

    for (const task of dueTasks) {
      let parsed: ToolExecution;
      try {
        parsed = parseTaskCode(task.code);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid task code JSON';
        results.push({ taskId: task.id, workflowId: task.workflow_id, tool: 'unknown', success: false, error: message });
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

        await updateWorkflowResult(supabase, ctx.agentId, task, { last_run_at: ranAt, last_result: result, last_error: null, updated_at: ranAt });

        results.push({ taskId: task.id, workflowId: task.workflow_id, tool: parsed.tool, success: true, result });
      } catch (err) {
        const ranAt = new Date().toISOString();
        const message = err instanceof Error ? err.message : String(err);

        await supabase
          .from('scheduled_tasks')
          .update({ last_run_at: ranAt, last_error: message, last_success: false })
          .eq('id', task.id)
          .eq('agent_id', ctx.agentId);

        await updateWorkflowResult(supabase, ctx.agentId, task, { last_run_at: ranAt, last_error: message, updated_at: ranAt });

        results.push({ taskId: task.id, workflowId: task.workflow_id, tool: parsed.tool, success: false, error: message });
      }
    }

    if (body.workflowId && results.length === 0) {
      const { data: workflow } = await supabase
        .from('agent_workflows')
        .select('id, task_id, steps, schedule, status')
        .eq('id', body.workflowId)
        .eq('agent_id', ctx.agentId)
        .maybeSingle();

      if (workflow) {
        const execution = runnableFromWorkflow(workflow as WorkflowRow);
        if (execution) {
          try {
            const result = await executeUniversalToolCall({
              agentContext: ctx,
              name: execution.tool,
              server: undefined,
              arguments: execution.input,
            });
            const ranAt = new Date().toISOString();
            await supabase
              .from('agent_workflows')
              .update({ last_run_at: ranAt, last_result: result, last_error: null, updated_at: ranAt })
              .eq('id', workflow.id)
              .eq('agent_id', ctx.agentId);
            results.push({ workflowId: workflow.id, tool: execution.tool, success: true, result });
          } catch (err) {
            const ranAt = new Date().toISOString();
            const message = err instanceof Error ? err.message : String(err);
            await supabase
              .from('agent_workflows')
              .update({ last_run_at: ranAt, last_error: message, updated_at: ranAt })
              .eq('id', workflow.id)
              .eq('agent_id', ctx.agentId);
            results.push({ workflowId: workflow.id, tool: execution.tool, success: false, error: message });
          }
        }
      }
    }

    return NextResponse.json({ ran: results.length, results });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
