import crypto from 'crypto';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { redactSecretsDeep } from '../security/secret-redaction.js';
import { sanitizeErrorMessage, sanitizeOutput } from '../utils/output-sanitizer.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

export type ExecutionStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

type LegacyExecutionStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_user'
  | 'paused'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'cancelled';

export type ExecutionType =
  | 'CHAT_EXECUTION'
  | 'WORKFLOW_EXECUTION'
  | 'APP_EXECUTION'
  | 'SKILL_EXECUTION'
  | 'SUBAGENT_EXECUTION'
  | 'MCP_EXECUTION'
  | 'FILE_EXECUTION'
  | 'MEMORY_EXECUTION'
  | 'EXTERNAL_CONNECTION_EXECUTION';

export type ExecutionSourceType =
  | ExecutionType
  | 'super_agent'
  | 'app'
  | 'skill'
  | 'workflow'
  | 'mcp'
  | 'subagent'
  | 'external_connection'
  | 'primitive'
  | 'file'
  | 'memory'
  | 'system';

export type ExecutionRecord = {
  id: string;
  userId: string;
  agentId: string;
  workspaceId: string | null;
  projectId: string | null;
  sessionId: string | null;
  type: ExecutionType;
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
  logs: unknown[];
  error: Record<string, unknown> | null;
  failure: Record<string, unknown> | null;
  rollback: Record<string, unknown> | null;
  actionType: string | null;
  actionSource: string | null;
  notificationId: string | null;
  deepLink: string | null;
  recoveryAction: string | null;
  recoveryRequestedAt: string | null;
  statusDetail: Record<string, unknown>;
  metadata: Record<string, unknown>;
  model: string | null;
  tokenPrompt: number;
  tokenCompletion: number;
  tokenTotal: number;
  estimatedCost: number;
  durationMs: number | null;
  startedAt: string | null;
  pausedAt: string | null;
  cancelledAt: string | null;
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
  userId?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  sessionId?: string | null;
  sourceType: ExecutionSourceType;
  type?: ExecutionType;
  sourceId?: string | null;
  workflowId?: string | null;
  appId?: string | null;
  skillId?: string | null;
  mcpServer?: string | null;
  mcpTool?: string | null;
  title: string;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  actionType?: string | null;
  actionSource?: string | null;
  deepLink?: string | null;
  model?: string | null;
};

type ExecutionUpdateInput = {
  status?: ExecutionStatus | LegacyExecutionStatus;
  output?: unknown;
  error?: Record<string, unknown> | null;
  failure?: Record<string, unknown> | null;
  rollback?: Record<string, unknown> | null;
  actionType?: string | null;
  actionSource?: string | null;
  notificationId?: string | null;
  deepLink?: string | null;
  recoveryAction?: string | null;
  recoveryRequestedAt?: string | null;
  statusDetail?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  model?: string | null;
  tokenPrompt?: number;
  tokenCompletion?: number;
  tokenTotal?: number;
  estimatedCost?: number;
  durationMs?: number | null;
  startedAt?: string | null;
  pausedAt?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
};

const LOCAL_EXECUTION_PREFIX = 'local-exec-';
const localExecutions = new Map<string, ExecutionRecord>();
const localExecutionLogs = new Map<string, ExecutionLogRecord[]>();

const LEGACY_STATUS_TO_CANONICAL: Record<LegacyExecutionStatus, ExecutionStatus> = {
  queued: 'QUEUED',
  running: 'RUNNING',
  waiting_for_user: 'PAUSED',
  paused: 'PAUSED',
  completed: 'COMPLETED',
  partially_completed: 'FAILED',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
};

