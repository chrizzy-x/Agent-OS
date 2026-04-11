import { z } from 'zod';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { executeCode, type SupportedLanguage } from '../runtime/sandbox.js';
import { withAudit } from '../runtime/audit.js';
import { validate } from '../utils/validation.js';
import { NotFoundError } from '../utils/errors.js';
import { createAgentToken } from '../auth/agent-identity.js';
import { randomUUID } from 'crypto';
import { getFFPClient } from '../ffp/client.js';
import { readLocalRuntimeState, updateLocalRuntimeState } from '../storage/local-state.js';
import type { AgentContext } from '../auth/permissions.js';

const MAX_TIMEOUT = 5 * 60 * 1000;

async function withProcFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await primary();
  } catch {
    return fallback();
  }
}

function toLocalProcessRow(process: {
  id: string;
  language: string;
  status: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number | null;
  createdAt: string;
  completedAt: string | null;
}): Record<string, unknown> {
  return {
    id: process.id,
    language: process.language,
    status: process.status,
    exit_code: process.exitCode,
    duration_ms: process.durationMs,
    created_at: process.createdAt,
    completed_at: process.completedAt,
  };
}

function toLocalTaskRow(task: {
  id: string;
  language: string;
  cronExpression: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
}): Record<string, unknown> {
  return {
    id: task.id,
    language: task.language,
    cron_expression: task.cronExpression,
    enabled: task.enabled,
    last_run_at: task.lastRunAt,
    next_run_at: task.nextRunAt,
    created_at: task.createdAt,
  };
}

