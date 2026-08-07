import crypto from 'crypto';
import { createNotification } from '../notifications/service.js';
import { redactSecretsDeep } from '../security/secret-redaction.js';
import { readLocalRuntimeState, updateLocalRuntimeState } from '../storage/local-state.js';
import { getSupabaseAdmin, withSupabaseQueryTimeout } from '../storage/supabase.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

export type AgentTaskStatus =
  | 'created'
  | 'queued'
  | 'planning'
  | 'waiting_for_dependencies'
  | 'waiting_for_approval'
  | 'awaiting_confirmation'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'retrying'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'needs_configuration'
  | 'archived';

export type AgentTaskStepStatus =
  | 'queued'
  | 'planning'
  | 'waiting_for_dependencies'
  | 'waiting_for_approval'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'needs_configuration';

export type AgentTaskRecord = {
  id: string;
  parentTaskId: string | null;
  rootExecutionId: string;
  userId: string;
  sessionId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  title: string;
  originalPrompt: string;
  status: AgentTaskStatus;
  plan: Array<Record<string, unknown>>;
  capabilityIds: string[];
  plannerVersion: string;
  contextVersion: string | null;
  priority: 'critical' | 'high' | 'normal' | 'low' | 'background';
  requiredPermissions: string[];
  confirmationStatus: 'not_required' | 'pending' | 'approved' | 'rejected';
  progress: number;
  retryCount: number;
  errorMessage: string | null;
  resultSummary: string | null;
  metadata: Record<string, unknown>;
  executionMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type AgentTaskStepRecord = {
  id: string;
  taskId: string;
  userId: string;
  capabilityId: string | null;
  actionId: string | null;
  status: AgentTaskStepStatus;
  inputSummary: string | null;
  outputSummary: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

type TaskCreateInput = {
  userId: string;
  parentTaskId?: string | null;
  rootExecutionId?: string | null;
  sessionId?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  title: string;
  originalPrompt?: string;
  status?: AgentTaskStatus;
  plan?: Array<Record<string, unknown>>;
  capabilityIds?: string[];
  plannerVersion?: string;
  contextVersion?: string | null;
  priority?: AgentTaskRecord['priority'];
  requiredPermissions?: string[];
  confirmationStatus?: AgentTaskRecord['confirmationStatus'];
  progress?: number;
  retryCount?: number;
  metadata?: Record<string, unknown>;
  executionMetadata?: Record<string, unknown>;
};

type TaskPatchInput = Partial<Pick<
  AgentTaskRecord,
  | 'status'
  | 'plan'
  | 'capabilityIds'
  | 'plannerVersion'
  | 'contextVersion'
  | 'priority'
  | 'requiredPermissions'
  | 'confirmationStatus'
  | 'progress'
  | 'retryCount'
  | 'errorMessage'
  | 'resultSummary'
  | 'metadata'
  | 'executionMetadata'
  | 'startedAt'
  | 'completedAt'
>>;

const TASK_STATUSES = new Set<AgentTaskStatus>([
  'created',
  'queued',
  'planning',
  'waiting_for_dependencies',
  'waiting_for_approval',
  'awaiting_confirmation',
  'scheduled',
  'running',
  'paused',
  'retrying',
  'cancelling',
  'completed',
  'failed',
  'cancelled',
  'needs_configuration',
  'archived',
]);

const TASK_STEP_STATUSES = new Set<AgentTaskStepStatus>([
  'queued',
  'planning',
  'waiting_for_dependencies',
  'waiting_for_approval',
  'scheduled',
  'running',
  'paused',
  'retrying',
  'completed',
  'failed',
  'cancelled',
  'needs_configuration',
]);
const TASK_WRITE_TIMEOUT_MS = 8_000;
const TASK_READ_TIMEOUT_MS = 8_000;

function localFallbackAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizePriority(value: unknown): AgentTaskRecord['priority'] {
  return value === 'critical' || value === 'high' || value === 'low' || value === 'background' ? value : 'normal';
}

export function normalizeTaskStatus(value: unknown): AgentTaskStatus {
  const status = typeof value === 'string' ? value.toLowerCase() : 'queued';
  if (status === 'waitingforapproval' || status === 'waiting_for_confirmation') return 'waiting_for_approval';
  if (status === 'awaiting_approval') return 'awaiting_confirmation';
  if (status === 'waitingfordependencies') return 'waiting_for_dependencies';
  return TASK_STATUSES.has(status as AgentTaskStatus) ? status as AgentTaskStatus : 'queued';
}

function normalizeStepStatus(value: unknown): AgentTaskStepStatus {
  const status = typeof value === 'string' ? value.toLowerCase() : 'queued';
  return TASK_STEP_STATUSES.has(status as AgentTaskStepStatus) ? status as AgentTaskStepStatus : 'queued';
}

function mapTask(row: Record<string, unknown>): AgentTaskRecord {
  const id = String(row.id);
  return {
    id,
    parentTaskId: typeof (row.parent_task_id ?? row.parentTaskId) === 'string' ? String(row.parent_task_id ?? row.parentTaskId) : null,
    rootExecutionId: typeof (row.root_execution_id ?? row.rootExecutionId) === 'string' ? String(row.root_execution_id ?? row.rootExecutionId) : id,
    userId: String(row.user_id ?? row.userId),
    sessionId: typeof (row.session_id ?? row.sessionId) === 'string' ? String(row.session_id ?? row.sessionId) : null,
    workspaceId: typeof (row.workspace_id ?? row.workspaceId) === 'string' ? String(row.workspace_id ?? row.workspaceId) : null,
    projectId: typeof (row.project_id ?? row.projectId) === 'string' ? String(row.project_id ?? row.projectId) : null,
    title: String(row.title ?? 'Task'),
    originalPrompt: String(row.original_prompt ?? row.originalPrompt ?? ''),
    status: normalizeTaskStatus(row.status),
    plan: recordArray(row.plan),
    capabilityIds: stringArray(row.capability_ids ?? row.capabilityIds),
    plannerVersion: String(row.planner_version ?? row.plannerVersion ?? 'super-agentos-planner-v6.6.8'),
    contextVersion: typeof (row.context_version ?? row.contextVersion) === 'string' ? String(row.context_version ?? row.contextVersion) : null,
    priority: normalizePriority(row.priority),
    requiredPermissions: stringArray(row.required_permissions ?? row.requiredPermissions),
    confirmationStatus: row.confirmation_status === 'pending' || row.confirmation_status === 'approved' || row.confirmation_status === 'rejected'
      ? row.confirmation_status
      : row.confirmationStatus === 'pending' || row.confirmationStatus === 'approved' || row.confirmationStatus === 'rejected'
        ? row.confirmationStatus
        : 'not_required',
    progress: Math.max(0, Math.min(100, Number(row.progress ?? 0))),
    retryCount: Math.max(0, Number(row.retry_count ?? row.retryCount ?? 0)),
    errorMessage: typeof (row.error_message ?? row.errorMessage) === 'string' ? String(row.error_message ?? row.errorMessage) : null,
    resultSummary: typeof (row.result_summary ?? row.resultSummary) === 'string' ? String(row.result_summary ?? row.resultSummary) : null,
    metadata: asRecord(row.metadata),
    executionMetadata: asRecord(row.execution_metadata ?? row.executionMetadata),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? new Date().toISOString()),
    startedAt: typeof (row.started_at ?? row.startedAt) === 'string' ? String(row.started_at ?? row.startedAt) : null,
    completedAt: typeof (row.completed_at ?? row.completedAt) === 'string' ? String(row.completed_at ?? row.completedAt) : null,
  };
}

function mapStep(row: Record<string, unknown>): AgentTaskStepRecord {
  return {
    id: String(row.id),
    taskId: String(row.task_id ?? row.taskId),
    userId: String(row.user_id ?? row.userId),
    capabilityId: typeof (row.capability_id ?? row.capabilityId) === 'string' ? String(row.capability_id ?? row.capabilityId) : null,
    actionId: typeof (row.action_id ?? row.actionId) === 'string' ? String(row.action_id ?? row.actionId) : null,
    status: normalizeStepStatus(row.status),
    inputSummary: typeof (row.input_summary ?? row.inputSummary) === 'string' ? String(row.input_summary ?? row.inputSummary) : null,
    outputSummary: typeof (row.output_summary ?? row.outputSummary) === 'string' ? String(row.output_summary ?? row.outputSummary) : null,
    errorMessage: typeof (row.error_message ?? row.errorMessage) === 'string' ? String(row.error_message ?? row.errorMessage) : null,
    metadata: asRecord(row.metadata),
    startedAt: typeof (row.started_at ?? row.startedAt) === 'string' ? String(row.started_at ?? row.startedAt) : null,
    completedAt: typeof (row.completed_at ?? row.completedAt) === 'string' ? String(row.completed_at ?? row.completedAt) : null,
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
  };
}

function toTaskRow(input: TaskCreateInput, id = crypto.randomUUID(), now = new Date().toISOString()): Record<string, unknown> {
  const title = input.title.trim();
  if (!title) throw new ValidationError('task title is required');
  return {
    id,
    parent_task_id: input.parentTaskId ?? null,
    root_execution_id: input.rootExecutionId ?? id,
    user_id: input.userId,
    session_id: input.sessionId ?? null,
    workspace_id: input.workspaceId ?? null,
    project_id: input.projectId ?? null,
    title: title.slice(0, 240),
    original_prompt: input.originalPrompt ?? title,
    status: input.status ?? 'queued',
    plan: redactSecretsDeep(input.plan ?? []),
    capability_ids: input.capabilityIds ?? [],
    planner_version: input.plannerVersion ?? 'super-agentos-planner-v6.6.8',
    context_version: input.contextVersion ?? null,
    priority: normalizePriority(input.priority),
    required_permissions: input.requiredPermissions ?? [],
    confirmation_status: input.confirmationStatus ?? 'not_required',
    progress: Math.max(0, Math.min(100, input.progress ?? 0)),
    retry_count: Math.max(0, input.retryCount ?? 0),
    error_message: null,
    result_summary: null,
    metadata: redactSecretsDeep(input.metadata ?? {}),
    execution_metadata: redactSecretsDeep(input.executionMetadata ?? {}),
    created_at: now,
    updated_at: now,
    started_at: input.status === 'running' ? now : null,
    completed_at: null,
  };
}

function taskPatchToDb(patch: TaskPatchInput): Record<string, unknown> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) row.status = normalizeTaskStatus(patch.status);
  if (patch.plan !== undefined) row.plan = redactSecretsDeep(patch.plan);
  if (patch.capabilityIds !== undefined) row.capability_ids = patch.capabilityIds;
  if (patch.plannerVersion !== undefined) row.planner_version = patch.plannerVersion;
  if (patch.contextVersion !== undefined) row.context_version = patch.contextVersion;
  if (patch.priority !== undefined) row.priority = normalizePriority(patch.priority);
  if (patch.requiredPermissions !== undefined) row.required_permissions = patch.requiredPermissions;
  if (patch.confirmationStatus !== undefined) row.confirmation_status = patch.confirmationStatus;
  if (patch.progress !== undefined) row.progress = Math.max(0, Math.min(100, patch.progress));
  if (patch.retryCount !== undefined) row.retry_count = Math.max(0, patch.retryCount);
  if (patch.errorMessage !== undefined) row.error_message = patch.errorMessage;
  if (patch.resultSummary !== undefined) row.result_summary = patch.resultSummary;
  if (patch.metadata !== undefined) row.metadata = redactSecretsDeep(patch.metadata);
  if (patch.executionMetadata !== undefined) row.execution_metadata = redactSecretsDeep(patch.executionMetadata);
  if (patch.startedAt !== undefined) row.started_at = patch.startedAt;
  if (patch.status === 'running' && patch.startedAt === undefined) row.started_at = new Date().toISOString();
  if (patch.completedAt !== undefined) row.completed_at = patch.completedAt;
  if (patch.status === 'completed' && patch.completedAt === undefined) row.completed_at = new Date().toISOString();
  if ((patch.status === 'failed' || patch.status === 'cancelled') && patch.completedAt === undefined) row.completed_at = new Date().toISOString();
  return row;
}