const CANONICAL_STATUS_TO_LEGACY: Record<ExecutionStatus, LegacyExecutionStatus> = {
  QUEUED: 'queued',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

const SOURCE_TYPE_TO_EXECUTION_TYPE: Record<string, ExecutionType> = {
  super_agent: 'CHAT_EXECUTION',
  system: 'CHAT_EXECUTION',
  workflow: 'WORKFLOW_EXECUTION',
  app: 'APP_EXECUTION',
  skill: 'SKILL_EXECUTION',
  subagent: 'SUBAGENT_EXECUTION',
  mcp: 'MCP_EXECUTION',
  file: 'FILE_EXECUTION',
  memory: 'MEMORY_EXECUTION',
  external_connection: 'EXTERNAL_CONNECTION_EXECUTION',
  primitive: 'EXTERNAL_CONNECTION_EXECUTION',
};

const EXECUTION_TYPE_TO_SOURCE_TYPE: Record<ExecutionType, ExecutionSourceType> = {
  CHAT_EXECUTION: 'super_agent',
  WORKFLOW_EXECUTION: 'workflow',
  APP_EXECUTION: 'app',
  SKILL_EXECUTION: 'skill',
  SUBAGENT_EXECUTION: 'subagent',
  MCP_EXECUTION: 'mcp',
  FILE_EXECUTION: 'file',
  MEMORY_EXECUTION: 'memory',
  EXTERNAL_CONNECTION_EXECUTION: 'external_connection',
};

export function normalizeExecutionStatus(value: unknown): ExecutionStatus {
  if (value === 'QUEUED' || value === 'RUNNING' || value === 'PAUSED' || value === 'COMPLETED' || value === 'FAILED' || value === 'CANCELLED') {
    return value;
  }
  const lower = typeof value === 'string' ? value.toLowerCase() : 'queued';
  return LEGACY_STATUS_TO_CANONICAL[lower as LegacyExecutionStatus] ?? 'QUEUED';
}

function toLegacyStatus(value: ExecutionStatus | LegacyExecutionStatus | undefined): LegacyExecutionStatus | undefined {
  if (!value) return undefined;
  return CANONICAL_STATUS_TO_LEGACY[normalizeExecutionStatus(value)] ?? 'queued';
}

export function normalizeExecutionType(value: unknown): ExecutionType {
  if (
    value === 'CHAT_EXECUTION'
    || value === 'WORKFLOW_EXECUTION'
    || value === 'APP_EXECUTION'
    || value === 'SKILL_EXECUTION'
    || value === 'SUBAGENT_EXECUTION'
    || value === 'MCP_EXECUTION'
    || value === 'FILE_EXECUTION'
    || value === 'MEMORY_EXECUTION'
    || value === 'EXTERNAL_CONNECTION_EXECUTION'
  ) {
    return value;
  }
  return SOURCE_TYPE_TO_EXECUTION_TYPE[String(value ?? 'super_agent')] ?? 'CHAT_EXECUTION';
}

function toDbSourceType(value: ExecutionSourceType | undefined): string {
  const type = normalizeExecutionType(value);
  const source = EXECUTION_TYPE_TO_SOURCE_TYPE[type];
  return source === 'subagent' || source === 'external_connection' ? 'system' : source;
}

export function isExecutionActiveStatus(status: unknown): boolean {
  return normalizeExecutionStatus(status) === 'QUEUED'
    || normalizeExecutionStatus(status) === 'RUNNING'
    || normalizeExecutionStatus(status) === 'PAUSED';
}

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
  const type = params.type ?? normalizeExecutionType(params.sourceType);
  const execution: ExecutionRecord = {
    id: `${LOCAL_EXECUTION_PREFIX}${crypto.randomUUID()}`,
    userId: params.userId ?? params.agentId,
    agentId: params.agentId,
    workspaceId: params.workspaceId ?? null,
    projectId: params.projectId ?? null,
    sessionId: params.sessionId ?? null,
    type,
    sourceType: params.sourceType,
    sourceId: params.sourceId ?? null,
    workflowId: params.workflowId ?? null,
    appId: params.appId ?? null,
    skillId: params.skillId ?? null,
    mcpServer: params.mcpServer ?? null,
    mcpTool: params.mcpTool ?? null,
    title: params.title.trim().slice(0, 240),
    status: 'QUEUED',
    input: redactSecretsDeep(params.input ?? {}) as Record<string, unknown>,
    output: null,
    logs: [],
    error: null,
    failure: null,
    rollback: null,
    actionType: params.actionType ?? null,
    actionSource: params.actionSource ?? null,
    notificationId: null,
    deepLink: params.deepLink ?? null,
    recoveryAction: null,
    recoveryRequestedAt: null,
    statusDetail: {},
    metadata: redactSecretsDeep(params.metadata ?? {}) as Record<string, unknown>,
    model: params.model ?? null,
    tokenPrompt: 0,
    tokenCompletion: 0,
    tokenTotal: 0,
    estimatedCost: 0,
    durationMs: null,
    startedAt: null,
    pausedAt: null,
    cancelledAt: null,
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
    status: input.status ? normalizeExecutionStatus(input.status) : current.status,
    output: input.output !== undefined ? sanitizeOutput(input.output) : current.output,
    error: input.error !== undefined ? (input.error ? redactSecretsDeep(input.error) as Record<string, unknown> : null) : current.error,
    failure: input.failure !== undefined ? (input.failure ? redactSecretsDeep(input.failure) as Record<string, unknown> : null) : current.failure,
    rollback: input.rollback !== undefined ? (input.rollback ? redactSecretsDeep(input.rollback) as Record<string, unknown> : null) : current.rollback,
    actionType: input.actionType !== undefined ? input.actionType : current.actionType,
    actionSource: input.actionSource !== undefined ? input.actionSource : current.actionSource,
    notificationId: input.notificationId !== undefined ? input.notificationId : current.notificationId,
    deepLink: input.deepLink !== undefined ? input.deepLink : current.deepLink,
    recoveryAction: input.recoveryAction !== undefined ? input.recoveryAction : current.recoveryAction,
    recoveryRequestedAt: input.recoveryRequestedAt !== undefined ? input.recoveryRequestedAt : current.recoveryRequestedAt,
    statusDetail: input.statusDetail !== undefined ? redactSecretsDeep(input.statusDetail) as Record<string, unknown> : current.statusDetail,
    metadata: input.metadata !== undefined ? redactSecretsDeep(input.metadata) as Record<string, unknown> : current.metadata,
    model: input.model !== undefined ? input.model : current.model,
    tokenPrompt: input.tokenPrompt ?? current.tokenPrompt,
    tokenCompletion: input.tokenCompletion ?? current.tokenCompletion,
    tokenTotal: input.tokenTotal ?? current.tokenTotal,
    estimatedCost: input.estimatedCost ?? current.estimatedCost,
    durationMs: input.durationMs !== undefined ? input.durationMs : current.durationMs,
    startedAt: input.startedAt !== undefined ? input.startedAt : current.startedAt,
    pausedAt: input.pausedAt !== undefined ? input.pausedAt : current.pausedAt,
    cancelledAt: input.cancelledAt !== undefined ? input.cancelledAt : current.cancelledAt,
    completedAt: input.completedAt !== undefined ? input.completedAt : current.completedAt,
    updatedAt: new Date().toISOString(),
  };
  localExecutions.set(executionId, updated);
  return updated;
}

