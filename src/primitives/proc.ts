import { z } from 'zod';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { executeCode, SupportedLanguage } from '../runtime/sandbox.js';
import { withAudit } from '../runtime/audit.js';
import { validate } from '../utils/validation.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { createAgentToken } from '../auth/agent-identity.js';
import { randomUUID } from 'crypto';
import { getFFPClient } from '../ffp/client.js';
import type { AgentContext } from '../auth/permissions.js';

const MAX_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Execute code in a sandboxed subprocess. Returns stdout, stderr, and exit code.
export async function procExecute(
  ctx: AgentContext,
  input: unknown
): Promise<{ processId: string; stdout: string; stderr: string; exitCode: number; durationMs: number }> {
  const { code, language, timeout } = validate(
    z.object({
      code: z.string().min(1).max(1_000_000),
      language: z.enum(['python', 'javascript', 'bash']),
      timeout: z.number().int().min(1000).max(MAX_TIMEOUT).optional().default(30_000),
    }),
    input
  );

  return withAudit(
    { agentId: ctx.agentId, primitive: 'proc', operation: 'execute', metadata: { language } },
    async () => {
      const processId = randomUUID();
      const supabase = getSupabaseAdmin();

      // Record the process as "running" before execution
      await supabase.from('agent_processes').insert({
        id: processId,
        agent_id: ctx.agentId,
        language,
        status: 'running',
      });

      try {
        const result = await executeCode(code, language as SupportedLanguage, timeout);

        // Update process record with results
        await supabase.from('agent_processes').update({
          status: result.exitCode === 0 ? 'completed' : 'failed',
          exit_code: result.exitCode,
          stdout: result.stdout.slice(0, 100_000), // Limit stored output to 100KB
          stderr: result.stderr.slice(0, 100_000),
          duration_ms: result.durationMs,
          completed_at: new Date().toISOString(),
        }).eq('id', processId);

        const execResult = { processId, ...result };
        void getFFPClient().log({ primitive: 'proc', action: 'execute', params: { language }, result: { processId, exitCode: result.exitCode, durationMs: result.durationMs }, timestamp: Date.now(), agentId: ctx.agentId });
        return execResult;
      } catch (err) {
        await supabase.from('agent_processes').update({
          status: 'failed',
          stderr: err instanceof Error ? err.message : String(err),
          completed_at: new Date().toISOString(),
        }).eq('id', processId);

        throw err;
      }
    }
  );
}

// Schedule a recurring code execution using a cron expression.
export async function procSchedule(
  ctx: AgentContext,
  input: unknown
): Promise<{ taskId: string; cronExpression: string; language: string }> {
  const { code, language, cronExpression } = validate(
    z.object({
      code: z.string().min(1).max(1_000_000),
      language: z.enum(['python', 'javascript', 'bash']),
      cronExpression: z.string().min(1).max(100),
    }),
    input
  );

  return withAudit(
    { agentId: ctx.agentId, primitive: 'proc', operation: 'schedule', metadata: { language, cronExpression } },
    async () => {
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

      void getFFPClient().log({ primitive: 'proc', action: 'schedule', params: { language, cronExpression }, result: { taskId }, timestamp: Date.now(), agentId: ctx.agentId });
      return { taskId, cronExpression, language };
    }
  );
}

// Spawn a child agent — creates a new agent identity and returns its token.
// The caller is responsible for actually running the child agent with this token.
export async function procSpawn(
  ctx: AgentContext,
  input: unknown
): Promise<{ childAgentId: string; token: string }> {
  const { config } = validate(
    z.object({
      config: z.object({
        name: z.string().max(100).optional(),
        allowedDomains: z.array(z.string()).default([]),
      }).default({}),
    }),
    input
  );

  return withAudit(
    { agentId: ctx.agentId, primitive: 'proc', operation: 'spawn' },
    async () => {
      const childAgentId = `${ctx.agentId}_child_${randomUUID().slice(0, 8)}`;
      const supabase = getSupabaseAdmin();

      // Register child agent
      await supabase.from('agents').insert({
        id: childAgentId,
        name: config.name ?? `Child of ${ctx.agentId}`,
        quotas: ctx.quotas, // Inherit parent quotas
        metadata: { parentAgentId: ctx.agentId },
      });

      // Create token for child agent (expires in 24h)
      const token = createAgentToken(childAgentId, {
        allowedDomains: config.allowedDomains,
        expiresIn: '24h',
      });

      void getFFPClient().log({ primitive: 'proc', action: 'spawn', params: { parentAgentId: ctx.agentId }, result: { childAgentId }, timestamp: Date.now(), agentId: ctx.agentId });
      return { childAgentId, token };
    }
  );
}

// Kill a running or scheduled process.
export async function procKill(
  ctx: AgentContext,
  input: unknown
): Promise<{ processId: string; killed: boolean }> {
  const { processId } = validate(
    z.object({ processId: z.string().uuid() }),
    input
  );

  return withAudit(
    { agentId: ctx.agentId, primitive: 'proc', operation: 'kill', metadata: { processId } },
    async () => {
      const supabase = getSupabaseAdmin();

      // Try process table first
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

        await supabase
          .from('agent_processes')
          .update({ status: 'killed', completed_at: new Date().toISOString() })
          .eq('id', processId);

        return { processId, killed: true };
      }

      // Try scheduled tasks
      const { data: task } = await supabase
        .from('scheduled_tasks')
        .select('enabled')
        .eq('id', processId)
        .eq('agent_id', ctx.agentId)
        .single();

      if (task) {
        await supabase
          .from('scheduled_tasks')
          .update({ enabled: false })
          .eq('id', processId);

        return { processId, killed: true };
      }

      throw new NotFoundError(`Process not found: ${processId}`);
    }
  );
}

// List all processes (running, completed, scheduled) for this agent.
export async function procList(
  ctx: AgentContext,
  input: unknown
): Promise<{ processes: unknown[]; scheduledTasks: unknown[] }> {
  const { status, limit } = validate(
    z.object({
      status: z.enum(['running', 'completed', 'failed', 'killed', 'all']).default('all'),
      limit: z.number().int().min(1).max(100).default(20),
    }),
    input
  );

  return withAudit(
    { agentId: ctx.agentId, primitive: 'proc', operation: 'list' },
    async () => {
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
      if (procError) throw new Error(`Failed to list processes: ${procError.message}`);

      const { data: tasks, error: taskError } = await supabase
        .from('scheduled_tasks')
        .select('id, language, cron_expression, enabled, last_run_at, next_run_at, created_at')
        .eq('agent_id', ctx.agentId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (taskError) throw new Error(`Failed to list tasks: ${taskError.message}`);

      return {
        processes: processes ?? [],
        scheduledTasks: tasks ?? [],
      };
    }
  );
}
