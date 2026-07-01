import crypto from 'crypto';
import { createNotification } from '../notifications/service.js';
import { redactSecretsDeep } from '../security/secret-redaction.js';
import { readLocalRuntimeState, updateLocalRuntimeState } from '../storage/local-state.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { updateAgentTask } from '../tasks/service.js';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ConfirmationStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type ConfirmationRecord = {
  id: string;
  userId: string;
  taskId: string | null;
  capabilityId: string | null;
  actionId: string | null;
  actionName: string;
  riskLevel: RiskLevel;
  status: ConfirmationStatus;
  dataSummary: string;
  secretScopes: string[];
  expectedResult: string;
  payload: Record<string, unknown>;
  approvalCount: number;
  requiredApprovals: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export type ConfirmationPolicy = {
  confirmationRequired: boolean;
  requiredApprovals: number;
  reason: string;
};

const RISK_LEVELS = new Set<RiskLevel>(['low', 'medium', 'high', 'critical']);
const WRITE_WORDS = /\b(create|update|publish|send|deploy|install|delete|transfer|trade|execute|launch|write|save|remove|rotate|assign|unassign)\b/i;
const CRITICAL_WORDS = /\b(wallet|trade|trading|private key|seed phrase|token launch|market launch|production deploy|irreversible delete)\b/i;

function localFallbackAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function normalizeRiskLevel(value: unknown): RiskLevel {
  return RISK_LEVELS.has(value as RiskLevel) ? value as RiskLevel : 'low';
}

export function evaluateConfirmationPolicy(params: {
  actionName: string;
  riskLevel?: RiskLevel;
  confirmationRequired?: boolean;
  permissions?: string[];
  requiredSecrets?: string[];
}): ConfirmationPolicy {
  const riskLevel = normalizeRiskLevel(params.riskLevel);
  const text = `${params.actionName} ${(params.permissions ?? []).join(' ')}`;
  const usesSecrets = (params.requiredSecrets ?? []).length > 0;
  const writeAction = WRITE_WORDS.test(text);
  const critical = riskLevel === 'critical' || CRITICAL_WORDS.test(text);
  const highRisk = critical || riskLevel === 'high' || usesSecrets;
  const required = params.confirmationRequired === true || writeAction || highRisk;
  return {
    confirmationRequired: required,
    requiredApprovals: critical ? 2 : 1,
    reason: critical
      ? 'Critical action requires double confirmation.'
      : highRisk
        ? 'High-risk action requires explicit confirmation.'
        : writeAction
          ? 'Write action requires confirmation.'
          : required
            ? 'Capability requires confirmation.'
            : 'Read-only action can run without confirmation.',
  };
}

function mapConfirmation(row: Record<string, unknown>): ConfirmationRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id ?? row.userId),
    taskId: typeof (row.task_id ?? row.taskId) === 'string' ? String(row.task_id ?? row.taskId) : null,
    capabilityId: typeof (row.capability_id ?? row.capabilityId) === 'string' ? String(row.capability_id ?? row.capabilityId) : null,
    actionId: typeof (row.action_id ?? row.actionId) === 'string' ? String(row.action_id ?? row.actionId) : null,
    actionName: String(row.action_name ?? row.actionName ?? 'Action'),
    riskLevel: normalizeRiskLevel(row.risk_level ?? row.riskLevel),
    status: row.status === 'approved' || row.status === 'rejected' || row.status === 'expired' ? row.status : 'pending',
    dataSummary: String(row.data_summary ?? row.dataSummary ?? ''),
    secretScopes: stringArray(row.secret_scopes ?? row.secretScopes),
    expectedResult: String(row.expected_result ?? row.expectedResult ?? ''),
    payload: asRecord(row.payload),
    approvalCount: Number(row.approval_count ?? row.approvalCount ?? 0),
    requiredApprovals: Number(row.required_approvals ?? row.requiredApprovals ?? 1),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? new Date().toISOString()),
    resolvedAt: typeof (row.resolved_at ?? row.resolvedAt) === 'string' ? String(row.resolved_at ?? row.resolvedAt) : null,
  };
}

export async function createConfirmation(params: {
  userId: string;
  taskId?: string | null;
  capabilityId?: string | null;
  actionId?: string | null;
  actionName: string;
  riskLevel?: RiskLevel;
  dataSummary?: string;
  secretScopes?: string[];
  expectedResult?: string;
  payload?: Record<string, unknown>;
  requiredApprovals?: number;
}): Promise<ConfirmationRecord> {
  const actionName = params.actionName.trim();
  if (!actionName) throw new ValidationError('confirmation action name is required');
  const riskLevel = normalizeRiskLevel(params.riskLevel);
  const policy = evaluateConfirmationPolicy({
    actionName,
    riskLevel,
    confirmationRequired: true,
    requiredSecrets: params.secretScopes,
  });
  const requiredApprovals = Math.max(policy.requiredApprovals, params.requiredApprovals ?? policy.requiredApprovals);
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    user_id: params.userId,
    task_id: params.taskId ?? null,
    capability_id: params.capabilityId ?? null,
    action_id: params.actionId ?? null,
    action_name: actionName.slice(0, 240),
    risk_level: riskLevel,
    status: 'pending',
    data_summary: (params.dataSummary ?? '').slice(0, 2000),
    secret_scopes: params.secretScopes ?? [],
    expected_result: (params.expectedResult ?? '').slice(0, 2000),
    payload: redactSecretsDeep(params.payload ?? {}),
    approval_count: 0,
    required_approvals: Math.max(1, Math.min(requiredApprovals, 2)),
    created_at: now,
    updated_at: now,
    resolved_at: null,
  };
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('agent_confirmations')
      .insert(row)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    const confirmation = mapConfirmation(data as Record<string, unknown>);
    await createNotification({
      agentId: params.userId,
      type: 'approval_required',
      title: 'Approval required',
      body: `${confirmation.actionName} requires approval.`,
      metadata: {
        confirmationId: confirmation.id,
        taskId: confirmation.taskId,
        actionHref: `/tasks?confirmation=${confirmation.id}`,
        actionUrl: `/tasks?confirmation=${confirmation.id}`,
      },
    }).catch(() => undefined);
    return confirmation;
  } catch (error) {
    if (!localFallbackAllowed()) throw error;
    return updateLocalRuntimeState(state => {
      state.agentConfirmations.unshift(row);
      return mapConfirmation(row);
    });
  }
}