export async function createAgentTask(input: TaskCreateInput): Promise<AgentTaskRecord> {
  const row = toTaskRow(input);
  try {
    const { data, error } = await withSupabaseQueryTimeout(getSupabaseAdmin()
      .from('agent_tasks')
      .insert(row)
      .select('*')
      .single(), TASK_WRITE_TIMEOUT_MS);
    if (error) throw new Error(error.message);
    return mapTask(data as Record<string, unknown>);
  } catch (error) {
    if (!localFallbackAllowed()) throw error;
    return updateLocalRuntimeState(state => {
      state.agentTasks.unshift(row);
      return mapTask(row);
    });
  }
}

export async function updateAgentTask(params: {
  userId: string;
  taskId: string;
  patch: TaskPatchInput;
}): Promise<AgentTaskRecord> {
  const dbPatch = taskPatchToDb(params.patch);
  try {
    const { data, error } = await withSupabaseQueryTimeout(getSupabaseAdmin()
      .from('agent_tasks')
      .update(dbPatch)
      .eq('id', params.taskId)
      .eq('user_id', params.userId)
      .select('*')
      .maybeSingle(), TASK_WRITE_TIMEOUT_MS);
    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundError('Task not found');
    const task = mapTask(data as Record<string, unknown>);
    if (task.status === 'completed' || task.status === 'failed') {
      await createNotification({
        agentId: params.userId,
        workspaceId: task.workspaceId,
        sessionId: task.sessionId,
        type: task.status === 'completed' ? 'task_completed' : 'task_failed',
        title: task.status === 'completed' ? 'Task completed' : 'Task failed',
        body: task.resultSummary ?? task.errorMessage ?? task.title,
        metadata: {
          taskId: task.id,
          actionHref: `/tasks?task=${encodeURIComponent(task.id)}`,
          actionUrl: `/tasks?task=${encodeURIComponent(task.id)}`,
        },
      }).catch(() => undefined);
    }
    return task;
  } catch (error) {
    if (!localFallbackAllowed()) throw error;
    return updateLocalRuntimeState(state => {
      const index = state.agentTasks.findIndex(item => String(item.id) === params.taskId && String(item.user_id ?? item.userId) === params.userId);
      if (index < 0) throw new NotFoundError('Task not found');
      state.agentTasks[index] = { ...state.agentTasks[index], ...dbPatch };
      return mapTask(state.agentTasks[index]);
    });
  }
}