export async function procExecute(
  ctx: AgentContext,
  input: unknown,
): Promise<{ processId: string; stdout: string; stderr: string; exitCode: number; durationMs: number }> {
  const { code, language, timeout } = validate(
    z.object({
      code: z.string().min(1).max(1_000_000),
      language: z.enum(['python', 'javascript', 'bash']),
      timeout: z.number().int().min(100).max(MAX_TIMEOUT).optional().default(30_000),
    }),
    input,
  );

  return withAudit({ agentId: ctx.agentId, primitive: 'proc', operation: 'execute', metadata: { language } }, async () => {
    const result = await withProcFallback(async () => {
      const processId = randomUUID();
      const supabase = getSupabaseAdmin();
      await supabase.from('agent_processes').insert({
        id: processId,
        agent_id: ctx.agentId,
        language,
        status: 'running',
      });

      try {
        const execution = await executeCode(code, language as SupportedLanguage, timeout);
        await supabase.from('agent_processes').update({
          status: execution.exitCode === 0 ? 'completed' : 'failed',
          exit_code: execution.exitCode,
          stdout: execution.stdout.slice(0, 100_000),
          stderr: execution.stderr.slice(0, 100_000),
          duration_ms: execution.durationMs,
          completed_at: new Date().toISOString(),
        }).eq('id', processId);
        return { processId, ...execution };
      } catch (error) {
        await supabase.from('agent_processes').update({
          status: 'failed',
          stderr: error instanceof Error ? error.message : String(error),
          completed_at: new Date().toISOString(),
        }).eq('id', processId);
        throw error;
      }
    }, async () => {
      const processId = randomUUID();
      await updateLocalRuntimeState(state => {
        state.processes[ctx.agentId] ??= [];
        state.processes[ctx.agentId].push({
          id: processId,
          language,
          status: 'running',
          command: null,
          stdout: '',
          stderr: '',
          exitCode: null,
          durationMs: null,
          createdAt: new Date().toISOString(),
          completedAt: null,
        });
      });

      try {
        const execution = await executeCode(code, language as SupportedLanguage, timeout);
        await updateLocalRuntimeState(state => {
          const process = (state.processes[ctx.agentId] ?? []).find(item => item.id === processId);
          if (process) {
            process.status = execution.exitCode === 0 ? 'completed' : 'failed';
            process.stdout = execution.stdout.slice(0, 100_000);
            process.stderr = execution.stderr.slice(0, 100_000);
            process.exitCode = execution.exitCode;
            process.durationMs = execution.durationMs;
            process.completedAt = new Date().toISOString();
          }
        });
        return { processId, ...execution };
      } catch (error) {
        await updateLocalRuntimeState(state => {
          const process = (state.processes[ctx.agentId] ?? []).find(item => item.id === processId);
          if (process) {
            process.status = 'failed';
            process.stderr = error instanceof Error ? error.message : String(error);
            process.completedAt = new Date().toISOString();
          }
        });
        throw error;
      }
    });

    void getFFPClient().log({ primitive: 'proc', action: 'execute', params: { language }, result: { processId: result.processId, exitCode: result.exitCode, durationMs: result.durationMs }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function procSchedule(
  ctx: AgentContext,
  input: unknown,
): Promise<{ taskId: string; cronExpression: string; language: string }> {
  const { code, language, cronExpression } = validate(
    z.object({
      code: z.string().min(1).max(1_000_000),
      language: z.enum(['python', 'javascript', 'bash']),
      cronExpression: z.string().min(1).max(100),
    }),
    input,
  );

  return withAudit({ agentId: ctx.agentId, primitive: 'proc', operation: 'schedule', metadata: { language, cronExpression } }, async () => {
    const result = await withProcFallback(async () => {
      const supabase = getSupabaseAdmin();
      const taskId = randomUUID();
      const { error } = await supabase.from('scheduled_tasks').insert({
        id: taskId,
        agent_id: ctx.agentId,
        code,
        language,
        cron_expression: cronExpression,
        enabled: true,
      });

      if (error) {
        throw new Error(`Failed to schedule task: ${error.message}`);
      }

      return { taskId, cronExpression, language };
    }, async () => {
      const taskId = randomUUID();
      await updateLocalRuntimeState(state => {
        state.scheduledTasks[ctx.agentId] ??= [];
        state.scheduledTasks[ctx.agentId].push({
          id: taskId,
          language,
          cronExpression,
          code,
          enabled: true,
          createdAt: new Date().toISOString(),
          lastRunAt: null,
          nextRunAt: null,
        });
      });
      return { taskId, cronExpression, language };
    });

    void getFFPClient().log({ primitive: 'proc', action: 'schedule', params: { language, cronExpression }, result: { taskId: result.taskId }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function procSpawn(ctx: AgentContext, input: unknown): Promise<{ childAgentId: string; token: string; pid?: string }> {
  const { config, command } = validate(
    z.object({
      command: z.string().min(1).max(500).optional(),
      config: z.object({
        name: z.string().max(100).optional(),
        allowedDomains: z.array(z.string()).default([]),
      }).optional(),
    }),
    input,
  );

  return withAudit({ agentId: ctx.agentId, primitive: 'proc', operation: 'spawn' }, async () => {
    if (typeof command === 'string' && command.trim().length > 0) {
      const processId = randomUUID();
      await updateLocalRuntimeState(state => {
        state.processes[ctx.agentId] ??= [];
        state.processes[ctx.agentId].push({
          id: processId,
          language: 'bash',
          status: 'running',
          command,
          stdout: '',
          stderr: '',
          exitCode: null,
          durationMs: null,
          createdAt: new Date().toISOString(),
          completedAt: null,
        });
      });

      return { childAgentId: processId, token: '', pid: processId };
    }

    const childConfig = config ?? { name: undefined, allowedDomains: [] };
    const result = await withProcFallback(async () => {
      const childAgentId = `${ctx.agentId}_child_${randomUUID().slice(0, 8)}`;
      const supabase = getSupabaseAdmin();
      await supabase.from('agents').insert({
        id: childAgentId,
        name: childConfig.name ?? `Child of ${ctx.agentId}`,
        quotas: ctx.quotas,
        metadata: { parentAgentId: ctx.agentId },
      });

      const token = createAgentToken(childAgentId, {
        allowedDomains: childConfig.allowedDomains,
        expiresIn: '24h',
      });

      return { childAgentId, token };
    }, async () => {
      const childAgentId = `${ctx.agentId}_child_${randomUUID().slice(0, 8)}`;
      const token = createAgentToken(childAgentId, {
        allowedDomains: childConfig.allowedDomains,
        expiresIn: '24h',
      });
      return { childAgentId, token };
    });

    void getFFPClient().log({ primitive: 'proc', action: 'spawn', params: { parentAgentId: ctx.agentId }, result: { childAgentId: result.childAgentId }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function procKill(ctx: AgentContext, input: unknown): Promise<{ processId: string; killed: boolean }> {
  const { processId } = validate(z.object({ processId: z.string().min(1).max(128) }), input);

  return withAudit({ agentId: ctx.agentId, primitive: 'proc', operation: 'kill', metadata: { processId } }, async () => {
    return withProcFallback(async () => {
      const supabase = getSupabaseAdmin();
      const { data: proc } = await supabase
        .from('agent_processes')
        .select('status')
        .eq('id', processId)
        .eq('agent_id', ctx.agentId)
        .single();

      if (proc) {
        if (proc.status !== 'running') {
          return { processId, killed: false };
        }

        await supabase.from('agent_processes').update({ status: 'killed', completed_at: new Date().toISOString() }).eq('id', processId);
        return { processId, killed: true };
      }

      const { data: task } = await supabase
        .from('scheduled_tasks')
        .select('enabled')
        .eq('id', processId)
        .eq('agent_id', ctx.agentId)
        .single();

      if (task) {
        await supabase.from('scheduled_tasks').update({ enabled: false }).eq('id', processId);
        return { processId, killed: true };
      }

      throw new NotFoundError(`Process not found: ${processId}`);
    }, async () => {
      return updateLocalRuntimeState(state => {
        const processes = state.processes[ctx.agentId] ?? [];
        const process = processes.find(item => item.id === processId);
        if (process) {
          if (process.status !== 'running') {
            return { processId, killed: false };
          }

          process.status = 'killed';
          process.completedAt = new Date().toISOString();
          return { processId, killed: true };
        }

        const tasks = state.scheduledTasks[ctx.agentId] ?? [];
        const task = tasks.find(item => item.id === processId);
        if (task) {
          task.enabled = false;
          return { processId, killed: true };
        }

        throw new NotFoundError(`Process not found: ${processId}`);
      });
    });
  });
}

export async function procList(
  ctx: AgentContext,
  input: unknown,
): Promise<{ processes: unknown[]; scheduledTasks: unknown[] }> {
  const { status, limit } = validate(
    z.object({
      status: z.enum(['running', 'completed', 'failed', 'killed', 'all']).default('all'),
      limit: z.number().int().min(1).max(100).default(20),
    }),
    input,
  );

  return withAudit({ agentId: ctx.agentId, primitive: 'proc', operation: 'list' }, async () => {
    return withProcFallback(async () => {
      const supabase = getSupabaseAdmin();
      let query = supabase
        .from('agent_processes')
        .select('id, language, status, exit_code, duration_ms, created_at, completed_at')
        .eq('agent_id', ctx.agentId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      const { data: processes, error: procError } = await query;
      if (procError) {
        throw new Error(`Failed to list processes: ${procError.message}`);
      }

      const { data: tasks, error: taskError } = await supabase
        .from('scheduled_tasks')
        .select('id, language, cron_expression, enabled, last_run_at, next_run_at, created_at')
        .eq('agent_id', ctx.agentId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (taskError) {
        throw new Error(`Failed to list tasks: ${taskError.message}`);
      }

      return {
        processes: processes ?? [],
        scheduledTasks: tasks ?? [],
      };
    }, async () => {
      const state = await readLocalRuntimeState();
      const processes = (state.processes[ctx.agentId] ?? [])
        .filter(process => status === 'all' || process.status === status)
        .slice(0, limit)
        .map(toLocalProcessRow);
      const scheduledTasks = (state.scheduledTasks[ctx.agentId] ?? []).slice(0, limit).map(toLocalTaskRow);
      return { processes, scheduledTasks };
    });
  });
}
