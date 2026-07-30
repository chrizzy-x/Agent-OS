import crypto from 'crypto';
import { logSuperAgentAudit } from '../audit/super-agent.js';
import { redactSecretsDeep, redactSecretsInString } from '../security/secret-redaction.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import type { AgentOSIntent } from '../studio/intents.js';
import { PermissionError, ValidationError } from '../utils/errors.js';
import type { buildWorkspaceContextPackage } from '../workspace-context/service.js';
import { assertWorkspaceMembership } from '../workspaces/service.js';
import { normalizeIntelligenceSelection, type IntelligenceSelection } from './selection.js';
import {
  runMultiIntelligenceWorkers,
  type IntelligenceWorkerOutputRecord,
  type IntelligenceWorkerRunRecord,
  type IntelligenceWorkerSelection,
} from './workers.js';

type WorkspaceContextPackage = Awaited<ReturnType<typeof buildWorkspaceContextPackage>>;
type ConsensusStatus = 'running' | 'completed' | 'failed' | 'cancelled';
type ConsensusStrategy = 'standard';

export type StandardConsensusConfigurationRecord = {
  id: string;
  ownerAgentId: string;
  workspaceId: string;
  displayName: string;
  status: 'active' | 'disabled';
  strategy: ConsensusStrategy;
  workerSelections: IntelligenceWorkerSelection[];
  quorumCount: number;
  preserveDissent: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type StandardConsensusRecord = {
  id: string;
  ownerAgentId: string;
  workspaceId: string;
  sessionId: string | null;
  taskId: string | null;
  executionId: string | null;
  consensusConfigurationId: string;
  workerRunId: string | null;
  status: ConsensusStatus;
  requestHash: string;
  consensusHash: string | null;
  configurationSnapshot: Record<string, unknown>;
  result: Record<string, unknown>;
  dissent: Array<Record<string, unknown>>;
  usage: Record<string, unknown>;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StandardConsensusTrace = {
  kind: 'standard_consensus';
  status: 'completed';
  executionAuthority: 'super_agentos';
  connectedIntelligenceRole: 'proposal_only';
  consensusRecordId: string;
  workerRunId: string;
  consensusConfigurationId: string;
  consensusHash: string;
  proposalHash: string;
  proposalPreview: string;
  workerCount: number;
  dissentCount: number;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
};

export type StandardConsensusRuntimeResult = {
  text: string;
  trace: StandardConsensusTrace;
  record: StandardConsensusRecord;
  workerRun: IntelligenceWorkerRunRecord;
  workers: IntelligenceWorkerOutputRecord[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function hashObject(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(redactSecretsDeep(value))).digest('hex');
}

function hashText(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function mapWorkerSelections(value: unknown): IntelligenceWorkerSelection[] {
  return asRecordArray(value).map((item, index) => {
    const selection = normalizeIntelligenceSelection(item.selection, 'workspace');
    if (selection.mode !== 'single') {
      throw new ValidationError('Standard Consensus workers must use connected intelligence selections');
    }
    return {
      workerKey: asString(item.workerKey) ?? `worker-${index + 1}`,
      label: asString(item.label) ?? undefined,
      selection,
    };
  });
}

function mapConfiguration(row: Record<string, unknown>): StandardConsensusConfigurationRecord {
  const workerSelections = mapWorkerSelections(row.worker_selections);
  if (workerSelections.length < 2) throw new ValidationError('Standard Consensus requires at least two workers');
  const quorumCount = Number(row.quorum_count ?? 2);
  return {
    id: String(row.id),
    ownerAgentId: String(row.owner_agent_id),
    workspaceId: String(row.workspace_id),
    displayName: String(row.display_name ?? 'Standard Consensus'),
    status: row.status === 'active' ? 'active' : 'disabled',
    strategy: 'standard',
    workerSelections,
    quorumCount: Math.max(2, Math.min(quorumCount, workerSelections.length)),
    preserveDissent: row.preserve_dissent !== false,
    metadata: redactSecretsDeep(asRecord(row.metadata)) as Record<string, unknown>,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function mapConsensusRecord(row: Record<string, unknown>): StandardConsensusRecord {
  return {
    id: String(row.id),
    ownerAgentId: String(row.owner_agent_id),
    workspaceId: String(row.workspace_id),
    sessionId: asString(row.session_id),
    taskId: asString(row.task_id),
    executionId: asString(row.execution_id),
    consensusConfigurationId: String(row.consensus_configuration_id),
    workerRunId: asString(row.worker_run_id),
    status: String(row.status ?? 'running') as ConsensusStatus,
    requestHash: String(row.request_hash ?? ''),
    consensusHash: asString(row.consensus_hash),
    configurationSnapshot: redactSecretsDeep(asRecord(row.configuration_snapshot)) as Record<string, unknown>,
    result: redactSecretsDeep(asRecord(row.result)) as Record<string, unknown>,
    dissent: redactSecretsDeep(asRecordArray(row.dissent)) as Array<Record<string, unknown>>,
    usage: redactSecretsDeep(asRecord(row.usage)) as Record<string, unknown>,
    errorCode: asString(row.error_code),
    errorMessage: typeof row.error_message === 'string' ? redactSecretsInString(row.error_message) : null,
    startedAt: asString(row.started_at),
    completedAt: asString(row.completed_at),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

async function audit(params: {
  ownerAgentId: string;
  workspaceId: string;
  sessionId?: string | null;
  taskId?: string | null;
  action: string;
  success: boolean;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await logSuperAgentAudit({
    userId: params.ownerAgentId,
    workspaceId: params.workspaceId,
    sessionId: params.sessionId ?? null,
    taskId: params.taskId ?? null,
    action: params.action,
    success: params.success,
    errorMessage: params.errorMessage ?? null,
    metadata: redactSecretsDeep(params.metadata ?? {}) as Record<string, unknown>,
  });
}

async function loadActiveConnectionConfiguration(params: {
  ownerAgentId: string;
  workspaceId: string;
  configurationId: string;
}): Promise<StandardConsensusConfigurationRecord> {
  const { data, error } = await getSupabaseAdmin()
    .from('intelligence_connections')
    .select('id,vendor,display_name,selected_model_id,status,updated_at')
    .eq('owner_agent_id', params.ownerAgentId)
    .eq('workspace_id', params.workspaceId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(4);
  if (error) throw new Error(`Failed to load Standard Consensus connections: ${error.message}`);

  const workerSelections = ((data ?? []) as Array<Record<string, unknown>>)
    .filter(row => asString(row.id) && asString(row.selected_model_id))
    .slice(0, 4)
    .map((row, index) => {
      const vendor = asString(row.vendor) ?? 'connected';
      const modelId = asString(row.selected_model_id) ?? '';
      return {
        workerKey: `${vendor}-${index + 1}`,
        label: `${asString(row.display_name) ?? vendor} ${modelId}`.trim(),
        selection: {
          mode: 'single',
          connectionId: String(row.id),
          modelId,
          consensusConfigurationId: null,
          selectionSource: 'workspace',
        } satisfies IntelligenceSelection,
      };
    });
  if (workerSelections.length < 2) {
    throw new ValidationError('Standard Consensus requires at least two active connected intelligence connections');
  }

  const now = new Date().toISOString();
  return {
    id: params.configurationId,
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
    displayName: 'Standard Consensus',
    status: 'active',
    strategy: 'standard',
    workerSelections,
    quorumCount: 2,
    preserveDissent: true,
    metadata: { source: 'workspace_active_connections' },
    createdAt: now,
    updatedAt: now,
  };
}

export async function resolveStandardConsensusConfiguration(params: {
  ownerAgentId: string;
  workspaceId: string;
  consensusConfigurationId: string;
}): Promise<StandardConsensusConfigurationRecord> {
  await assertWorkspaceMembership(params.workspaceId, params.ownerAgentId);
  const configurationId = params.consensusConfigurationId.trim();
  if (!configurationId) throw new ValidationError('consensusConfigurationId is required');
  if (['standard', 'standard-consensus', 'standard_consensus'].includes(configurationId)) {
    return loadActiveConnectionConfiguration({
      ownerAgentId: params.ownerAgentId,
      workspaceId: params.workspaceId,
      configurationId,
    });
  }

  const { data, error } = await getSupabaseAdmin()
    .from('intelligence_consensus_configurations')
    .select('*')
    .eq('id', configurationId)
    .eq('owner_agent_id', params.ownerAgentId)
    .eq('workspace_id', params.workspaceId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load Standard Consensus configuration: ${error.message}`);
  if (!data) throw new PermissionError('Standard Consensus configuration not found or not accessible');

  const configuration = mapConfiguration(data as Record<string, unknown>);
  if (configuration.status !== 'active') throw new PermissionError('Standard Consensus configuration is not active');
  return configuration;
}

async function createConsensusRecord(params: {
  ownerAgentId: string;
  workspaceId: string;
  sessionId?: string | null;
  taskId?: string | null;
  executionId?: string | null;
  configuration: StandardConsensusConfigurationRecord;
  message: string;
}): Promise<StandardConsensusRecord> {
  const now = new Date().toISOString();
  const configurationSnapshot = {
    id: params.configuration.id,
    strategy: params.configuration.strategy,
    quorumCount: params.configuration.quorumCount,
    preserveDissent: params.configuration.preserveDissent,
    workerSelections: params.configuration.workerSelections.map(worker => ({
      workerKey: worker.workerKey,
      label: worker.label ?? null,
      selection: worker.selection,
    })),
    metadata: params.configuration.metadata,
  };
  const row = {
    id: crypto.randomUUID(),
    owner_agent_id: params.ownerAgentId,
    workspace_id: params.workspaceId,
    session_id: params.sessionId ?? null,
    task_id: params.taskId ?? null,
    execution_id: params.executionId ?? null,
    consensus_configuration_id: params.configuration.id,
    worker_run_id: null,
    status: 'running',
    request_hash: hashObject({ message: params.message, configurationSnapshot }),
    consensus_hash: null,
    configuration_snapshot: redactSecretsDeep(configurationSnapshot) as Record<string, unknown>,
    result: {},
    dissent: [],
    usage: {},
    error_code: null,
    error_message: null,
    started_at: now,
    completed_at: null,
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await getSupabaseAdmin()
    .from('intelligence_consensus_records')
    .insert(row)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to create Standard Consensus record: ${error.message}`);
  return mapConsensusRecord(data as Record<string, unknown>);
}

async function updateConsensusRecord(params: {
  ownerAgentId: string;
  recordId: string;
  patch: Record<string, unknown>;
}): Promise<StandardConsensusRecord> {
  const patch = { ...params.patch, updated_at: new Date().toISOString() };
  const { data, error } = await getSupabaseAdmin()
    .from('intelligence_consensus_records')
    .update(redactSecretsDeep(patch) as Record<string, unknown>)
    .eq('id', params.recordId)
    .eq('owner_agent_id', params.ownerAgentId)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update Standard Consensus record: ${error.message}`);
  return mapConsensusRecord(data as Record<string, unknown>);
}

function consensusWorkerPrompt(params: { message: string; intent?: AgentOSIntent | null }): string {
  return [
    'Standard Consensus worker review for Super AgentOS.',
    params.intent ? `Detected intent: ${params.intent}.` : null,
    'Return independent reasoning only. Do not execute tools, claim execution, merge other worker views, or fabricate success.',
    'Super AgentOS will preserve dissent and remains the only AgentOS execution authority.',
    'Original user request:',
    params.message,
  ].filter(Boolean).join('\n\n');
}

export function buildStandardConsensusProposalPrompt(params: {
  message: string;
  intent: AgentOSIntent;
}): string {
  return [
    'Standard Consensus proposal-only review for Super AgentOS validation.',
    `Detected intent: ${params.intent}.`,
    'Each worker must propose the safest AgentOS operation to consider, approval requirement, risks, blockers, and verification checks.',
    'Do not execute tools, claim execution, fabricate success, or ask the user to leave Super AgentOS.',
    'Original user request:',
    params.message,
  ].join('\n\n');
}

function outputText(output: IntelligenceWorkerOutputRecord): string {
  return redactSecretsInString(typeof output.output.text === 'string' ? output.output.text : '');
}

function previewText(value: string, maxLength = 700): string {
  return redactSecretsInString(value)
    .replace(/\b(authorization|bearer|token|secret|password|api[_ -]?key)\b[^\n\r]{0,180}/gi, '[redacted]')
    .slice(0, maxLength);
}

function buildConsensusResult(params: {
  configuration: StandardConsensusConfigurationRecord;
  workerRun: IntelligenceWorkerRunRecord;
  workers: IntelligenceWorkerOutputRecord[];
}): {
  text: string;
  result: Record<string, unknown>;
  dissent: Array<Record<string, unknown>>;
  consensusHash: string;
} {
  const completed = params.workers
    .filter(worker => worker.status === 'completed')
    .map(worker => ({
      workerKey: worker.workerKey,
      outputHash: worker.outputHash ?? hashText(outputText(worker)),
      text: outputText(worker),
      usage: worker.usage,
    }));
  if (completed.length < params.configuration.quorumCount) {
    throw new ValidationError('Standard Consensus quorum was not reached');
  }

  const leading = completed[0];
  const normalizedLeading = leading.text.trim().replace(/\s+/g, ' ').toLowerCase();
  const dissent = completed
    .slice(1)
    .filter(worker => worker.text.trim().replace(/\s+/g, ' ').toLowerCase() !== normalizedLeading)
    .map(worker => ({
      workerKey: worker.workerKey,
      outputHash: worker.outputHash,
      text: worker.text,
      usage: worker.usage,
    }));
  const failedWorkers = params.workers
    .filter(worker => worker.status === 'failed' || worker.status === 'cancelled')
    .map(worker => ({
      workerKey: worker.workerKey,
      status: worker.status,
      errorCode: worker.errorCode,
      errorMessage: worker.errorMessage,
    }));

  const text = [
    'Standard Consensus result',
    dissent.length
      ? `Consensus basis: ${completed.length - dissent.length} of ${completed.length} completed worker outputs aligned with the selected direction; dissent is preserved below.`
      : `Consensus basis: ${completed.length} completed worker outputs aligned with the selected direction.`,
    'Selected direction:',
    leading.text || 'No proposal text was produced.',
    'Dissent and alternatives:',
    dissent.length
      ? dissent.map(item => `- ${item.workerKey}: ${item.text || 'No proposal text was produced.'}`).join('\n')
      : 'No distinct dissent recorded.',
    failedWorkers.length
      ? `Unavailable worker outputs:\n${failedWorkers.map(item => `- ${item.workerKey}: ${item.status}`).join('\n')}`
      : null,
    'Super AgentOS has not executed any AgentOS capability from this consensus. Super AgentOS will validate, request approval when required, execute through AgentOS operations only, and record provenance.',
  ].filter(Boolean).join('\n\n');

  const result = {
    strategy: 'standard',
    workerRunId: params.workerRun.id,
    workerRunStatus: params.workerRun.status,
    leadingWorkerKey: leading.workerKey,
    workerCount: params.workers.length,
    completedCount: completed.length,
    agreementCount: completed.length - dissent.length,
    dissentCount: dissent.length,
    unavailableCount: failedWorkers.length,
    preserveDissent: true,
    text,
    workerOutputs: completed.map(worker => ({
      workerKey: worker.workerKey,
      outputHash: worker.outputHash,
      preview: previewText(worker.text, 500),
    })),
    unavailableWorkers: failedWorkers,
  };
  const consensusHash = hashObject({ result, dissent });
  return { text, result, dissent, consensusHash };
}

function buildTrace(params: {
  record: StandardConsensusRecord;
  workerRun: IntelligenceWorkerRunRecord;
  text: string;
  dissentCount: number;
}): StandardConsensusTrace {
  const consensusHash = params.record.consensusHash ?? hashText(params.text);
  return {
    kind: 'standard_consensus',
    status: 'completed',
    executionAuthority: 'super_agentos',
    connectedIntelligenceRole: 'proposal_only',
    consensusRecordId: params.record.id,
    workerRunId: params.workerRun.id,
    consensusConfigurationId: params.record.consensusConfigurationId,
    consensusHash,
    proposalHash: consensusHash,
    proposalPreview: previewText(params.text),
    workerCount: params.workerRun.workerCount,
    dissentCount: params.dissentCount,
    usage: {
      inputTokens: Number(params.record.usage.inputTokens ?? 0),
      outputTokens: Number(params.record.usage.outputTokens ?? 0),
      totalTokens: Number(params.record.usage.totalTokens ?? 0),
    },
  };
}

export async function runStandardConsensusRuntime(params: {
  ownerAgentId: string;
  workspaceId: string;
  projectId?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
  executionId?: string | null;
  selection: IntelligenceSelection;
  workspaceContext: WorkspaceContextPackage;
  message: string;
  intent?: AgentOSIntent | null;
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  signal?: AbortSignal;
}): Promise<StandardConsensusRuntimeResult> {
  const selection = normalizeIntelligenceSelection(params.selection, params.selection.selectionSource);
  if (selection.mode !== 'consensus' || !selection.consensusConfigurationId) {
    throw new ValidationError('Standard Consensus selection is required');
  }
  const configuration = await resolveStandardConsensusConfiguration({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
    consensusConfigurationId: selection.consensusConfigurationId,
  });
  let record = await createConsensusRecord({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
    sessionId: params.sessionId,
    taskId: params.taskId,
    executionId: params.executionId,
    configuration,
    message: params.message,
  });
  await audit({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
    sessionId: params.sessionId,
    taskId: params.taskId,
    action: 'intelligence.standard_consensus_started',
    success: true,
    metadata: { consensusRecordId: record.id, consensusConfigurationId: configuration.id },
  });

  try {
    const workerRunResult = await runMultiIntelligenceWorkers({
      ownerAgentId: params.ownerAgentId,
      workspaceId: params.workspaceId,
      projectId: params.projectId,
      sessionId: params.sessionId,
      taskId: params.taskId,
      executionId: params.executionId,
      workspaceContext: params.workspaceContext,
      message: consensusWorkerPrompt({ message: params.message, intent: params.intent }),
      workers: configuration.workerSelections,
      recentMessages: params.recentMessages,
      signal: params.signal,
    });
    const consensus = buildConsensusResult({
      configuration,
      workerRun: workerRunResult.run,
      workers: workerRunResult.workers,
    });
    record = await updateConsensusRecord({
      ownerAgentId: params.ownerAgentId,
      recordId: record.id,
      patch: {
        status: params.signal?.aborted ? 'cancelled' : 'completed',
        worker_run_id: workerRunResult.run.id,
        consensus_hash: consensus.consensusHash,
        result: consensus.result,
        dissent: consensus.dissent,
        usage: workerRunResult.run.usage,
        completed_at: new Date().toISOString(),
      },
    });
    await audit({
      ownerAgentId: params.ownerAgentId,
      workspaceId: params.workspaceId,
      sessionId: params.sessionId,
      taskId: params.taskId,
      action: 'intelligence.standard_consensus_completed',
      success: true,
      metadata: {
        consensusRecordId: record.id,
        workerRunId: workerRunResult.run.id,
        dissentCount: consensus.dissent.length,
        consensusHash: consensus.consensusHash,
      },
    });
    return {
      text: consensus.text,
      trace: buildTrace({
        record,
        workerRun: workerRunResult.run,
        text: consensus.text,
        dissentCount: consensus.dissent.length,
      }),
      record,
      workerRun: workerRunResult.run,
      workers: workerRunResult.workers,
    };
  } catch (error) {
    const cancelled = params.signal?.aborted;
    record = await updateConsensusRecord({
      ownerAgentId: params.ownerAgentId,
      recordId: record.id,
      patch: {
        status: cancelled ? 'cancelled' : 'failed',
        error_code: cancelled ? 'cancelled' : 'standard_consensus_failed',
        error_message: redactSecretsInString(error instanceof Error ? error.message : 'Standard Consensus failed'),
        completed_at: new Date().toISOString(),
      },
    }).catch(() => record);
    await audit({
      ownerAgentId: params.ownerAgentId,
      workspaceId: params.workspaceId,
      sessionId: params.sessionId,
      taskId: params.taskId,
      action: 'intelligence.standard_consensus_failed',
      success: false,
      errorMessage: record.errorMessage,
      metadata: { consensusRecordId: record.id },
    });
    throw error;
  }
}

export async function requestStandardConsensusProposalOnly(params: {
  ownerAgentId: string;
  workspaceId: string;
  projectId?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
  executionId?: string | null;
  selection: IntelligenceSelection;
  workspaceContext: WorkspaceContextPackage;
  message: string;
  intent: AgentOSIntent;
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  signal?: AbortSignal;
}): Promise<{ text: string; trace: StandardConsensusTrace }> {
  const result = await runStandardConsensusRuntime({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
    projectId: params.projectId,
    sessionId: params.sessionId,
    taskId: params.taskId,
    executionId: params.executionId,
    selection: params.selection,
    workspaceContext: params.workspaceContext,
    message: buildStandardConsensusProposalPrompt({ message: params.message, intent: params.intent }),
    intent: params.intent,
    recentMessages: params.recentMessages,
    signal: params.signal,
  });
  return {
    text: result.text,
    trace: result.trace,
  };
}
