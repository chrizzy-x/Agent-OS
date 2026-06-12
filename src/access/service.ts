import crypto from 'crypto';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { assertWorkspaceMembership, listWorkspaces } from '../workspaces/service.js';
import { PermissionError, ValidationError } from '../utils/errors.js';

export type ResourceVisibility = 'private' | 'workspace' | 'public';
export type LegacyResourceVisibility = ResourceVisibility | 'unlisted';

export type PermissionGrant = {
  id: string;
  workspaceId: string | null;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  permission: string;
  scope: string;
  metadata: Record<string, unknown>;
  expiresAt: string | null;
  createdBy: string | null;
  createdAt: string;
  revokedAt: string | null;
};

type AccessViewer = {
  agentId: string;
  workspaceIds?: string[];
};

type VisibilitySubject = {
  ownerAgentId: string;
  workspaceId?: string | null;
  visibility?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeVisibility(value: unknown, fallback: ResourceVisibility = 'private'): ResourceVisibility {
  if (value === 'public' || value === 'private' || value === 'workspace') return value;
  if (value === 'unlisted') return 'workspace';
  return fallback;
}

export function displayVisibility(value: unknown): 'Private' | 'Workspace' | 'Public' {
  const normalized = normalizeVisibility(value);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1) as 'Private' | 'Workspace' | 'Public';
}

function mapGrant(row: Record<string, unknown>): PermissionGrant {
  return {
    id: String(row.id),
    workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : null,
    sourceType: String(row.source_type),
    sourceId: String(row.source_id),
    targetType: String(row.target_type),
    targetId: String(row.target_id),
    permission: String(row.permission),
    scope: typeof row.scope === 'string' ? row.scope : 'direct',
    metadata: asRecord(row.metadata),
    expiresAt: typeof row.expires_at === 'string' ? row.expires_at : null,
    createdBy: typeof row.created_by === 'string' ? row.created_by : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    revokedAt: typeof row.revoked_at === 'string' ? row.revoked_at : null,
  };
}

function isGrantActive(grant: PermissionGrant, now = Date.now()): boolean {
  if (grant.revokedAt) return false;
  if (!grant.expiresAt) return true;
  return new Date(grant.expiresAt).getTime() > now;
}

async function auditWorkspaceAccess(params: {
  workspaceId: string | null;
  actorId: string;
  action: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!params.workspaceId) return;
  try {
    await getSupabaseAdmin().from('workspace_audit_logs').insert({
      id: crypto.randomUUID(),
      workspace_id: params.workspaceId,
      actor_id: params.actorId,
      action: params.action,
      metadata: params.metadata ?? {},
      created_at: new Date().toISOString(),
    });
  } catch {
    // best-effort
  }
}

export async function listPermissionGrants(params: {
  actorAgentId: string;
  workspaceId?: string | null;
  sourceType?: string;
  sourceId?: string;
  targetType?: string;
  targetId?: string;
  includeRevoked?: boolean;
}): Promise<PermissionGrant[]> {
  if (params.workspaceId) {
    await assertWorkspaceMembership(params.workspaceId, params.actorAgentId);
  }

  let query = getSupabaseAdmin()
    .from('permission_grants')
    .select('*')
    .order('created_at', { ascending: false });

  if (params.workspaceId) query = query.eq('workspace_id', params.workspaceId);
  if (params.sourceType) query = query.eq('source_type', params.sourceType);
  if (params.sourceId) query = query.eq('source_id', params.sourceId);
  if (params.targetType) query = query.eq('target_type', params.targetType);
  if (params.targetId) query = query.eq('target_id', params.targetId);
  if (!params.includeRevoked) query = query.is('revoked_at', null);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list permission grants: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapGrant);
}

