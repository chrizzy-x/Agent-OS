import crypto from 'crypto';
import { logSuperAgentAudit } from '../audit/super-agent.js';
import { redactSecretsDeep, redactSecretsInString } from '../security/secret-redaction.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { ValidationError } from '../utils/errors.js';
import type { buildWorkspaceContextPackage } from '../workspace-context/service.js';
import { assertWorkspaceMembership } from '../workspaces/service.js';
import { resolveSingleIntelligenceSelection, runSingleIntelligenceRuntime, type SingleIntelligenceRuntimeResult } from './runtime.js';
import type { IntelligenceConnectionRecord } from './service.js';
import type { IntelligenceSelection } from './selection.js';

type WorkspaceContextPackage = Awaited<ReturnType<typeof buildWorkspaceContextPackage>>;
type WorkerStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type IntelligenceWorkerRunRecord = {
  id: string;
  ownerAgentId: string;
  workspaceId: string;
  sessionId: string | null;
  taskId: string | null;
  executionId: string | null;
  status: WorkerStatus;
  requestFingerprint: string | null;
  workerCount: number;
  completedCount: number;
  failedCount: number;
  cancelledCount: number;
  usage: Record<string, unknown>;
  metadata: Record<string, unknown>;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IntelligenceWorkerOutputRecord = {
  id: string;
  runId: string;
  ownerAgentId: string;
  workspaceId: string;
  workerKey: string;
  connectionId: string | null;
  invocationId: string | null;
  vendor: IntelligenceConnectionRecord['vendor'] | null;
  modelId: string | null;
  status: WorkerStatus;
  outputHash: string | null;
  output: Record<string, unknown>;
  usage: Record<string, unknown>;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IntelligenceWorkerSelection = {
  workerKey?: string;
  label?: string;
  selection: IntelligenceSelection;
};

export type MultiIntelligenceWorkerRunResult = {
  run: IntelligenceWorkerRunRecord;
  workers: IntelligenceWorkerOutputRecord[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hashObject(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(redactSecretsDeep(value))).digest('hex');
}

function hashText(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function requiredText(value: string | undefined, label: string): string {
  const text = value?.trim();
  if (!text) throw new ValidationError(`${label} is required`);
  return text;
}

function mapRun(row: Record<string, unknown>): IntelligenceWorkerRunRecord {
  return {
    id: String(row.id),
    ownerAgentId: String(row.owner_agent_id),
    workspaceId: String(row.workspace_id),
    sessionId: typeof row.session_id === 'string' ? row.session_id : null,
    taskId: typeof row.task_id === 'string' ? row.task_id : null,
    executionId: typeof row.execution_id === 'string' ? row.execution_id : null,
    status: String(row.status ?? 'queued') as WorkerStatus,
    requestFingerprint: typeof row.request_fingerprint === 'string' ? row.request_fingerprint : null,
    workerCount: Number(row.worker_count ?? 0),
    completedCount: Number(row.completed_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    cancelledCount: Number(row.cancelled_count ?? 0),
    usage: asRecord(row.usage),
    metadata: redactSecretsDeep(asRecord(row.metadata)) as Record<string, unknown>,
    startedAt: typeof row.started_at === 'string' ? row.started_at : null,
    completedAt: typeof row.completed_at === 'string' ? row.completed_at : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function mapOutput(row: Record<string, unknown>): IntelligenceWorkerOutputRecord {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    ownerAgentId: String(row.owner_agent_id),
    workspaceId: String(row.workspace_id),
    workerKey: String(row.worker_key),
    connectionId: typeof row.connection_id === 'string' ? row.connection_id : null,
    invocationId: typeof row.invocation_id === 'string' ? row.invocation_id : null,
    vendor: row.vendor === 'openai' || row.vendor === 'anthropic' || row.vendor === 'gemini' ? row.vendor : null,
    modelId: typeof row.model_id === 'string' ? row.model_id : null,
    status: String(row.status ?? 'queued') as WorkerStatus,
    outputHash: typeof row.output_hash === 'string' ? row.output_hash : null,
    output: redactSecretsDeep(asRecord(row.output)) as Record<string, unknown>,
    usage: redactSecretsDeep(asRecord(row.usage)) as Record<string, unknown>,
    errorCode: typeof row.error_code === 'string' ? row.error_code : null,
    errorMessage: typeof row.error_message === 'string' ? redactSecretsInString(row.error_message) : null,
    startedAt: typeof row.started_at === 'string' ? row.started_at : null,
    completedAt: typeof row.completed_at === 'string' ? row.completed_at : null,
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

async function createRun(params: {
  ownerAgentId: string;
  workspaceId: string;
  sessionId?: string | null;
  taskId?: string | null;
  executionId?: string | null;
  workerCount: number;
  requestFingerprint: string;
  metadata?: Record<string, unknown>;
}): Promise<IntelligenceWorkerRunRecord> {
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    owner_agent_id: params.ownerAgentId,
    workspace_id: params.workspaceId,
    session_id: params.sessionId ?? null,
    task_id: params.taskId ?? null,
    execution_id: params.executionId ?? null,
    status: 'queued',
    request_fingerprint: params.requestFingerprint,
    worker_count: params.workerCount,
    completed_count: 0,
    failed_count: 0,
    cancelled_count: 0,
    usage: {},
    metadata: redactSecretsDeep(params.metadata ?? {}) as Record<string, unknown>,
    started_at: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await getSupabaseAdmin()
    .from('intelligence_worker_runs')
    .insert(row)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to create intelligence worker run: ${error.message}`);
  return mapRun(data as Record<string, unknown>);
}

async function updateRun(params: {
  ownerAgentId: string;
  runId: string;
  patch: Record<string, unknown>;
}): Promise<IntelligenceWorkerRunRecord> {
  const patch = { ...params.patch, updated_at: new Date().toISOString() };
  const { data, error } = await getSupabaseAdmin()
    .from('intelligence_worker_runs')
    .update(redactSecretsDeep(patch) as Record<string, unknown>)
    .eq('id', params.runId)
    .eq('owner_agent_id', params.ownerAgentId)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update intelligence worker run: ${error.message}`);
  return mapRun(data as Record<string, unknown>);
}

async function createWorkerOutput(params: {
  run: IntelligenceWorkerRunRecord;
  workerKey: string;
  connection: IntelligenceConnectionRecord;
  modelId: string;
}): Promise<IntelligenceWorkerOutputRecord> {
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    run_id: params.run.id,
    owner_agent_id: params.run.ownerAgentId,
    workspace_id: params.run.workspaceId,
    worker_key: params.workerKey,
    connection_id: params.connection.id,
    invocation_id: null,
    vendor: params.connection.vendor,
    model_id: params.modelId,
    status: 'queued',
    output_hash: null,
    output: {},
    usage: {},
    error_code: null,
    error_message: null,
    started_at: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await getSupabaseAdmin()
    .from('intelligence_worker_outputs')
    .insert(row)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to create intelligence worker output: ${error.message}`);
  return mapOutput(data as Record<string, unknown>);
}

async function updateWorkerOutput(params: {
  ownerAgentId: string;
  workerOutputId: string;
  patch: Record<string, unknown>;
}): Promise<IntelligenceWorkerOutputRecord> {
  const patch = { ...params.patch, updated_at: new Date().toISOString() };
  const { data, error } = await getSupabaseAdmin()
    .from('intelligence_worker_outputs')
    .update(redactSecretsDeep(patch) as Record<string, unknown>)
    .eq('id', params.workerOutputId)
    .eq('owner_agent_id', params.ownerAgentId)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update intelligence worker output: ${error.message}`);
  return mapOutput(data as Record<string, unknown>);
}

function workerPrompt(params: { message: string; workerKey: string; label?: string | null }): string {
  return [
    `Worker key: ${params.workerKey}.`,
    params.label ? `Worker label: ${params.label}.` : null,
    'Return only this worker output for Super AgentOS. Do not execute AgentOS capabilities. Do not merge with other workers.',
    'User request:',
    params.message,
  ].filter(Boolean).join('\n\n');
}

function usageFromResult(result: SingleIntelligenceRuntimeResult): Record<string, unknown> {
  return {
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    totalTokens: result.usage.totalTokens,
    finishReason: result.finishReason,
  };
}

function sumUsage(outputs: IntelligenceWorkerOutputRecord[]): Record<string, unknown> {
  return outputs.reduce((acc, output) => {
    acc.inputTokens += Number(output.usage.inputTokens ?? 0);
    acc.outputTokens += Number(output.usage.outputTokens ?? 0);
    acc.totalTokens += Number(output.usage.totalTokens ?? 0);
    return acc;
  }, { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
}

export async function runMultiIntelligenceWorkers(params: {
  ownerAgentId: string;
  workspaceId: string;
  projectId?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
  executionId?: string | null;
  workspaceContext: WorkspaceContextPackage;
  message: string;
  workers: IntelligenceWorkerSelection[];
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  signal?: AbortSignal;
}): Promise<MultiIntelligenceWorkerRunResult> {
  const message = requiredText(params.message, 'message');
  const workers = params.workers.slice(0, 8);
  if (workers.length < 2) throw new ValidationError('At least two intelligence workers are required');
  await assertWorkspaceMembership(params.workspaceId, params.ownerAgentId);

  const resolved = await Promise.all(workers.map(async (worker, index) => {
    const workerKey = worker.workerKey?.trim() || `worker-${index + 1}`;
    const selected = await resolveSingleIntelligenceSelection({
      ownerAgentId: params.ownerAgentId,
      workspaceId: params.workspaceId,
      selection: worker.selection,
    });
    return { ...selected, workerKey, label: worker.label ?? null };
  }));
  const uniqueWorkerKeys = new Set(resolved.map(worker => worker.workerKey));
  if (uniqueWorkerKeys.size !== resolved.length) throw new ValidationError('Worker keys must be unique');

  let run = await createRun({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
    sessionId: params.sessionId,
    taskId: params.taskId,
    executionId: params.executionId,
    workerCount: resolved.length,
    requestFingerprint: hashObject({
      message,
      workers: resolved.map(worker => ({
        workerKey: worker.workerKey,
        connectionId: worker.connection.id,
        modelId: worker.modelId,
      })),
    }),
    metadata: {
      isolatedOutputs: true,
      executionAuthority: 'super_agentos',
      workerKeys: resolved.map(worker => worker.workerKey),
    },
  });
  const outputs = await Promise.all(resolved.map(worker => createWorkerOutput({
    run,
    workerKey: worker.workerKey,
    connection: worker.connection,
    modelId: worker.modelId,
  })));
  run = await updateRun({
    ownerAgentId: params.ownerAgentId,
    runId: run.id,
    patch: { status: 'running', started_at: new Date().toISOString() },
  });
  await audit({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
    sessionId: params.sessionId,
    taskId: params.taskId,
    action: 'intelligence.worker_run_started',
    success: true,
    metadata: { runId: run.id, workerCount: outputs.length },
  });

  const completedOutputs = await Promise.all(outputs.map(async (output, index) => {
    const worker = resolved[index];
    if (params.signal?.aborted) {
      return updateWorkerOutput({
        ownerAgentId: params.ownerAgentId,
        workerOutputId: output.id,
        patch: { status: 'cancelled', completed_at: new Date().toISOString(), error_code: 'cancelled' },
      });
    }
    const startedAt = new Date().toISOString();
    await updateWorkerOutput({
      ownerAgentId: params.ownerAgentId,
      workerOutputId: output.id,
      patch: { status: 'running', started_at: startedAt },
    });
    try {
      const result = await runSingleIntelligenceRuntime({
        ownerAgentId: params.ownerAgentId,
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        sessionId: params.sessionId,
        taskId: params.taskId,
        executionId: params.executionId,
        selection: worker.selection,
        workspaceContext: params.workspaceContext,
        message: workerPrompt({ message, workerKey: worker.workerKey, label: worker.label }),
        recentMessages: params.recentMessages,
        signal: params.signal,
        purpose: 'multi_worker',
      });
      return updateWorkerOutput({
        ownerAgentId: params.ownerAgentId,
        workerOutputId: output.id,
        patch: {
          status: 'completed',
          invocation_id: result.invocation.id,
          output_hash: hashText(result.text),
          output: {
            isolated: true,
            text: redactSecretsInString(result.text),
          },
          usage: usageFromResult(result),
          completed_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      const cancelled = params.signal?.aborted;
      return updateWorkerOutput({
        ownerAgentId: params.ownerAgentId,
        workerOutputId: output.id,
        patch: {
          status: cancelled ? 'cancelled' : 'failed',
          error_code: cancelled ? 'cancelled' : 'worker_failed',
          error_message: redactSecretsInString(error instanceof Error ? error.message : 'Worker failed'),
          completed_at: new Date().toISOString(),
        },
      });
    }
  }));

  const completedCount = completedOutputs.filter(output => output.status === 'completed').length;
  const failedCount = completedOutputs.filter(output => output.status === 'failed').length;
  const cancelledCount = completedOutputs.filter(output => output.status === 'cancelled').length;
  const finalStatus: WorkerStatus = cancelledCount > 0
    ? 'cancelled'
    : failedCount > 0
      ? 'failed'
      : 'completed';
  run = await updateRun({
    ownerAgentId: params.ownerAgentId,
    runId: run.id,
    patch: {
      status: finalStatus,
      completed_count: completedCount,
      failed_count: failedCount,
      cancelled_count: cancelledCount,
      usage: sumUsage(completedOutputs),
      completed_at: new Date().toISOString(),
    },
  });
  await audit({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
    sessionId: params.sessionId,
    taskId: params.taskId,
    action: 'intelligence.worker_run_completed',
    success: finalStatus === 'completed',
    metadata: {
      runId: run.id,
      status: finalStatus,
      completedCount,
      failedCount,
      cancelledCount,
    },
  });
  return { run, workers: completedOutputs };
}

export async function cancelMultiIntelligenceRun(params: {
  ownerAgentId: string;
  runId: string;
}): Promise<IntelligenceWorkerRunRecord> {
  const completedAt = new Date().toISOString();
  const run = await updateRun({
    ownerAgentId: params.ownerAgentId,
    runId: params.runId,
    patch: { status: 'cancelled', completed_at: completedAt },
  });
  await getSupabaseAdmin()
    .from('intelligence_worker_outputs')
    .update({
      status: 'cancelled',
      error_code: 'cancelled',
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq('run_id', params.runId)
    .eq('owner_agent_id', params.ownerAgentId)
    .in('status', ['queued', 'running']);
  await audit({
    ownerAgentId: params.ownerAgentId,
    workspaceId: run.workspaceId,
    sessionId: run.sessionId,
    taskId: run.taskId,
    action: 'intelligence.worker_run_cancelled',
    success: true,
    metadata: { runId: run.id },
  });
  return run;
}
