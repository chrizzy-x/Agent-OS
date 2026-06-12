import crypto from 'crypto';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { redactSecretsDeep } from '../security/secret-redaction.js';
import { sanitizeErrorMessage, sanitizeOutput } from '../utils/output-sanitizer.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

export type ExecutionStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_user'
  | 'paused'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'cancelled';

export type ExecutionSourceType =
  | 'super_agent'
  | 'app'
  | 'skill'
  | 'workflow'
  | 'mcp'
  | 'primitive'
  | 'file'
  | 'memory'
  | 'system';

export type ExecutionRecord = {
  id: string;
  agentId: string;
  workspaceId: string | null;
  sessionId: string | null;
  sourceType: ExecutionSourceType;
  sourceId: string | null;
  workflowId: string | null;
  appId: string | null;
  skillId: string | null;
  mcpServer: string | null;
  mcpTool: string | null;
  title: string;
  status: ExecutionStatus;
  input: Record<string, unknown>;
  output: unknown;
  failure: Record<string, unknown> | null;
  rollback: Record<string, unknown> | null;
  model: string | null;
  tokenPrompt: number;
  tokenCompletion: number;
  tokenTotal: number;
  estimatedCost: number;
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExecutionLogRecord = {
  id: string;
  executionId: string;
  agentId: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  message: string;
  data: Record<string, unknown>;
  createdAt: string;
};

type ExecutionCreateInput = {
  agentId: string;
  workspaceId?: string | null;
  sessionId?: string | null;
  sourceType: ExecutionSourceType;
  sourceId?: string | null;
  workflowId?: string | null;
  appId?: string | null;
  skillId?: string | null;
  mcpServer?: string | null;
  mcpTool?: string | null;
  title: string;
  input?: Record<string, unknown>;
  model?: string | null;
};

type ExecutionUpdateInput = {
  status?: ExecutionStatus;
  output?: unknown;
  failure?: Record<string, unknown> | null;
  rollback?: Record<string, unknown> | null;
  model?: string | null;
  tokenPrompt?: number;
  tokenCompletion?: number;
  tokenTotal?: number;
  estimatedCost?: number;
  durationMs?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
};

const LOCAL_EXECUTION_PREFIX = 'local-exec-';
const localExecutions = new Map<string, ExecutionRecord>();
const localExecutionLogs = new Map<string, ExecutionLogRecord[]>();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function useLocalExecutionFallback(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.AGENTOS_FORCE_PERSISTED_EXECUTIONS !== '1';
}

function isLocalExecutionId(executionId: string): boolean {
  return executionId.startsWith(LOCAL_EXECUTION_PREFIX);
}

function createLocalExecution(params: ExecutionCreateInput, now = new Date().toISOString()): ExecutionRecord {
  const execution: ExecutionRecord = {
    id: `${LOCAL_EXECUTION_PREFIX}${crypto.randomUUID()}`,
    agentId: params.agentId,
    workspaceId: params.workspaceId ?? null,
    sessionId: params.sessionId ?? null,
    sourceType: params.sourceType,
    sourceId: params.sourceId ?? null,
    workflowId: params.workflowId ?? null,
    appId: params.appId ?? null,
    skillId: params.skillId ?? null,
    mcpServer: params.mcpServer ?? null,
    mcpTool: params.mcpTool ?? null,
    title: params.title.trim().slice(0, 240),
    status: 'queued',
    input: redactSecretsDeep(params.input ?? {}) as Record<string, unknown>,
    output: null,
    failure: null,
    rollback: null,
    model: params.model ?? null,
    tokenPrompt: 0,
    tokenCompletion: 0,
    tokenTotal: 0,
    estimatedCost: 0,
    durationMs: null,
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  localExecutions.set(execution.id, execution);
  localExecutionLogs.set(execution.id, []);
  return execution;
}

function updateLocalExecution(agentId: string, executionId: string, input: ExecutionUpdateInput): ExecutionRecord | null {
  const current = localExecutions.get(executionId);
  if (!current || current.agentId !== agentId) return null;
  const updated: ExecutionRecord = {
    ...current,
    status: input.status ?? current.status,
    output: input.output !== undefined ? sanitizeOutput(input.output) : current.output,
    failure: input.failure !== undefined ? (input.failure ? redactSecretsDeep(input.failure) as Record<string, unknown> : null) : current.failure,
    rollback: input.rollback !== undefined ? (input.rollback ? redactSecretsDeep(input.rollback) as Record<string, unknown> : null) : current.rollback,
    model: input.model !== undefined ? input.model : current.model,
    tokenPrompt: input.tokenPrompt ?? current.tokenPrompt,
    tokenCompletion: input.tokenCompletion ?? current.tokenCompletion,
    tokenTotal: input.tokenTotal ?? current.tokenTotal,
    estimatedCost: input.estimatedCost ?? current.estimatedCost,
    durationMs: input.durationMs !== undefined ? input.durationMs : current.durationMs,
    startedAt: input.startedAt !== undefined ? input.startedAt : current.startedAt,
    completedAt: input.completedAt !== undefined ? input.completedAt : current.completedAt,
    updatedAt: new Date().toISOString(),
  };
  localExecutions.set(executionId, updated);
  return updated;
}

function mapExecution(row: Record<string, unknown>): ExecutionRecord {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : null,
    sessionId: typeof row.session_id === 'string' ? row.session_id : null,
    sourceType: String(row.source_type ?? 'super_agent') as ExecutionSourceType,
    sourceId: typeof row.source_id === 'string' ? row.source_id : null,
    workflowId: typeof row.workflow_id === 'string' ? row.workflow_id : null,
    appId: typeof row.app_id === 'string' ? row.app_id : null,
    skillId: typeof row.skill_id === 'string' ? row.skill_id : null,
    mcpServer: typeof row.mcp_server === 'string' ? row.mcp_server : null,
    mcpTool: typeof row.mcp_tool === 'string' ? row.mcp_tool : null,
    title: String(row.title ?? 'Execution'),
    status: String(row.status ?? 'queued') as ExecutionStatus,
    input: asRecord(row.input),
    output: row.output ?? null,
    failure: row.failure ? asRecord(row.failure) : null,
    rollback: row.rollback ? asRecord(row.rollback) : null,
    model: typeof row.model === 'string' ? row.model : null,
    tokenPrompt: Number(row.token_prompt ?? 0),
    tokenCompletion: Number(row.token_completion ?? 0),
    tokenTotal: Number(row.token_total ?? 0),
    estimatedCost: Number(row.estimated_cost ?? 0),
    durationMs: typeof row.duration_ms === 'number' ? row.duration_ms : null,
    startedAt: typeof row.started_at === 'string' ? row.started_at : null,
    completedAt: typeof row.completed_at === 'string' ? row.completed_at : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function mapLog(row: Record<string, unknown>): ExecutionLogRecord {
  return {
    id: String(row.id),
    executionId: String(row.execution_id),
    agentId: String(row.agent_id),
    level: String(row.level ?? 'info') as ExecutionLogRecord['level'],
    message: String(row.message ?? ''),
    data: asRecord(row.data),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function diagnosticFailure(error: unknown, where: string): Record<string, unknown> {
  const message = sanitizeErrorMessage(error);
  return {
    whatFailed: message || 'Execution failed',
    why: message || 'The runtime returned an unexpected failure.',
    where,
    possibleFix: 'Inspect logs, retry the execution, or adjust the input and run again.',
  };
}

export async function createExecution(params: ExecutionCreateInput): Promise<ExecutionRecord> {
  if (!params.title.trim()) throw new ValidationError('execution title is required');
  const now = new Date().toISOString();
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('agent_executions')
      .insert({
        id: crypto.randomUUID(),
        agent_id: params.agentId,
        workspace_id: params.workspaceId ?? null,
        session_id: params.sessionId ?? null,
        source_type: params.sourceType,
        source_id: params.sourceId ?? null,
        workflow_id: params.workflowId ?? null,
        app_id: params.appId ?? null,
        skill_id: params.skillId ?? null,
        mcp_server: params.mcpServer ?? null,
        mcp_tool: params.mcpTool ?? null,
        title: params.title.trim().slice(0, 240),
        status: 'queued',
        input: redactSecretsDeep(params.input ?? {}) as Record<string, unknown>,
        model: params.model ?? null,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    if (error) {
      if (useLocalExecutionFallback()) return createLocalExecution(params, now);
      throw new Error(`Failed to create execution: ${error.message}`);
    }
    return mapExecution(data as Record<string, unknown>);
  } catch (error) {
    if (useLocalExecutionFallback()) return createLocalExecution(params, now);
    throw error;
  }
}

export async function updateExecution(params: {
  agentId: string;
  executionId: string;
  patch: ExecutionUpdateInput;
}): Promise<ExecutionRecord> {
  if (isLocalExecutionId(params.executionId)) {
    const updated = updateLocalExecution(params.agentId, params.executionId, params.patch);
    if (!updated) throw new NotFoundError('Execution not found');
    return updated;
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.patch.status !== undefined) patch.status = params.patch.status;
  if (params.patch.output !== undefined) patch.output = sanitizeOutput(params.patch.output);
  if (params.patch.failure !== undefined) patch.failure = params.patch.failure ? redactSecretsDeep(params.patch.failure) : null;
  if (params.patch.rollback !== undefined) patch.rollback = params.patch.rollback ? redactSecretsDeep(params.patch.rollback) : null;
  if (params.patch.model !== undefined) patch.model = params.patch.model;
  if (params.patch.tokenPrompt !== undefined) patch.token_prompt = params.patch.tokenPrompt;
  if (params.patch.tokenCompletion !== undefined) patch.token_completion = params.patch.tokenCompletion;
  if (params.patch.tokenTotal !== undefined) patch.token_total = params.patch.tokenTotal;
  if (params.patch.estimatedCost !== undefined) patch.estimated_cost = params.patch.estimatedCost;
  if (params.patch.durationMs !== undefined) patch.duration_ms = params.patch.durationMs;
  if (params.patch.startedAt !== undefined) patch.started_at = params.patch.startedAt;
  if (params.patch.completedAt !== undefined) patch.completed_at = params.patch.completedAt;

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('agent_executions')
      .update(patch)
      .eq('id', params.executionId)
      .eq('agent_id', params.agentId)
      .select('*')
      .maybeSingle();

    if (error) throw new Error(`Failed to update execution: ${error.message}`);
    if (!data) throw new NotFoundError('Execution not found');
    return mapExecution(data as Record<string, unknown>);
  } catch (error) {
    if (useLocalExecutionFallback()) {
      const updated = updateLocalExecution(params.agentId, params.executionId, params.patch);
      if (updated) return updated;
    }
    throw error;
  }
}

export async function appendExecutionLog(params: {
  agentId: string;
  executionId: string;
  level?: ExecutionLogRecord['level'];
  message: string;
  data?: Record<string, unknown>;
}): Promise<ExecutionLogRecord> {
  const localLog = (): ExecutionLogRecord => {
    const log: ExecutionLogRecord = {
      id: crypto.randomUUID(),
      executionId: params.executionId,
      agentId: params.agentId,
      level: params.level ?? 'info',
      message: sanitizeErrorMessage(params.message),
      data: redactSecretsDeep(params.data ?? {}) as Record<string, unknown>,
      createdAt: new Date().toISOString(),
    };
    localExecutionLogs.set(params.executionId, [...(localExecutionLogs.get(params.executionId) ?? []), log]);
    return log;
  };

  if (isLocalExecutionId(params.executionId)) return localLog();

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('agent_execution_logs')
      .insert({
        id: crypto.randomUUID(),
        execution_id: params.executionId,
        agent_id: params.agentId,
        level: params.level ?? 'info',
        message: sanitizeErrorMessage(params.message),
        data: redactSecretsDeep(params.data ?? {}) as Record<string, unknown>,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) throw new Error(`Failed to append execution log: ${error.message}`);
    return mapLog(data as Record<string, unknown>);
  } catch (error) {
    if (useLocalExecutionFallback()) return localLog();
    throw error;
  }
}

export async function listExecutions(params: {
  agentId: string;
  workspaceId?: string | null;
  sessionId?: string | null;
  status?: ExecutionStatus | 'all';
  sourceType?: ExecutionSourceType | 'all';
  workflowId?: string | null;
  appId?: string | null;
  skillId?: string | null;
  search?: string | null;
  limit?: number;
}): Promise<ExecutionRecord[]> {
  const listLocal = () => {
    const search = params.search?.trim().toLowerCase();
    return Array.from(localExecutions.values())
      .filter(item => item.agentId === params.agentId)
      .filter(item => !params.workspaceId || item.workspaceId === params.workspaceId)
      .filter(item => !params.sessionId || item.sessionId === params.sessionId)
      .filter(item => !params.status || params.status === 'all' || item.status === params.status)
      .filter(item => !params.sourceType || params.sourceType === 'all' || item.sourceType === params.sourceType)
      .filter(item => !params.workflowId || item.workflowId === params.workflowId)
      .filter(item => !params.appId || item.appId === params.appId)
      .filter(item => !params.skillId || item.skillId === params.skillId)
      .filter(item => !search || item.title.toLowerCase().includes(search))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, Math.max(1, Math.min(params.limit ?? 100, 250)));
  };

  try {
    let query = getSupabaseAdmin()
      .from('agent_executions')
      .select('*')
      .eq('agent_id', params.agentId)
      .order('updated_at', { ascending: false })
      .limit(Math.max(1, Math.min(params.limit ?? 100, 250)));

    if (params.workspaceId) query = query.eq('workspace_id', params.workspaceId);
    if (params.sessionId) query = query.eq('session_id', params.sessionId);
    if (params.status && params.status !== 'all') query = query.eq('status', params.status);
    if (params.sourceType && params.sourceType !== 'all') query = query.eq('source_type', params.sourceType);
    if (params.workflowId) query = query.eq('workflow_id', params.workflowId);
    if (params.appId) query = query.eq('app_id', params.appId);
    if (params.skillId) query = query.eq('skill_id', params.skillId);
    if (params.search?.trim()) query = query.ilike('title', `%${params.search.trim()}%`);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to list executions: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map(mapExecution);
  } catch (error) {
    if (useLocalExecutionFallback()) return listLocal();
    throw error;
  }
}

export async function getExecutionBundle(params: {
  agentId: string;
  executionId: string;
}): Promise<{ execution: ExecutionRecord; logs: ExecutionLogRecord[] }> {
  if (isLocalExecutionId(params.executionId)) {
    const execution = localExecutions.get(params.executionId);
    if (!execution || execution.agentId !== params.agentId) throw new NotFoundError('Execution not found');
    return { execution, logs: localExecutionLogs.get(params.executionId) ?? [] };
  }
  const supabase = getSupabaseAdmin();
  try {
    const [executionResult, logsResult] = await Promise.all([
      supabase.from('agent_executions').select('*').eq('id', params.executionId).eq('agent_id', params.agentId).maybeSingle(),
      supabase.from('agent_execution_logs').select('*').eq('execution_id', params.executionId).eq('agent_id', params.agentId).order('created_at', { ascending: true }),
    ]);

    if (executionResult.error) throw new Error(`Failed to load execution: ${executionResult.error.message}`);
    if (!executionResult.data) throw new NotFoundError('Execution not found');
    if (logsResult.error) throw new Error(`Failed to load execution logs: ${logsResult.error.message}`);

    return {
      execution: mapExecution(executionResult.data as Record<string, unknown>),
      logs: ((logsResult.data ?? []) as Record<string, unknown>[]).map(mapLog),
    };
  } catch (error) {
    if (useLocalExecutionFallback()) {
      const execution = localExecutions.get(params.executionId);
      if (execution && execution.agentId === params.agentId) {
        return { execution, logs: localExecutionLogs.get(params.executionId) ?? [] };
      }
    }
    throw error;
  }
}

export async function runTrackedExecution<T>(params: ExecutionCreateInput & {
  run: (execution: ExecutionRecord) => Promise<T>;
  onComplete?: (result: T, execution: ExecutionRecord) => Promise<void>;
}): Promise<{ execution: ExecutionRecord; result: T }> {
  const startedAtMs = Date.now();
  let execution = await createExecution(params);
  execution = await updateExecution({
    agentId: params.agentId,
    executionId: execution.id,
    patch: { status: 'running', startedAt: new Date(startedAtMs).toISOString() },
  });
  await appendExecutionLog({
    agentId: params.agentId,
    executionId: execution.id,
    message: `${params.title} started`,
  });

  try {
    const result = await params.run(execution);
    await params.onComplete?.(result, execution);
    const completedAt = Date.now();
    execution = await updateExecution({
      agentId: params.agentId,
      executionId: execution.id,
      patch: {
        status: 'completed',
        output: result,
        durationMs: completedAt - startedAtMs,
        completedAt: new Date(completedAt).toISOString(),
      },
    });
    await appendExecutionLog({
      agentId: params.agentId,
      executionId: execution.id,
      message: `${params.title} completed`,
      data: { durationMs: completedAt - startedAtMs },
    });
    return { execution, result };
  } catch (error) {
    const completedAt = Date.now();
    const failure = diagnosticFailure(error, params.sourceType);
    execution = await updateExecution({
      agentId: params.agentId,
      executionId: execution.id,
      patch: {
        status: 'failed',
        failure,
        durationMs: completedAt - startedAtMs,
        completedAt: new Date(completedAt).toISOString(),
      },
    });
    await appendExecutionLog({
      agentId: params.agentId,
      executionId: execution.id,
      level: 'error',
      message: String(failure.whatFailed ?? 'Execution failed'),
      data: failure,
    });
    throw error;
  }
}

export async function requestExecutionAction(params: {
  agentId: string;
  executionId: string;
  action: 'pause' | 'resume' | 'retry' | 'cancel' | 'rollback';
}): Promise<ExecutionRecord> {
  const bundle = await getExecutionBundle({ agentId: params.agentId, executionId: params.executionId });
  const execution = bundle.execution;
  const now = new Date().toISOString();
  const nextStatusByAction: Record<typeof params.action, ExecutionStatus> = {
    pause: 'paused',
    resume: 'queued',
    retry: 'queued',
    cancel: 'cancelled',
    rollback: 'partially_completed',
  };
  const patch: ExecutionUpdateInput = {
    status: nextStatusByAction[params.action],
    completedAt: params.action === 'cancel' ? now : undefined,
    rollback: params.action === 'rollback'
      ? { requestedAt: now, status: 'requested', possibleFix: 'Review logs before rerunning dependent work.' }
      : undefined,
  };
  const updated = await updateExecution({ agentId: params.agentId, executionId: execution.id, patch });
  await appendExecutionLog({
    agentId: params.agentId,
    executionId: execution.id,
    level: params.action === 'cancel' ? 'warning' : 'info',
    message: `Execution action requested: ${params.action}`,
  });
  return updated;
}

export async function panicStopActiveExecutions(params: {
  agentId: string;
  workspaceId?: string | null;
  sessionId?: string | null;
}): Promise<{ stopped: number; executions: ExecutionRecord[] }> {
  const active = await listExecutions({
    agentId: params.agentId,
    workspaceId: params.workspaceId,
    sessionId: params.sessionId,
    status: 'all',
    limit: 250,
  });
  const targets = active.filter(item => ['queued', 'running', 'waiting_for_user', 'paused'].includes(item.status));
  const executions: ExecutionRecord[] = [];
  for (const item of targets) {
    executions.push(await requestExecutionAction({
      agentId: params.agentId,
      executionId: item.id,
      action: 'cancel',
    }));
  }
  return { stopped: executions.length, executions };
}
