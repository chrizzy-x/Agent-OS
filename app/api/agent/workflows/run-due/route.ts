import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { executeUniversalToolCall } from '@/src/mcp/registry';
import { appendExecutionLog, createExecution, updateExecution } from '@/src/execution/service';
import { withStudioDefaultAllowedDomains } from '@/src/studio/domains';
import { logOperation } from '@/src/runtime/audit';
import { toErrorResponse } from '@/src/utils/errors';
import { sanitizeErrorMessage, sanitizeOutput } from '@/src/utils/output-sanitizer';
import { hydrateWorkflowDocument } from '@/src/workflows/canonical';

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
  graph_state?: unknown;
  code_state?: string | null;
  canonical_doc?: unknown;
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
  let steps: unknown[] = Array.isArray(workflow.steps) ? workflow.steps : [];
  try {
    const hydrated = hydrateWorkflowDocument({
      canonicalDoc: workflow.canonical_doc,
      steps: workflow.steps,
      graphState: workflow.graph_state,
      codeState: workflow.code_state ?? null,
    });
    steps = hydrated.steps;
  } catch {
    // fallback to legacy steps payload
  }
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
  let executionId: string | null = null;
  let executionOwner: string | null = null;
  try {
    const ctx = withStudioDefaultAllowedDomains(await requireRouteCapability(request.headers, 'workflows.run'));
    executionOwner = ctx.agentId;
    const supabase = getSupabaseAdmin();
    let body: { workflowId?: string; force?: boolean } = {};
    try { body = await request.json(); } catch { /* empty body */ }
    const startedAt = Date.now();
    const execution = await createExecution({
      agentId: ctx.agentId,
      sourceType: 'workflow',
      type: 'WORKFLOW_EXECUTION',
      sourceId: body.workflowId ?? 'due',
      workflowId: body.workflowId ?? null,
      title: body.workflowId ? `Run workflow ${body.workflowId}` : 'Run due workflows',
      input: body,
    });
    executionId = execution.id;
    await updateExecution({
      agentId: ctx.agentId,
      executionId,
      patch: {
        status: 'RUNNING',
        startedAt: new Date(startedAt).toISOString(),
        metadata: {
          resumeCheckpoint: {
            workflowId: body.workflowId ?? null,
            nodePosition: 0,
            variables: {},
            pendingToolCalls: [],
            memoryState: {},
          },
        },
      },
    });
    await appendExecutionLog({
      agentId: ctx.agentId,
      executionId,
      message: 'Workflow execution started',
      data: body,
    });

    let candidateTasks: ScheduledTask[] = [];
    let adHocWorkflow: { workflow: WorkflowRow; execution: ToolExecution } | null = null;

    if (body.workflowId) {
      const { data: workflow, error: workflowError } = await supabase
        .from('agent_workflows')
        .select('id, task_id, steps, graph_state, code_state, canonical_doc, schedule, status')
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
        const result = sanitizeOutput(await executeUniversalToolCall({
          agentContext: ctx,
          name: execution.tool,
          server: undefined,
          arguments: execution.input,
        }));
        const ranAt = new Date().toISOString();

        await supabase
          .from('agent_workflows')
          .update({ last_run_at: ranAt, last_result: result, last_error: null, updated_at: ranAt })
          .eq('id', workflow.id)
          .eq('agent_id', ctx.agentId);

        await logOperation({
          agentId: ctx.agentId,
          primitive: 'workflow',
          operation: 'run',
          success: true,
          metadata: { workflowId: workflow.id, tool: execution.tool, result },
        });

        results.push({ workflowId: workflow.id, tool: execution.tool, success: true, result });
      } catch (err) {
        const ranAt = new Date().toISOString();
        const message = sanitizeErrorMessage(err);

        await supabase
          .from('agent_workflows')
          .update({ last_run_at: ranAt, last_error: message, updated_at: ranAt })
          .eq('id', workflow.id)
          .eq('agent_id', ctx.agentId);

        await logOperation({
          agentId: ctx.agentId,
          primitive: 'workflow',
          operation: 'run',
          success: false,
          error: message,
          metadata: { workflowId: workflow.id, tool: execution.tool },
        });

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
        const result = sanitizeOutput(await executeUniversalToolCall({
          agentContext: ctx,
          name: parsed.tool,
          server: undefined,
          arguments: parsed.input,
        }));
        const ranAt = new Date().toISOString();

        await supabase
          .from('scheduled_tasks')
          .update({ last_run_at: ranAt, last_result: result, last_error: null, last_success: true })
          .eq('id', task.id)
          .eq('agent_id', ctx.agentId);

        await updateWorkflowResult(supabase, ctx.agentId, task, { last_run_at: ranAt, last_result: result, last_error: null, updated_at: ranAt });

        await logOperation({
          agentId: ctx.agentId,
          primitive: 'workflow',
          operation: 'run',
          success: true,
          metadata: { workflowId: task.workflow_id, taskId: task.id, tool: parsed.tool, result },
        });

        results.push({ taskId: task.id, workflowId: task.workflow_id, tool: parsed.tool, success: true, result });
      } catch (err) {
        const ranAt = new Date().toISOString();
        const message = sanitizeErrorMessage(err);

        await supabase
          .from('scheduled_tasks')
          .update({ last_run_at: ranAt, last_error: message, last_success: false })
          .eq('id', task.id)
          .eq('agent_id', ctx.agentId);

        await updateWorkflowResult(supabase, ctx.agentId, task, { last_run_at: ranAt, last_error: message, updated_at: ranAt });

        await logOperation({
          agentId: ctx.agentId,
          primitive: 'workflow',
          operation: 'run',
          success: false,
          error: message,
          metadata: { workflowId: task.workflow_id, taskId: task.id, tool: parsed.tool },
        });

        results.push({ taskId: task.id, workflowId: task.workflow_id, tool: parsed.tool, success: false, error: message });
      }
    }

    if (body.workflowId && results.length === 0) {
      const { data: workflow } = await supabase
        .from('agent_workflows')
        .select('id, task_id, steps, graph_state, code_state, canonical_doc, schedule, status')
        .eq('id', body.workflowId)
        .eq('agent_id', ctx.agentId)
        .maybeSingle();

      if (workflow) {
        const execution = runnableFromWorkflow(workflow as WorkflowRow);
        if (execution) {
          try {
            const result = sanitizeOutput(await executeUniversalToolCall({
              agentContext: ctx,
              name: execution.tool,
              server: undefined,
              arguments: execution.input,
            }));
            const ranAt = new Date().toISOString();
            await supabase
              .from('agent_workflows')
              .update({ last_run_at: ranAt, last_result: result, last_error: null, updated_at: ranAt })
              .eq('id', workflow.id)
              .eq('agent_id', ctx.agentId);
            await logOperation({
              agentId: ctx.agentId,
              primitive: 'workflow',
              operation: 'run',
              success: true,
              metadata: { workflowId: workflow.id, tool: execution.tool, result },
            });
            results.push({ workflowId: workflow.id, tool: execution.tool, success: true, result });
          } catch (err) {
            const ranAt = new Date().toISOString();
            const message = sanitizeErrorMessage(err);
            await supabase
              .from('agent_workflows')
              .update({ last_run_at: ranAt, last_error: message, updated_at: ranAt })
              .eq('id', workflow.id)
              .eq('agent_id', ctx.agentId);
            await logOperation({
              agentId: ctx.agentId,
              primitive: 'workflow',
              operation: 'run',
              success: false,
              error: message,
              metadata: { workflowId: workflow.id, tool: execution.tool },
            });
            results.push({ workflowId: workflow.id, tool: execution.tool, success: false, error: message });
          }
        }
      }
    }

    const output = { ran: results.length, results: sanitizeOutput(results) };
    const failures = results.filter(item => !item.success);
    const failure = failures.length > 0 ? {
      whatFailed: `${failures.length} workflow step${failures.length === 1 ? '' : 's'} failed`,
      why: failures.map(item => item.error).filter(Boolean).join('; '),
      where: 'workflow runtime',
      possibleFix: 'Inspect workflow logs, fix the failing node input or tool, then retry the run.',
    } : null;
    await updateExecution({
      agentId: ctx.agentId,
      executionId,
      patch: {
        status: failures.length === 0 ? 'COMPLETED' : 'FAILED',
        output,
        error: failure,
        failure,
        durationMs: Date.now() - startedAt,
        completedAt: new Date().toISOString(),
      },
    });
    await appendExecutionLog({
      agentId: ctx.agentId,
      executionId,
      level: failures.length > 0 ? 'warning' : 'info',
      message: failures.length > 0 ? 'Workflow execution partially failed' : 'Workflow execution completed',
      data: output,
    });
    return NextResponse.json({ ...output, executionId });
  } catch (error: unknown) {
    if (executionId && executionOwner) {
      const failure = {
        whatFailed: sanitizeErrorMessage(error),
        why: sanitizeErrorMessage(error),
        where: 'workflow runtime',
        possibleFix: 'Inspect workflow configuration and retry the run.',
      };
      await updateExecution({
        agentId: executionOwner,
        executionId,
        patch: {
          status: 'FAILED',
          error: failure,
          failure,
          completedAt: new Date().toISOString(),
        },
      }).catch(() => undefined);
    }
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