export async function listAgentTasks(params: {
  userId: string;
  workspaceId?: string | null;
  sessionId?: string | null;
  status?: AgentTaskStatus | 'all';
  limit?: number;
}): Promise<AgentTaskRecord[]> {
  const limit = Math.max(1, Math.min(params.limit ?? 100, 250));
  try {
    let query = getSupabaseAdmin()
      .from('agent_tasks')
      .select('*')
      .eq('user_id', params.userId)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (params.workspaceId) query = query.eq('workspace_id', params.workspaceId);
    if (params.sessionId) query = query.eq('session_id', params.sessionId);
    if (params.status && params.status !== 'all') query = query.eq('status', params.status);
    const { data, error } = await withSupabaseQueryTimeout(query, TASK_READ_TIMEOUT_MS);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map(mapTask);
  } catch (error) {
    if (!localFallbackAllowed()) throw error;
    const state = await readLocalRuntimeState();
    return state.agentTasks
      .filter(item => String(item.user_id ?? item.userId) === params.userId)
      .filter(item => !params.workspaceId || String(item.workspace_id ?? item.workspaceId) === params.workspaceId)
      .filter(item => !params.sessionId || String(item.session_id ?? item.sessionId) === params.sessionId)
      .filter(item => !params.status || params.status === 'all' || normalizeTaskStatus(item.status) === params.status)
      .sort((left, right) => String(right.updated_at ?? right.updatedAt ?? '').localeCompare(String(left.updated_at ?? left.updatedAt ?? '')))
      .slice(0, limit)
      .map(mapTask);
  }
}

