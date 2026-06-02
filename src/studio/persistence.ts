import crypto from 'crypto';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { redactSecretsDeep, redactSecretsInString } from '../security/secret-redaction.js';
import { PermissionError, ValidationError } from '../utils/errors.js';
import { assertWorkspaceMembership } from '../workspaces/service.js';

export type StudioEventType =
  | 'thinking_started'
  | 'plan_created'
  | 'permission_required'
  | 'skill_recommended'
  | 'skill_installed'
  | 'subagent_created'
  | 'workflow_created'
  | 'workflow_updated'
  | 'workflow_code_updated'
  | 'task_started'
  | 'task_progress'
  | 'task_completed'
  | 'task_failed'
  | 'artifact_created'
  | 'version_created'
  | 'secret_required'
  | 'secret_added'
  | 'secret_access_granted'
  | 'secret_access_denied'
  | 'app_discovered'
  | 'app_installed'
  | 'sdk_app_registered'
  | 'sdk_app_heartbeat'
  | 'app_creation_blocked'
  | 'sdk_access_blocked'
  | 'skill_creation_blocked'
  | 'app_manifest_created'
  | 'publish_checklist_created';

export type StudioRole = 'user' | 'assistant' | 'system';

export type StudioSessionRecord = {
  id: string;
  workspaceId: string;
  ownerAgentId: string;
  superAgentId: string | null;
  parentSessionId: string | null;
  parentSnapshotId: string | null;
  branchLabel: string | null;
  title: string;
  status: string;
  state: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type StudioSessionLineage = {
  parent: Pick<StudioSessionRecord, 'id' | 'title' | 'updatedAt'> | null;
  children: Array<Pick<StudioSessionRecord, 'id' | 'title' | 'updatedAt'>>;
};

export type StudioMessageRecord = {
  id: string;
  sessionId: string;
  role: StudioRole;
  content: string;
  createdAt: string;
};

export type StudioEventRecord = {
  id: string;
  sessionId: string;
  type: StudioEventType;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type StudioSnapshotRecord = {
  id: string;
  sessionId: string;
  workspaceId: string;
  ownerAgentId: string;
  label: string | null;
  state: Record<string, unknown>;
  createdAt: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mapSession(row: Record<string, unknown>): StudioSessionRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    ownerAgentId: String(row.owner_agent_id),
    superAgentId: typeof row.super_agent_id === 'string' ? row.super_agent_id : null,
    parentSessionId: typeof row.parent_session_id === 'string' ? row.parent_session_id : null,
    parentSnapshotId: typeof row.parent_snapshot_id === 'string' ? row.parent_snapshot_id : null,
    branchLabel: typeof row.branch_label === 'string' ? row.branch_label : null,
    title: typeof row.title === 'string' ? row.title : 'AgentOS Studio',
    status: typeof row.status === 'string' ? row.status : 'active',
    state: asRecord(row.state),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function mapMessage(row: Record<string, unknown>): StudioMessageRecord {
  const role = row.role === 'assistant' || row.role === 'system' ? row.role : 'user';
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role,
    content: String(row.content ?? ''),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapEvent(row: Record<string, unknown>): StudioEventRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    type: String(row.type) as StudioEventType,
    payload: asRecord(row.payload),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapSnapshot(row: Record<string, unknown>): StudioSnapshotRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    workspaceId: String(row.workspace_id),
    ownerAgentId: String(row.owner_agent_id),
    label: typeof row.label === 'string' ? row.label : null,
    state: asRecord(row.state),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

async function assertSessionOwner(sessionId: string, ownerAgentId: string): Promise<Record<string, unknown>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('nl_studio_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('owner_agent_id', ownerAgentId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load Studio session: ${error.message}`);
  if (!data) throw new PermissionError('Studio session not found or not accessible');
  return data as Record<string, unknown>;
}

export async function listStudioSessions(ownerAgentId: string): Promise<StudioSessionRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('nl_studio_sessions')
    .select('*')
    .eq('owner_agent_id', ownerAgentId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`Failed to list Studio sessions: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapSession);
}

export async function createStudioSession(params: {
  ownerAgentId: string;
  workspaceId: string;
  superAgentId?: string | null;
  title?: string;
  parentSessionId?: string | null;
  parentSnapshotId?: string | null;
  branchLabel?: string | null;
  initialState?: Record<string, unknown>;
}): Promise<StudioSessionRecord> {
  await assertWorkspaceMembership(params.workspaceId, params.ownerAgentId);
  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('nl_studio_sessions')
    .insert({
      id: crypto.randomUUID(),
      workspace_id: params.workspaceId,
      owner_agent_id: params.ownerAgentId,
      super_agent_id: params.superAgentId ?? null,
      parent_session_id: params.parentSessionId ?? null,
      parent_snapshot_id: params.parentSnapshotId ?? null,
      branch_label: params.branchLabel?.trim() || null,
      title: params.title?.trim() || 'New Studio Session',
      status: 'active',
      state: redactSecretsDeep(params.initialState ?? {
        workflowGraph: { nodes: [], edges: [] },
        workflowCode: '{\n  "version": "1.0.0",\n  "nodes": [],\n  "edges": []\n}',
        artifacts: [],
        approvals: [],
        installedSkills: [],
      }) as Record<string, unknown>,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create Studio session: ${error.message}`);
  return mapSession(data as Record<string, unknown>);
}

export async function getStudioSessionBundle(ownerAgentId: string, sessionId: string): Promise<{
  session: StudioSessionRecord;
  messages: StudioMessageRecord[];
  events: StudioEventRecord[];
  lineage: StudioSessionLineage;
}> {
  const row = await assertSessionOwner(sessionId, ownerAgentId);
  const supabase = getSupabaseAdmin();
  const [messages, events, lineage] = await Promise.all([
    supabase
      .from('nl_studio_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true }),
    supabase
      .from('nl_studio_events')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true }),
    getStudioSessionLineage(ownerAgentId, sessionId),
  ]);

  if (messages.error) throw new Error(`Failed to load Studio messages: ${messages.error.message}`);
  if (events.error) throw new Error(`Failed to load Studio events: ${events.error.message}`);

  return {
    session: mapSession(row),
    messages: ((messages.data ?? []) as Record<string, unknown>[]).map(mapMessage),
    events: ((events.data ?? []) as Record<string, unknown>[]).map(mapEvent),
    lineage,
  };
}

export async function getStudioSessionLineage(ownerAgentId: string, sessionId: string): Promise<StudioSessionLineage> {
  const current = mapSession(await assertSessionOwner(sessionId, ownerAgentId));
  const supabase = getSupabaseAdmin();

  const [parentResult, childResult] = await Promise.all([
    current.parentSessionId
      ? supabase
        .from('nl_studio_sessions')
        .select('*')
        .eq('id', current.parentSessionId)
        .eq('owner_agent_id', ownerAgentId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('nl_studio_sessions')
      .select('*')
      .eq('owner_agent_id', ownerAgentId)
      .eq('parent_session_id', sessionId)
      .order('updated_at', { ascending: false }),
  ]);

  if (childResult.error) throw new Error(`Failed to load Studio session lineage: ${childResult.error.message}`);
  if (parentResult && 'error' in parentResult && parentResult.error) {
    throw new Error(`Failed to load Studio session lineage: ${parentResult.error.message}`);
  }

  const parent = parentResult && 'data' in parentResult && parentResult.data
    ? mapSession(parentResult.data as Record<string, unknown>)
    : null;
  const children = ((childResult.data ?? []) as Record<string, unknown>[]).map(mapSession);

  return {
    parent: parent ? { id: parent.id, title: parent.title, updatedAt: parent.updatedAt } : null,
    children: children.map(child => ({ id: child.id, title: child.title, updatedAt: child.updatedAt })),
  };
}

export async function appendStudioMessage(params: {
  ownerAgentId: string;
  sessionId: string;
  role: StudioRole;
  content: string;
}): Promise<StudioMessageRecord> {
  if (!params.content.trim()) throw new ValidationError('message content is required');
  await assertSessionOwner(params.sessionId, params.ownerAgentId);

  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('nl_studio_messages')
    .insert({
      id: crypto.randomUUID(),
      session_id: params.sessionId,
      owner_agent_id: params.ownerAgentId,
      role: params.role,
      content: redactSecretsInString(params.content),
      created_at: now,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to append Studio message: ${error.message}`);

  await supabase
    .from('nl_studio_sessions')
    .update({ updated_at: now })
    .eq('id', params.sessionId)
    .eq('owner_agent_id', params.ownerAgentId);

  return mapMessage(data as Record<string, unknown>);
}

export async function appendStudioEvent(params: {
  ownerAgentId: string;
  sessionId: string;
  type: StudioEventType;
  payload?: Record<string, unknown>;
}): Promise<StudioEventRecord> {
  const session = await assertSessionOwner(params.sessionId, params.ownerAgentId);
  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('nl_studio_events')
    .insert({
      id: crypto.randomUUID(),
      session_id: params.sessionId,
      workspace_id: session.workspace_id,
      owner_agent_id: params.ownerAgentId,
      type: params.type,
      payload: redactSecretsDeep(params.payload ?? {}) as Record<string, unknown>,
      created_at: now,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to append Studio event: ${error.message}`);
  return mapEvent(data as Record<string, unknown>);
}

export async function appendLatestStudioEvent(params: {
  ownerAgentId: string;
  type: StudioEventType;
  payload?: Record<string, unknown>;
}): Promise<StudioEventRecord | null> {
  const sessions = await listStudioSessions(params.ownerAgentId);
  const latest = sessions[0];
  if (!latest) return null;
  return appendStudioEvent({
    ownerAgentId: params.ownerAgentId,
    sessionId: latest.id,
    type: params.type,
    payload: params.payload,
  });
}

export async function listStudioEventsSince(params: {
  ownerAgentId: string;
  sessionId: string;
  since?: string;
  limit?: number;
}): Promise<StudioEventRecord[]> {
  await assertSessionOwner(params.sessionId, params.ownerAgentId);
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('nl_studio_events')
    .select('*')
    .eq('session_id', params.sessionId)
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(params.limit ?? 100, 500)));

  if (params.since) {
    query = query.gt('created_at', params.since);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list Studio events: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapEvent);
}

export async function updateStudioSession(params: {
  ownerAgentId: string;
  sessionId: string;
  title?: string;
  statePatch?: Record<string, unknown>;
  status?: string;
}): Promise<StudioSessionRecord> {
  const current = await assertSessionOwner(params.sessionId, params.ownerAgentId);
  const nextState = params.statePatch
    ? { ...asRecord(current.state), ...redactSecretsDeep(params.statePatch) as Record<string, unknown> }
    : asRecord(current.state);
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    state: nextState,
  };

  if (params.title !== undefined) {
    const title = params.title.trim();
    if (!title) throw new ValidationError('session title is required');
    patch.title = title.slice(0, 200);
  }

  if (params.status !== undefined) {
    if (!params.status.trim()) throw new ValidationError('session status is required');
    patch.status = params.status.trim().slice(0, 80);
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('nl_studio_sessions')
    .update(patch)
    .eq('id', params.sessionId)
    .eq('owner_agent_id', params.ownerAgentId)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Failed to update Studio session: ${error.message}`);
  if (!data) throw new PermissionError('Studio session not found or not accessible');
  return mapSession(data as Record<string, unknown>);
}

export async function createStudioSnapshot(params: {
  ownerAgentId: string;
  sessionId: string;
  label?: string;
}): Promise<StudioSnapshotRecord> {
  const session = await assertSessionOwner(params.sessionId, params.ownerAgentId);
  const now = new Date().toISOString();
  const label = params.label?.trim() || null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('nl_studio_snapshots')
    .insert({
      id: crypto.randomUUID(),
      session_id: params.sessionId,
      workspace_id: session.workspace_id,
      owner_agent_id: params.ownerAgentId,
      label,
      state: redactSecretsDeep(asRecord(session.state)) as Record<string, unknown>,
      created_at: now,
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create Studio snapshot: ${error.message}`);
  return mapSnapshot(data as Record<string, unknown>);
}

export async function listStudioSnapshots(params: {
  ownerAgentId: string;
  sessionId: string;
}): Promise<StudioSnapshotRecord[]> {
  await assertSessionOwner(params.sessionId, params.ownerAgentId);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('nl_studio_snapshots')
    .select('*')
    .eq('session_id', params.sessionId)
    .eq('owner_agent_id', params.ownerAgentId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(`Failed to list Studio snapshots: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapSnapshot);
}

export async function createStudioSessionBranch(params: {
  ownerAgentId: string;
  sessionId: string;
  snapshotId?: string | null;
  title?: string;
  branchLabel?: string;
}): Promise<StudioSessionRecord> {
  const session = mapSession(await assertSessionOwner(params.sessionId, params.ownerAgentId));
  const snapshots = await listStudioSnapshots({
    ownerAgentId: params.ownerAgentId,
    sessionId: params.sessionId,
  });
  const snapshot = params.snapshotId
    ? snapshots.find(item => item.id === params.snapshotId) ?? null
    : snapshots[0] ?? null;

  return createStudioSession({
    ownerAgentId: params.ownerAgentId,
    workspaceId: session.workspaceId,
    superAgentId: session.superAgentId,
    title: params.title?.trim() || `${session.title} Branch`,
    parentSessionId: session.id,
    parentSnapshotId: snapshot?.id ?? null,
    branchLabel: params.branchLabel?.trim() || snapshot?.label || 'Branch',
    initialState: snapshot?.state ?? session.state,
  });
}