export async function createPermissionGrant(params: {
  actorAgentId: string;
  workspaceId?: string | null;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  permission: string;
  scope?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: string | null;
}): Promise<PermissionGrant> {
  const sourceType = params.sourceType.trim();
  const sourceId = params.sourceId.trim();
  const targetType = params.targetType.trim();
  const targetId = params.targetId.trim();
  const permission = params.permission.trim();
  const workspaceId = params.workspaceId?.trim() || null;

  if (!sourceType || !sourceId || !targetType || !targetId || !permission) {
    throw new ValidationError('sourceType, sourceId, targetType, targetId, and permission are required');
  }
  if (workspaceId) {
    await assertWorkspaceMembership(workspaceId, params.actorAgentId);
  }

  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  let existingQuery = supabase
    .from('permission_grants')
    .select('*')
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('permission', permission)
    .is('revoked_at', null);

  existingQuery = workspaceId
    ? existingQuery.eq('workspace_id', workspaceId)
    : existingQuery.is('workspace_id', null);

  const { data: existing, error: existingError } = await existingQuery.maybeSingle();

  if (existingError) throw new Error(`Failed to check permission grants: ${existingError.message}`);
  if (existing) {
    return mapGrant(existing as Record<string, unknown>);
  }

  const { data, error } = await supabase
    .from('permission_grants')
    .insert({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      source_type: sourceType,
      source_id: sourceId,
      target_type: targetType,
      target_id: targetId,
      permission,
      scope: params.scope?.trim() || 'direct',
      metadata: params.metadata ?? {},
      expires_at: params.expiresAt ?? null,
      created_by: params.actorAgentId,
      created_at: now,
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create permission grant: ${error.message}`);
  await auditWorkspaceAccess({
    workspaceId,
    actorId: params.actorAgentId,
    action: 'permission_grant.created',
    metadata: { sourceType, sourceId, targetType, targetId, permission },
  });
  return mapGrant(data as Record<string, unknown>);
}

export async function revokePermissionGrant(params: {
  actorAgentId: string;
  grantId?: string;
  workspaceId?: string | null;
  sourceType?: string;
  sourceId?: string;
  targetType?: string;
  targetId?: string;
  permission?: string;
}): Promise<PermissionGrant> {
  if (!params.grantId && !(params.sourceType && params.sourceId && params.targetType && params.targetId && params.permission)) {
    throw new ValidationError('grantId or a full source/target/permission selector is required');
  }

  const workspaceId = params.workspaceId?.trim() || null;
  if (workspaceId) {
    await assertWorkspaceMembership(workspaceId, params.actorAgentId);
  }

  let query = getSupabaseAdmin()
    .from('permission_grants')
    .update({ revoked_at: new Date().toISOString() })
    .is('revoked_at', null);

  if (params.grantId) {
    query = query.eq('id', params.grantId);
  } else {
    query = (workspaceId
      ? query.eq('workspace_id', workspaceId)
      : query.is('workspace_id', null))
      .eq('source_type', params.sourceType ?? '')
      .eq('source_id', params.sourceId ?? '')
      .eq('target_type', params.targetType ?? '')
      .eq('target_id', params.targetId ?? '')
      .eq('permission', params.permission ?? '');
  }

  const { data, error } = await query.select('*').maybeSingle();
  if (error) throw new Error(`Failed to revoke permission grant: ${error.message}`);
  if (!data) throw new PermissionError('Permission grant not found or already revoked');

  const grant = mapGrant(data as Record<string, unknown>);
  await auditWorkspaceAccess({
    workspaceId: grant.workspaceId,
    actorId: params.actorAgentId,
    action: 'permission_grant.revoked',
    metadata: { grantId: grant.id, permission: grant.permission },
  });
  return grant;
}

export async function listIncomingPermissionGrants(params: {
  targetType: string;
  targetId: string;
  permission?: string;
  includeExpired?: boolean;
}): Promise<PermissionGrant[]> {
  let query = getSupabaseAdmin()
    .from('permission_grants')
    .select('*')
    .eq('target_type', params.targetType)
    .eq('target_id', params.targetId)
    .is('revoked_at', null);

  if (params.permission) query = query.eq('permission', params.permission);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load incoming permission grants: ${error.message}`);
  const now = Date.now();
  return ((data ?? []) as Record<string, unknown>[])
    .map(mapGrant)
    .filter(grant => params.includeExpired ? !grant.revokedAt : isGrantActive(grant, now));
}

async function safeListIncomingPermissionGrants(params: {
  targetType: string;
  targetId: string;
  permission?: string;
  includeExpired?: boolean;
}): Promise<PermissionGrant[]> {
  try {
    return await listIncomingPermissionGrants(params);
  } catch {
    return [];
  }
}

export async function hasPermissionGrant(params: {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  permission: string;
}): Promise<boolean> {
  const grants = await safeListIncomingPermissionGrants({
    targetType: params.targetType,
    targetId: params.targetId,
    permission: params.permission,
  });
  return grants.some(grant => grant.sourceType === params.sourceType && grant.sourceId === params.sourceId);
}

export async function resolveViewerWorkspaceIds(agentId: string): Promise<string[]> {
  const workspaces = await listWorkspaces(agentId);
  return workspaces.map(workspace => workspace.id);
}

export async function assertResourceAccess(params: {
  viewerAgentId: string;
  ownerAgentId: string;
  workspaceId?: string | null;
  visibility?: string | null;
  sourceType: string;
  sourceId: string;
  permission?: string;
}): Promise<void> {
  if (params.viewerAgentId === params.ownerAgentId) return;

  const viewerWorkspaceIds = await resolveViewerWorkspaceIds(params.viewerAgentId);
  const visibility = normalizeVisibility(params.visibility);
  if (visibility === 'public') return;
  if (visibility === 'workspace' && params.workspaceId && viewerWorkspaceIds.includes(params.workspaceId)) return;

  const granted = await hasPermissionGrant({
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    targetType: 'agent',
    targetId: params.viewerAgentId,
    permission: params.permission ?? `${params.sourceType}:read`,
  });

  if (!granted) {
    throw new PermissionError('Resource not found or not accessible');
  }
}

export async function filterAccessibleResources<T extends VisibilitySubject & { id: string }>(params: {
  viewer: AccessViewer;
  resources: T[];
  sourceType: string;
  permission?: string;
}): Promise<T[]> {
  const viewerWorkspaceIds = params.viewer.workspaceIds ?? await resolveViewerWorkspaceIds(params.viewer.agentId);
  const activeGrants = await safeListIncomingPermissionGrants({
    targetType: 'agent',
    targetId: params.viewer.agentId,
    permission: params.permission,
  });
  const grantKey = new Set(activeGrants.map(grant => `${grant.sourceType}:${grant.sourceId}:${grant.permission}`));

  return params.resources.filter(resource => {
    if (resource.ownerAgentId === params.viewer.agentId) return true;
    const visibility = normalizeVisibility(resource.visibility);
    if (visibility === 'public') return true;
    if (visibility === 'workspace' && resource.workspaceId && viewerWorkspaceIds.includes(resource.workspaceId)) return true;
    const permission = params.permission ?? `${params.sourceType}:read`;
    return grantKey.has(`${params.sourceType}:${resource.id}:${permission}`);
  });
}