export async function getAgentTaskBundle(params: {
  userId: string;
  taskId: string;
}): Promise<{ task: AgentTaskRecord; steps: AgentTaskStepRecord[] }> {
  try {
    const supabase = getSupabaseAdmin();
    const [taskResult, stepResult] = await Promise.all([
      withSupabaseQueryTimeout(supabase.from('agent_tasks').select('*').eq('id', params.taskId).eq('user_id', params.userId).maybeSingle(), TASK_READ_TIMEOUT_MS),
      withSupabaseQueryTimeout(supabase.from('agent_task_steps').select('*').eq('task_id', params.taskId).eq('user_id', params.userId).order('created_at', { ascending: true }), TASK_READ_TIMEOUT_MS),
    ]);
    if (taskResult.error) throw new Error(taskResult.error.message);
    if (!taskResult.data) throw new NotFoundError('Task not found');
    if (stepResult.error) throw new Error(stepResult.error.message);
    return {
      task: mapTask(taskResult.data as Record<string, unknown>),
      steps: ((stepResult.data ?? []) as Record<string, unknown>[]).map(mapStep),
    };
  } catch (error) {
    if (!localFallbackAllowed()) throw error;
    const state = await readLocalRuntimeState();
    const task = state.agentTasks.find(item => String(item.id) === params.taskId && String(item.user_id ?? item.userId) === params.userId);
    if (!task) throw new NotFoundError('Task not found');
    return {
      task: mapTask(task),
      steps: state.agentTaskSteps
        .filter(item => String(item.task_id ?? item.taskId) === params.taskId && String(item.user_id ?? item.userId) === params.userId)
        .map(mapStep),
    };
  }
}