export async function listConfirmations(params: {
  userId: string;
  status?: ConfirmationStatus | 'all';
  taskId?: string | null;
  limit?: number;
}): Promise<ConfirmationRecord[]> {
  const limit = Math.max(1, Math.min(params.limit ?? 100, 250));
  try {
    let query = getSupabaseAdmin()
      .from('agent_confirmations')
      .select('*')
      .eq('user_id', params.userId)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (params.status && params.status !== 'all') query = query.eq('status', params.status);
    if (params.taskId) query = query.eq('task_id', params.taskId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map(mapConfirmation);
  } catch (error) {
    if (!localFallbackAllowed()) throw error;
    const state = await readLocalRuntimeState();
    return state.agentConfirmations
      .filter(item => String(item.user_id ?? item.userId) === params.userId)
      .filter(item => !params.status || params.status === 'all' || String(item.status) === params.status)
      .filter(item => !params.taskId || String(item.task_id ?? item.taskId) === params.taskId)
      .sort((left, right) => String(right.updated_at ?? right.updatedAt ?? '').localeCompare(String(left.updated_at ?? left.updatedAt ?? '')))
      .slice(0, limit)
      .map(mapConfirmation);
  }
}

export async function getConfirmation(params: {
  userId: string;
  confirmationId: string;
}): Promise<ConfirmationRecord> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('agent_confirmations')
      .select('*')
      .eq('id', params.confirmationId)
      .eq('user_id', params.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundError('Confirmation not found');
    return mapConfirmation(data as Record<string, unknown>);
  } catch (error) {
    if (!localFallbackAllowed()) throw error;
    const state = await readLocalRuntimeState();
    const confirmation = state.agentConfirmations.find(item =>
      String(item.id) === params.confirmationId
      && String(item.user_id ?? item.userId) === params.userId
    );
    if (!confirmation) throw new NotFoundError('Confirmation not found');
    return mapConfirmation(confirmation);
  }
}

async function patchConfirmation(params: {
  userId: string;
  confirmationId: string;
  patch: Record<string, unknown>;
}): Promise<ConfirmationRecord> {
  const patch = { ...params.patch, updated_at: new Date().toISOString() };
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('agent_confirmations')
      .update(patch)
      .eq('id', params.confirmationId)
      .eq('user_id', params.userId)
      .select('*')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundError('Confirmation not found');
    return mapConfirmation(data as Record<string, unknown>);
  } catch (error) {
    if (!localFallbackAllowed()) throw error;
    return updateLocalRuntimeState(state => {
      const index = state.agentConfirmations.findIndex(item =>
        String(item.id) === params.confirmationId
        && String(item.user_id ?? item.userId) === params.userId
      );
      if (index < 0) throw new NotFoundError('Confirmation not found');
      state.agentConfirmations[index] = { ...state.agentConfirmations[index], ...patch };
      return mapConfirmation(state.agentConfirmations[index]);
    });
  }
}

export async function approveConfirmation(params: {
  userId: string;
  confirmationId: string;
}): Promise<ConfirmationRecord> {
  const current = await getConfirmation(params);
  if (current.status !== 'pending') return current;
  const approvalCount = current.approvalCount + 1;
  const approved = approvalCount >= current.requiredApprovals;
  const confirmation = await patchConfirmation({
    ...params,
    patch: {
      approval_count: approvalCount,
      status: approved ? 'approved' : 'pending',
      resolved_at: approved ? new Date().toISOString() : null,
    },
  });
  if (approved && confirmation.taskId) {
    await updateAgentTask({
      userId: params.userId,
      taskId: confirmation.taskId,
      patch: { confirmationStatus: 'approved', status: 'queued' },
    }).catch(() => undefined);
  }
  return confirmation;
}

export async function rejectConfirmation(params: {
  userId: string;
  confirmationId: string;
}): Promise<ConfirmationRecord> {
  const confirmation = await patchConfirmation({
    ...params,
    patch: {
      status: 'rejected',
      resolved_at: new Date().toISOString(),
    },
  });
  if (confirmation.taskId) {
    await updateAgentTask({
      userId: params.userId,
      taskId: confirmation.taskId,
      patch: {
        confirmationStatus: 'rejected',
        status: 'cancelled',
        resultSummary: 'Task cancelled because approval was rejected.',
        progress: 100,
      },
    }).catch(() => undefined);
  }
  return confirmation;
}