function mapExecution(row: Record<string, unknown>): ExecutionRecord {
  const type = normalizeExecutionType(row.execution_type ?? row.type ?? row.source_type);
  const error = row.error ? asRecord(row.error) : row.failure ? asRecord(row.failure) : null;
  return {
    id: String(row.id),
    userId: String(row.user_id ?? row.agent_id),
    agentId: String(row.agent_id),
    workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : null,
    projectId: typeof row.project_id === 'string' ? row.project_id : null,
    sessionId: typeof row.session_id === 'string' ? row.session_id : null,
    type,
    sourceType: String(row.source_type ?? 'super_agent') as ExecutionSourceType,
    sourceId: typeof row.source_id === 'string' ? row.source_id : null,
    workflowId: typeof row.workflow_id === 'string' ? row.workflow_id : null,
    appId: typeof row.app_id === 'string' ? row.app_id : null,
    skillId: typeof row.skill_id === 'string' ? row.skill_id : null,
    mcpServer: typeof row.mcp_server === 'string' ? row.mcp_server : null,
    mcpTool: typeof row.mcp_tool === 'string' ? row.mcp_tool : null,
    title: String(row.title ?? 'Execution'),
    status: normalizeExecutionStatus(row.status),
    input: asRecord(row.input),
    output: row.output ?? null,
    logs: Array.isArray(row.logs) ? row.logs : [],
    error,
    failure: error,
    rollback: row.rollback ? asRecord(row.rollback) : null,
    actionType: typeof row.action_type === 'string' ? row.action_type : null,
    actionSource: typeof row.action_source === 'string' ? row.action_source : null,
    notificationId: typeof row.notification_id === 'string' ? row.notification_id : null,
    deepLink: typeof row.deep_link === 'string' ? row.deep_link : null,
    recoveryAction: typeof row.recovery_action === 'string' ? row.recovery_action : null,
    recoveryRequestedAt: typeof row.recovery_requested_at === 'string' ? row.recovery_requested_at : null,
    statusDetail: asRecord(row.status_detail),
    metadata: asRecord(row.metadata),
    model: typeof row.model === 'string' ? row.model : null,
    tokenPrompt: Number(row.token_prompt ?? 0),
    tokenCompletion: Number(row.token_completion ?? 0),
    tokenTotal: Number(row.token_total ?? 0),
    estimatedCost: Number(row.estimated_cost ?? 0),
    durationMs: typeof row.duration_ms === 'number' ? row.duration_ms : null,
    startedAt: typeof row.started_at === 'string' ? row.started_at : null,
    pausedAt: typeof row.paused_at === 'string' ? row.paused_at : null,
    cancelledAt: typeof row.cancelled_at === 'string' ? row.cancelled_at : null,
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
  const executionType = params.type ?? normalizeExecutionType(params.sourceType);
  const sourceType = toDbSourceType(params.sourceType);
  const baseInsert = {
    id: crypto.randomUUID(),
    agent_id: params.agentId,
    workspace_id: params.workspaceId ?? null,
    session_id: params.sessionId ?? null,
    source_type: sourceType,
    source_id: params.sourceId ?? null,
    workflow_id: params.workflowId ?? null,
    app_id: params.appId ?? null,
    skill_id: params.skillId ?? null,
    mcp_server: params.mcpServer ?? null,
    mcp_tool: params.mcpTool ?? null,
    title: params.title.trim().slice(0, 240),
    input: redactSecretsDeep(params.input ?? {}) as Record<string, unknown>,
    action_type: params.actionType ?? null,
    action_source: params.actionSource ?? null,
    deep_link: params.deepLink ?? null,
    model: params.model ?? null,
    created_at: now,
    updated_at: now,
  };
  try {
    const canonical = await getSupabaseAdmin()
      .from('agent_executions')
      .insert({
        ...baseInsert,
        user_id: params.userId ?? params.agentId,
        project_id: params.projectId ?? null,
        execution_type: executionType,
        status: 'QUEUED',
        metadata: redactSecretsDeep(params.metadata ?? {}) as Record<string, unknown>,
      })
      .select('*')
      .single();

    if (!canonical.error) return mapExecution(canonical.data as Record<string, unknown>);

    const legacy = await getSupabaseAdmin()
      .from('agent_executions')
      .insert({
        id: baseInsert.id,
        agent_id: baseInsert.agent_id,
        workspace_id: baseInsert.workspace_id,
        session_id: baseInsert.session_id,
        source_type: baseInsert.source_type,
        source_id: baseInsert.source_id,
        workflow_id: baseInsert.workflow_id,
        app_id: baseInsert.app_id,
        skill_id: baseInsert.skill_id,
        mcp_server: baseInsert.mcp_server,
        mcp_tool: baseInsert.mcp_tool,
        title: baseInsert.title,
        input: baseInsert.input,
        model: baseInsert.model,
        created_at: baseInsert.created_at,
        updated_at: baseInsert.updated_at,
        status: 'queued',
      })
      .select('*')
      .single();

    if (legacy.error) {
      if (useLocalExecutionFallback()) return createLocalExecution(params, now);
      throw new Error(`Failed to create execution: ${legacy.error.message}`);
    }
    return mapExecution(legacy.data as Record<string, unknown>);
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
  if (params.patch.status !== undefined) patch.status = normalizeExecutionStatus(params.patch.status);
  if (params.patch.output !== undefined) patch.output = sanitizeOutput(params.patch.output);
  if (params.patch.error !== undefined) patch.error = params.patch.error ? redactSecretsDeep(params.patch.error) : null;
  if (params.patch.failure !== undefined) patch.failure = params.patch.failure ? redactSecretsDeep(params.patch.failure) : null;
  if (params.patch.rollback !== undefined) patch.rollback = params.patch.rollback ? redactSecretsDeep(params.patch.rollback) : null;
  if (params.patch.actionType !== undefined) patch.action_type = params.patch.actionType;
  if (params.patch.actionSource !== undefined) patch.action_source = params.patch.actionSource;
  if (params.patch.notificationId !== undefined) patch.notification_id = params.patch.notificationId;
  if (params.patch.deepLink !== undefined) patch.deep_link = params.patch.deepLink;
  if (params.patch.recoveryAction !== undefined) patch.recovery_action = params.patch.recoveryAction;
  if (params.patch.recoveryRequestedAt !== undefined) patch.recovery_requested_at = params.patch.recoveryRequestedAt;
  if (params.patch.statusDetail !== undefined) patch.status_detail = redactSecretsDeep(params.patch.statusDetail);
  if (params.patch.metadata !== undefined) patch.metadata = redactSecretsDeep(params.patch.metadata);
  if (params.patch.model !== undefined) patch.model = params.patch.model;
  if (params.patch.tokenPrompt !== undefined) patch.token_prompt = params.patch.tokenPrompt;
  if (params.patch.tokenCompletion !== undefined) patch.token_completion = params.patch.tokenCompletion;
  if (params.patch.tokenTotal !== undefined) patch.token_total = params.patch.tokenTotal;
  if (params.patch.estimatedCost !== undefined) patch.estimated_cost = params.patch.estimatedCost;
  if (params.patch.durationMs !== undefined) patch.duration_ms = params.patch.durationMs;
  if (params.patch.startedAt !== undefined) patch.started_at = params.patch.startedAt;
  if (params.patch.pausedAt !== undefined) patch.paused_at = params.patch.pausedAt;
  if (params.patch.cancelledAt !== undefined) patch.cancelled_at = params.patch.cancelledAt;
  if (params.patch.completedAt !== undefined) patch.completed_at = params.patch.completedAt;

  try {
    const canonical = await getSupabaseAdmin()
      .from('agent_executions')
      .update(patch)
      .eq('id', params.executionId)
      .eq('agent_id', params.agentId)
      .select('*')
      .maybeSingle();

    if (!canonical.error && canonical.data) return mapExecution(canonical.data as Record<string, unknown>);

    const legacyPatch = { ...patch };
    if (params.patch.status !== undefined) legacyPatch.status = toLegacyStatus(params.patch.status);
    delete legacyPatch.error;
    delete legacyPatch.metadata;
    delete legacyPatch.paused_at;
    delete legacyPatch.cancelled_at;
    delete legacyPatch.action_source;
    delete legacyPatch.deep_link;
    delete legacyPatch.model;
    delete legacyPatch.token_prompt;
    delete legacyPatch.token_completion;
    delete legacyPatch.token_total;
    delete legacyPatch.estimated_cost;
    const legacy = await getSupabaseAdmin()
      .from('agent_executions')
      .update(legacyPatch)
      .eq('id', params.executionId)
      .eq('agent_id', params.agentId)
      .select('*')
      .maybeSingle();

    if (legacy.error) throw new Error(`Failed to update execution: ${legacy.error.message}`);
    if (!legacy.data) throw new NotFoundError('Execution not found');
    return mapExecution(legacy.data as Record<string, unknown>);
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
      .filter(item => !params.status || params.status === 'all' || item.status === normalizeExecutionStatus(params.status))
      .filter(item => !params.sourceType || params.sourceType === 'all' || item.sourceType === params.sourceType || item.type === normalizeExecutionType(params.sourceType))
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
    if (params.status && params.status !== 'all') query = query.eq('status', normalizeExecutionStatus(params.status));
    if (params.sourceType && params.sourceType !== 'all') query = query.eq('source_type', toDbSourceType(params.sourceType));
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
    patch: { status: 'RUNNING', startedAt: new Date(startedAtMs).toISOString() },
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
        status: 'COMPLETED',
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
        status: 'FAILED',
        error: failure,
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
  action: 'pause' | 'resume' | 'retry' | 'cancel' | 'rollback' | 'inspect';
}): Promise<ExecutionRecord> {
  const bundle = await getExecutionBundle({ agentId: params.agentId, executionId: params.executionId });
  const execution = bundle.execution;
  const now = new Date().toISOString();
  if (params.action === 'resume' && execution.type === 'WORKFLOW_EXECUTION') {
    const checkpoint = asRecord(execution.statusDetail).resumeCheckpoint ?? asRecord(execution.metadata).resumeCheckpoint;
    if (!checkpoint) {
      throw new ValidationError('Workflow resume requires a persisted execution checkpoint. The paused execution is preserved for inspection.');
    }
  }
  const nextStatusByAction: Record<typeof params.action, ExecutionStatus> = {
    pause: 'PAUSED',
    resume: 'RUNNING',
    retry: 'QUEUED',
    cancel: 'CANCELLED',
    rollback: execution.status,
    inspect: execution.status,
  };
  const patch: ExecutionUpdateInput = {
    status: nextStatusByAction[params.action],
    pausedAt: params.action === 'pause' ? now : undefined,
    cancelledAt: params.action === 'cancel' ? now : undefined,
    completedAt: params.action === 'cancel' ? now : undefined,
    recoveryAction: params.action,
    recoveryRequestedAt: now,
    statusDetail: {
      lastRequestedAction: params.action,
      requestedAt: now,
    },
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
  const targets = active.filter(item => isExecutionActiveStatus(item.status));
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
