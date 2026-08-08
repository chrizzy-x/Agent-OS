import crypto from 'crypto';
import { logSuperAgentAudit } from '../audit/super-agent.js';
import { redactSecretsDeep, redactSecretsInString } from '../security/secret-redaction.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { supabaseRestRows } from '../storage/supabase-rest.js';
import { PermissionError, ValidationError } from '../utils/errors.js';
import { assertWorkspaceMembership } from '../workspaces/service.js';
import {
  IntelligenceMode,
  IntelligenceSelection,
  IntelligenceSelectionSource,
  LegacyIntelligenceConnectionMap,
  migrateLegacyExecutionTargetToIntelligenceSelection,
  normalizeIntelligenceSelection,
} from './selection.js';

export type IntelligenceVendor = 'openai' | 'anthropic' | 'gemini';
export type IntelligenceConnectionStatus = 'pending_validation' | 'active' | 'invalid' | 'disabled' | 'revoked';
export type IntelligenceInvocationStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type IntelligenceDefaultScope = 'user' | 'workspace';

export type IntelligenceConnectionRecord = {
  id: string;
  ownerAgentId: string;
  workspaceId: string;
  vaultSecretId: string;
  vendor: IntelligenceVendor;
  displayName: string;
  status: IntelligenceConnectionStatus;
  selectedModelId: string;
  availableModels: string[];
  capabilities: Record<string, unknown>;
  health: Record<string, unknown>;
  lastValidatedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IntelligenceDefaultRecord = {
  id: string;
  ownerAgentId: string;
  workspaceId: string | null;
  scope: IntelligenceDefaultScope;
  selection: IntelligenceSelection;
  createdAt: string;
  updatedAt: string;
};

export type StudioSessionIntelligenceRecord = {
  sessionId: string;
  ownerAgentId: string;
  workspaceId: string;
  selection: IntelligenceSelection;
  createdAt: string;
  updatedAt: string;
};

export type IntelligenceInvocationRecord = {
  id: string;
  ownerAgentId: string;
  workspaceId: string | null;
  sessionId: string | null;
  taskId: string | null;
  executionId: string | null;
  connectionId: string | null;
  mode: IntelligenceMode;
  vendor: IntelligenceVendor | null;
  modelId: string | null;
  consensusConfigurationId: string | null;
  selectionSource: IntelligenceSelectionSource;
  status: IntelligenceInvocationStatus;
  requestFingerprint: string | null;
  contextManifest: Record<string, unknown>;
  usage: Record<string, unknown>;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

const VENDORS = new Set<IntelligenceVendor>(['openai', 'anthropic', 'gemini']);
const CONNECTION_STATUSES = new Set<IntelligenceConnectionStatus>(['pending_validation', 'active', 'invalid', 'disabled', 'revoked']);
const INVOCATION_STATUSES = new Set<IntelligenceInvocationStatus>(['queued', 'running', 'completed', 'failed', 'cancelled']);
const INTELLIGENCE_CONNECTION_LIST_TIMEOUT_MS = 8_000;
const INTELLIGENCE_SESSION_QUERY_TIMEOUT_MS = 4_000;

function applyIntelligenceQueryTimeout<T>(query: T, timeoutMs: number): T {
  const timeout = (globalThis.AbortSignal as typeof AbortSignal & { timeout?: (ms: number) => AbortSignal }).timeout;
  const abortable = query as T & { abortSignal?: (signal: AbortSignal) => T };
  return typeof timeout === 'function' && typeof abortable.abortSignal === 'function'
    ? abortable.abortSignal(timeout(timeoutMs))
    : query;
}

function applyIntelligenceSessionQueryTimeout<T>(query: T): T {
  return applyIntelligenceQueryTimeout(query, INTELLIGENCE_SESSION_QUERY_TIMEOUT_MS);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function requiredText(value: string | undefined, label: string): string {
  const text = value?.trim();
  if (!text) throw new ValidationError(`${label} is required`);
  return text;
}

function optionalText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text || null;
}

function assertVendor(value: string): IntelligenceVendor {
  if (!VENDORS.has(value as IntelligenceVendor)) throw new ValidationError('Unsupported intelligence vendor');
  return value as IntelligenceVendor;
}

function mapConnection(row: Record<string, unknown>): IntelligenceConnectionRecord {
  return {
    id: String(row.id),
    ownerAgentId: String(row.owner_agent_id),
    workspaceId: String(row.workspace_id),
    vaultSecretId: String(row.vault_secret_id),
    vendor: assertVendor(String(row.vendor)),
    displayName: String(row.display_name ?? ''),
    status: CONNECTION_STATUSES.has(row.status as IntelligenceConnectionStatus)
      ? row.status as IntelligenceConnectionStatus
      : 'pending_validation',
    selectedModelId: String(row.selected_model_id ?? ''),
    availableModels: asStringArray(row.available_models),
    capabilities: asRecord(row.capabilities),
    health: asRecord(row.health),
    lastValidatedAt: typeof row.last_validated_at === 'string' ? row.last_validated_at : null,
    lastError: typeof row.last_error === 'string' ? redactSecretsInString(row.last_error) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function rowToSelection(row: Record<string, unknown>, fallbackSource: IntelligenceSelectionSource): IntelligenceSelection {
  return normalizeIntelligenceSelection({
    mode: row.mode,
    connectionId: row.connection_id,
    modelId: row.model_id,
    consensusConfigurationId: row.consensus_configuration_id,
    selectionSource: row.selection_source,
  }, fallbackSource);
}

function selectionToColumns(selection: IntelligenceSelection): Record<string, unknown> {
  return {
    mode: selection.mode,
    connection_id: selection.connectionId,
    model_id: selection.modelId,
    consensus_configuration_id: selection.consensusConfigurationId,
    selection_source: selection.selectionSource,
  };
}

function mapDefault(row: Record<string, unknown>): IntelligenceDefaultRecord {
  return {
    id: String(row.id),
    ownerAgentId: String(row.owner_agent_id),
    workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : null,
    scope: row.scope === 'workspace' ? 'workspace' : 'user',
    selection: rowToSelection(row, row.scope === 'workspace' ? 'workspace' : 'user'),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function mapSessionIntelligence(row: Record<string, unknown>): StudioSessionIntelligenceRecord {
  return {
    sessionId: String(row.session_id),
    ownerAgentId: String(row.owner_agent_id),
    workspaceId: String(row.workspace_id),
    selection: rowToSelection(row, 'session'),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function mapInvocation(row: Record<string, unknown>): IntelligenceInvocationRecord {
  return {
    id: String(row.id),
    ownerAgentId: String(row.owner_agent_id),
    workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : null,
    sessionId: typeof row.session_id === 'string' ? row.session_id : null,
    taskId: typeof row.task_id === 'string' ? row.task_id : null,
    executionId: typeof row.execution_id === 'string' ? row.execution_id : null,
    connectionId: typeof row.connection_id === 'string' ? row.connection_id : null,
    mode: String(row.mode) as IntelligenceMode,
    vendor: typeof row.vendor === 'string' ? assertVendor(row.vendor) : null,
    modelId: typeof row.model_id === 'string' ? row.model_id : null,
    consensusConfigurationId: typeof row.consensus_configuration_id === 'string' ? row.consensus_configuration_id : null,
    selectionSource: String(row.selection_source ?? 'native_default') as IntelligenceSelectionSource,
    status: INVOCATION_STATUSES.has(row.status as IntelligenceInvocationStatus)
      ? row.status as IntelligenceInvocationStatus
      : 'queued',
    requestFingerprint: typeof row.request_fingerprint === 'string' ? row.request_fingerprint : null,
    contextManifest: redactSecretsDeep(asRecord(row.context_manifest)) as Record<string, unknown>,
    usage: asRecord(row.usage),
    errorCode: typeof row.error_code === 'string' ? row.error_code : null,
    errorMessage: typeof row.error_message === 'string' ? redactSecretsInString(row.error_message) : null,
    startedAt: typeof row.started_at === 'string' ? row.started_at : null,
    completedAt: typeof row.completed_at === 'string' ? row.completed_at : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

async function audit(params: {
  ownerAgentId: string;
  workspaceId?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
  action: string;
  success: boolean;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await logSuperAgentAudit({
    userId: params.ownerAgentId,
    workspaceId: params.workspaceId ?? null,
    sessionId: params.sessionId ?? null,
    taskId: params.taskId ?? null,
    action: params.action,
    success: params.success,
    errorMessage: params.errorMessage ?? null,
    metadata: redactSecretsDeep(params.metadata ?? {}) as Record<string, unknown>,
  });
}

async function assertOwnedVaultSecret(params: {
  ownerAgentId: string;
  workspaceId: string;
  vaultSecretId: string;
}): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabaseAdmin()
    .from('vault_secrets')
    .select('id,vault_id,workspace_id,owner_agent_id,name,status')
    .eq('id', params.vaultSecretId)
    .eq('owner_agent_id', params.ownerAgentId)
    .eq('workspace_id', params.workspaceId)
    .maybeSingle();

  if (error) throw new Error(`Failed to validate Vault secret: ${error.message}`);
  if (!data || data.status !== 'active') throw new PermissionError('Vault secret not found or not accessible');
  return data as Record<string, unknown>;
}

async function assertSessionOwner(params: {
  ownerAgentId: string;
  sessionId: string;
}): Promise<Record<string, unknown>> {
  const { data, error } = await applyIntelligenceSessionQueryTimeout(getSupabaseAdmin()
    .from('nl_studio_sessions')
    .select('*')
    .eq('id', params.sessionId)
    .eq('owner_agent_id', params.ownerAgentId)
    .maybeSingle());

  if (error) throw new Error(`Failed to validate Studio session: ${error.message}`);
  if (!data) throw new PermissionError('Studio session not found or not accessible');
  return data as Record<string, unknown>;
}

export async function assertIntelligenceConnectionAccess(params: {
  ownerAgentId: string;
  connectionId: string;
  workspaceId?: string | null;
  requireActive?: boolean;
}): Promise<IntelligenceConnectionRecord> {
  let query = getSupabaseAdmin()
    .from('intelligence_connections')
    .select('*')
    .eq('id', params.connectionId)
    .eq('owner_agent_id', params.ownerAgentId);

  if (params.workspaceId) query = query.eq('workspace_id', params.workspaceId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to validate intelligence connection: ${error.message}`);
  if (!data) throw new PermissionError('Intelligence connection not found or not accessible');

  const connection = mapConnection(data as Record<string, unknown>);
  if (params.requireActive && connection.status !== 'active') {
    throw new PermissionError('Intelligence connection is not active');
  }
  return connection;
}

export async function listIntelligenceConnections(params: {
  ownerAgentId: string;
  workspaceId: string;
  includeRevoked?: boolean;
}): Promise<IntelligenceConnectionRecord[]> {
  const mapRows = async (rows: Record<string, unknown>[]) => {
    if (rows.length > 0) return rows.map(mapConnection);
    await assertWorkspaceMembership(params.workspaceId, params.ownerAgentId);
    return [];
  };
  const listViaRest = async () => {
    const queryParams: Record<string, string> = {
      select: '*',
      owner_agent_id: `eq.${params.ownerAgentId}`,
      workspace_id: `eq.${params.workspaceId}`,
      order: 'updated_at.desc',
    };
    if (!params.includeRevoked) queryParams.status = 'neq.revoked';
    return mapRows(await supabaseRestRows('intelligence_connections', queryParams, INTELLIGENCE_CONNECTION_LIST_TIMEOUT_MS));
  };

  let query = getSupabaseAdmin()
    .from('intelligence_connections')
    .select('*')
    .eq('owner_agent_id', params.ownerAgentId)
    .eq('workspace_id', params.workspaceId)
    .order('updated_at', { ascending: false });

  if (!params.includeRevoked) query = query.neq('status', 'revoked');
  try {
    const { data, error } = await applyIntelligenceQueryTimeout(query, INTELLIGENCE_CONNECTION_LIST_TIMEOUT_MS);
    if (error) throw new Error(`Failed to list intelligence connections: ${error.message}`);
    return mapRows((data ?? []) as Record<string, unknown>[]);
  } catch (error) {
    try {
      return await listViaRest();
    } catch {
      throw error;
    }
  }
}

export async function createIntelligenceConnection(params: {
  ownerAgentId: string;
  workspaceId: string;
  vaultSecretId: string;
  vendor: string;
  displayName: string;
  selectedModelId: string;
  availableModels?: string[];
  capabilities?: Record<string, unknown>;
  status?: IntelligenceConnectionStatus;
  lastError?: string | null;
  validated?: boolean;
}): Promise<IntelligenceConnectionRecord> {
  await assertWorkspaceMembership(params.workspaceId, params.ownerAgentId);
  const vendor = assertVendor(params.vendor);
  const vaultSecret = await assertOwnedVaultSecret({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
    vaultSecretId: params.vaultSecretId,
  });
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    owner_agent_id: params.ownerAgentId,
    workspace_id: params.workspaceId,
    vault_secret_id: String(vaultSecret.id),
    vendor,
    display_name: requiredText(params.displayName, 'displayName').slice(0, 120),
    status: params.status ?? 'pending_validation',
    selected_model_id: requiredText(params.selectedModelId, 'selectedModelId'),
    available_models: params.availableModels ?? [],
    capabilities: redactSecretsDeep(params.capabilities ?? {}) as Record<string, unknown>,
    health: {},
    last_validated_at: params.validated ? now : null,
    last_error: params.lastError ? redactSecretsInString(params.lastError) : null,
    created_at: now,
    updated_at: now,
  };

  if (!CONNECTION_STATUSES.has(row.status)) throw new ValidationError('Unsupported connection status');

  const { data, error } = await getSupabaseAdmin()
    .from('intelligence_connections')
    .insert(row)
    .select('*')
    .single();
  if (error) {
    await audit({
      ownerAgentId: params.ownerAgentId,
      workspaceId: params.workspaceId,
      action: 'intelligence.connection_create_failed',
      success: false,
      errorMessage: error.message,
      metadata: { vendor },
    });
    throw new Error(`Failed to create intelligence connection: ${error.message}`);
  }

  await audit({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
    action: 'intelligence.connection_created',
    success: true,
    metadata: { connectionId: row.id, vendor, selectedModelId: row.selected_model_id },
  });
  return mapConnection(data as Record<string, unknown>);
}

export async function updateIntelligenceConnectionStatus(params: {
  ownerAgentId: string;
  connectionId: string;
  workspaceId?: string;
  status: IntelligenceConnectionStatus;
  selectedModelId?: string;
  availableModels?: string[];
  health?: Record<string, unknown>;
  lastError?: string | null;
  validated?: boolean;
}): Promise<IntelligenceConnectionRecord> {
  if (!CONNECTION_STATUSES.has(params.status)) throw new ValidationError('Unsupported connection status');
  const current = await assertIntelligenceConnectionAccess({
    ownerAgentId: params.ownerAgentId,
    connectionId: params.connectionId,
    workspaceId: params.workspaceId,
  });
  const patch: Record<string, unknown> = {
    status: params.status,
    updated_at: new Date().toISOString(),
  };
  if (params.selectedModelId !== undefined) patch.selected_model_id = requiredText(params.selectedModelId, 'selectedModelId');
  if (params.availableModels !== undefined) patch.available_models = params.availableModels;
  if (params.health !== undefined) patch.health = redactSecretsDeep(params.health) as Record<string, unknown>;
  if (params.lastError !== undefined) patch.last_error = params.lastError ? redactSecretsInString(params.lastError) : null;
  if (params.validated) patch.last_validated_at = new Date().toISOString();

  const { data, error } = await getSupabaseAdmin()
    .from('intelligence_connections')
    .update(patch)
    .eq('id', current.id)
    .eq('owner_agent_id', params.ownerAgentId)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update intelligence connection: ${error.message}`);

  await audit({
    ownerAgentId: params.ownerAgentId,
    workspaceId: current.workspaceId,
    action: 'intelligence.connection_status_updated',
    success: true,
    metadata: { connectionId: current.id, status: params.status },
  });
  return mapConnection(data as Record<string, unknown>);
}

export async function setIntelligenceDefault(params: {
  ownerAgentId: string;
  workspaceId?: string | null;
  scope: IntelligenceDefaultScope;
  selection: IntelligenceSelection;
}): Promise<IntelligenceDefaultRecord> {
  if (params.scope === 'workspace') {
    const workspaceId = requiredText(params.workspaceId ?? undefined, 'workspaceId');
    await assertWorkspaceMembership(workspaceId, params.ownerAgentId);
  }
  const selection = normalizeIntelligenceSelection(params.selection, params.scope === 'workspace' ? 'workspace' : 'user');
  if (selection.mode === 'single') {
    await assertIntelligenceConnectionAccess({
      ownerAgentId: params.ownerAgentId,
      connectionId: selection.connectionId ?? '',
      workspaceId: params.workspaceId ?? undefined,
      requireActive: true,
    });
  }

  const now = new Date().toISOString();
  const columns = {
    owner_agent_id: params.ownerAgentId,
    workspace_id: params.scope === 'workspace' ? params.workspaceId : null,
    scope: params.scope,
    ...selectionToColumns(selection),
    updated_at: now,
  };

  let existingQuery = getSupabaseAdmin()
    .from('intelligence_defaults')
    .select('id')
    .eq('owner_agent_id', params.ownerAgentId)
    .eq('scope', params.scope);
  existingQuery = params.scope === 'workspace'
    ? existingQuery.eq('workspace_id', params.workspaceId)
    : existingQuery.is('workspace_id', null);
  const { data: existing, error: lookupError } = await existingQuery.maybeSingle();
  if (lookupError) throw new Error(`Failed to load intelligence default: ${lookupError.message}`);

  const write = existing
    ? await getSupabaseAdmin()
      .from('intelligence_defaults')
      .update(columns)
      .eq('id', existing.id)
      .eq('owner_agent_id', params.ownerAgentId)
      .select('*')
      .single()
    : await getSupabaseAdmin()
    .from('intelligence_defaults')
      .insert({
        id: crypto.randomUUID(),
        ...columns,
        created_at: now,
      })
    .select('*')
    .single();
  if (write.error) throw new Error(`Failed to set intelligence default: ${write.error.message}`);

  await audit({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId ?? null,
    action: 'intelligence.default_set',
    success: true,
    metadata: { scope: params.scope, selection },
  });
  return mapDefault(write.data as Record<string, unknown>);
}

export async function getIntelligenceDefault(params: {
  ownerAgentId: string;
  workspaceId?: string | null;
  scope: IntelligenceDefaultScope;
}): Promise<IntelligenceDefaultRecord | null> {
  if (params.scope === 'workspace') {
    const workspaceId = requiredText(params.workspaceId ?? undefined, 'workspaceId');
    await assertWorkspaceMembership(workspaceId, params.ownerAgentId);
  }

  let query = getSupabaseAdmin()
    .from('intelligence_defaults')
    .select('*')
    .eq('owner_agent_id', params.ownerAgentId)
    .eq('scope', params.scope);
  query = params.scope === 'workspace'
    ? query.eq('workspace_id', params.workspaceId)
    : query.is('workspace_id', null);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to load intelligence default: ${error.message}`);
  return data ? mapDefault(data as Record<string, unknown>) : null;
}

export async function setStudioSessionIntelligence(params: {
  ownerAgentId: string;
  sessionId: string;
  selection: IntelligenceSelection;
}): Promise<StudioSessionIntelligenceRecord> {
  const session = await assertSessionOwner({ ownerAgentId: params.ownerAgentId, sessionId: params.sessionId });
  const workspaceId = String(session.workspace_id);
  const selection = normalizeIntelligenceSelection(params.selection, 'session');
  if (selection.mode === 'single') {
    await assertIntelligenceConnectionAccess({
      ownerAgentId: params.ownerAgentId,
      connectionId: selection.connectionId ?? '',
      workspaceId,
      requireActive: true,
    });
  }
  const now = new Date().toISOString();
  const row = {
    session_id: params.sessionId,
    owner_agent_id: params.ownerAgentId,
    workspace_id: workspaceId,
    ...selectionToColumns(selection),
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await applyIntelligenceSessionQueryTimeout(getSupabaseAdmin()
    .from('studio_session_intelligence')
    .upsert(row, { onConflict: 'session_id' })
    .select('*')
    .single());
  if (error) throw new Error(`Failed to set Studio session intelligence: ${error.message}`);

  await applyIntelligenceSessionQueryTimeout(getSupabaseAdmin()
    .from('nl_studio_sessions')
    .update({
      intelligence_selection: selection,
      state: {
        ...asRecord(session.state),
        intelligenceSelection: selection,
      },
      updated_at: now,
    })
    .eq('id', params.sessionId)
    .eq('owner_agent_id', params.ownerAgentId));

  await audit({
    ownerAgentId: params.ownerAgentId,
    workspaceId,
    sessionId: params.sessionId,
    action: 'intelligence.session_selection_set',
    success: true,
    metadata: { selection },
  });
  return mapSessionIntelligence(data as Record<string, unknown>);
}

export async function getStudioSessionIntelligence(params: {
  ownerAgentId: string;
  sessionId: string;
  connectionsByVendor?: LegacyIntelligenceConnectionMap;
}): Promise<StudioSessionIntelligenceRecord> {
  const session = await assertSessionOwner({ ownerAgentId: params.ownerAgentId, sessionId: params.sessionId });
  try {
    const { data, error } = await applyIntelligenceSessionQueryTimeout(getSupabaseAdmin()
      .from('studio_session_intelligence')
      .select('*')
      .eq('session_id', params.sessionId)
      .eq('owner_agent_id', params.ownerAgentId)
      .maybeSingle());
    if (error) throw new Error(`Failed to load Studio session intelligence: ${error.message}`);
    if (data) return mapSessionIntelligence(data as Record<string, unknown>);
  } catch {
    // Fall back to the selection persisted on the Studio session row.
  }

  const state = asRecord(session.state);
  const storedSelection = (session as Record<string, unknown>).intelligence_selection ?? state.intelligenceSelection;
  if (storedSelection !== undefined && storedSelection !== null) {
    return {
      sessionId: params.sessionId,
      ownerAgentId: params.ownerAgentId,
      workspaceId: String(session.workspace_id),
      selection: normalizeIntelligenceSelection(storedSelection, 'session'),
      createdAt: String(session.created_at ?? new Date().toISOString()),
      updatedAt: String(session.updated_at ?? session.created_at ?? new Date().toISOString()),
    };
  }

  const legacySelection = migrateLegacyExecutionTargetToIntelligenceSelection(
    state.executionTargetId ?? state.provider ?? state.executionMode,
    {
      selectionSource: 'session',
      connectionsByVendor: params.connectionsByVendor,
    },
  );

  return {
    sessionId: params.sessionId,
    ownerAgentId: params.ownerAgentId,
    workspaceId: String(session.workspace_id),
    selection: legacySelection,
    createdAt: String(session.created_at ?? new Date().toISOString()),
    updatedAt: String(session.updated_at ?? session.created_at ?? new Date().toISOString()),
  };
}

export async function recordIntelligenceInvocation(params: {
  ownerAgentId: string;
  workspaceId?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
  executionId?: string | null;
  selection: IntelligenceSelection;
  status?: IntelligenceInvocationStatus;
  requestFingerprint?: string | null;
  contextManifest?: Record<string, unknown>;
  usage?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}): Promise<IntelligenceInvocationRecord> {
  const selection = normalizeIntelligenceSelection(params.selection, params.selection.selectionSource);
  let connection: IntelligenceConnectionRecord | null = null;
  if (selection.mode === 'single') {
    connection = await assertIntelligenceConnectionAccess({
      ownerAgentId: params.ownerAgentId,
      connectionId: selection.connectionId ?? '',
      workspaceId: params.workspaceId ?? undefined,
      requireActive: true,
    });
  }
  if (params.workspaceId) await assertWorkspaceMembership(params.workspaceId, params.ownerAgentId);
  if (params.sessionId) await assertSessionOwner({ ownerAgentId: params.ownerAgentId, sessionId: params.sessionId });

  const status = params.status ?? 'queued';
  if (!INVOCATION_STATUSES.has(status)) throw new ValidationError('Unsupported invocation status');
  const row = {
    id: crypto.randomUUID(),
    owner_agent_id: params.ownerAgentId,
    workspace_id: params.workspaceId ?? connection?.workspaceId ?? null,
    session_id: params.sessionId ?? null,
    task_id: params.taskId ?? null,
    execution_id: params.executionId ?? null,
    connection_id: selection.connectionId,
    mode: selection.mode,
    vendor: connection?.vendor ?? null,
    model_id: selection.modelId,
    consensus_configuration_id: selection.consensusConfigurationId,
    selection_source: selection.selectionSource,
    status,
    request_fingerprint: optionalText(params.requestFingerprint),
    context_manifest: redactSecretsDeep(params.contextManifest ?? {}) as Record<string, unknown>,
    usage: redactSecretsDeep(params.usage ?? {}) as Record<string, unknown>,
    error_code: optionalText(params.errorCode),
    error_message: params.errorMessage ? redactSecretsInString(params.errorMessage) : null,
    started_at: params.startedAt ?? null,
    completed_at: params.completedAt ?? null,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await getSupabaseAdmin()
    .from('intelligence_invocations')
    .insert(row)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to record intelligence invocation: ${error.message}`);

  await audit({
    ownerAgentId: params.ownerAgentId,
    workspaceId: row.workspace_id,
    sessionId: row.session_id,
    taskId: row.task_id,
    action: 'intelligence.invocation_recorded',
    success: status !== 'failed',
    errorMessage: row.error_message,
    metadata: { invocationId: row.id, mode: selection.mode, vendor: connection?.vendor ?? null, modelId: selection.modelId },
  });
  return mapInvocation(data as Record<string, unknown>);
}

export async function updateIntelligenceInvocation(params: {
  ownerAgentId: string;
  invocationId: string;
  status: IntelligenceInvocationStatus;
  usage?: Record<string, unknown>;
  contextManifest?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}): Promise<IntelligenceInvocationRecord> {
  if (!INVOCATION_STATUSES.has(params.status)) throw new ValidationError('Unsupported invocation status');
  const patch: Record<string, unknown> = {
    status: params.status,
  };
  if (params.usage !== undefined) patch.usage = redactSecretsDeep(params.usage) as Record<string, unknown>;
  if (params.contextManifest !== undefined) patch.context_manifest = redactSecretsDeep(params.contextManifest) as Record<string, unknown>;
  if (params.errorCode !== undefined) patch.error_code = optionalText(params.errorCode);
  if (params.errorMessage !== undefined) patch.error_message = params.errorMessage ? redactSecretsInString(params.errorMessage) : null;
  if (params.startedAt !== undefined) patch.started_at = params.startedAt;
  if (params.completedAt !== undefined) patch.completed_at = params.completedAt;

  const { data, error } = await getSupabaseAdmin()
    .from('intelligence_invocations')
    .update(patch)
    .eq('id', params.invocationId)
    .eq('owner_agent_id', params.ownerAgentId)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update intelligence invocation: ${error.message}`);

  await audit({
    ownerAgentId: params.ownerAgentId,
    workspaceId: typeof data?.workspace_id === 'string' ? data.workspace_id : null,
    sessionId: typeof data?.session_id === 'string' ? data.session_id : null,
    taskId: typeof data?.task_id === 'string' ? data.task_id : null,
    action: 'intelligence.invocation_updated',
    success: params.status !== 'failed',
    errorMessage: params.errorMessage ?? null,
    metadata: { invocationId: params.invocationId, status: params.status },
  });
  return mapInvocation(data as Record<string, unknown>);
}