export async function appendAgentTaskStep(params: {
  userId: string;
  taskId: string;
  capabilityId?: string | null;
  actionId?: string | null;
  status?: AgentTaskStepStatus;
  inputSummary?: string | null;
  outputSummary?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<AgentTaskStepRecord> {
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    task_id: params.taskId,
    user_id: params.userId,
    capability_id: params.capabilityId ?? null,
    action_id: params.actionId ?? null,
    status: params.status ?? 'queued',
    input_summary: params.inputSummary ?? null,
    output_summary: params.outputSummary ?? null,
    error_message: params.errorMessage ?? null,
    metadata: redactSecretsDeep(params.metadata ?? {}),
    started_at: params.status === 'running' ? now : null,
    completed_at: params.status === 'completed' || params.status === 'failed' || params.status === 'cancelled' ? now : null,
    created_at: now,
  };
  try {
    const { data, error } = await withSupabaseQueryTimeout(getSupabaseAdmin()
      .from('agent_task_steps')
      .insert(row)
      .select('*')
      .single(), TASK_WRITE_TIMEOUT_MS);
    if (error) throw new Error(error.message);
    return mapStep(data as Record<string, unknown>);
  } catch (error) {
    if (!localFallbackAllowed()) throw error;
    return updateLocalRuntimeState(state => {
      state.agentTaskSteps.push(row);
      return mapStep(row);
    });
  }
}

export async function cancelAgentTask(params: {
  userId: string;
  taskId: string;
}): Promise<AgentTaskRecord> {
  return updateAgentTask({
    userId: params.userId,
    taskId: params.taskId,
    patch: {
      status: 'cancelled',
      progress: 100,
      resultSummary: 'Task cancelled by user.',
    },
  });
}

export async function retryAgentTask(params: {
  userId: string;
  taskId: string;
}): Promise<AgentTaskRecord> {
  const { task } = await getAgentTaskBundle(params);
  if (task.status !== 'failed' && task.status !== 'cancelled' && task.status !== 'needs_configuration' && task.status !== 'archived') {
    throw new ValidationError('Only failed, cancelled, needs_configuration, or archived tasks can be retried');
  }
  return updateAgentTask({
    userId: params.userId,
    taskId: params.taskId,
    patch: {
      status: 'retrying',
      progress: 0,
      retryCount: task.retryCount + 1,
      errorMessage: null,
      resultSummary: null,
      confirmationStatus: task.confirmationStatus === 'rejected' ? 'pending' : task.confirmationStatus,
      completedAt: null,
    },
  });
}
