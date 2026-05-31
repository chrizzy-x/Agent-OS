import crypto from 'crypto';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { assertWorkspaceMembership, resolveDefaultWorkspaceForAgent } from '../workspaces/service.js';
import { PermissionError, ValidationError } from '../utils/errors.js';

export type SdkCredentialRecord = {
  id: string;
  workspaceId: string;
  ownerAgentId: string;
  name: string;
  publicRef: string;
  scopes: string[];
  status: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapCredential(row: Record<string, unknown>): SdkCredentialRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    ownerAgentId: String(row.owner_agent_id),
    name: String(row.name),
    publicRef: String(row.public_ref),
    scopes: Array.isArray(row.scopes) ? row.scopes.filter((item): item is string => typeof item === 'string') : [],
    status: String(row.status ?? 'active'),
    expiresAt: typeof row.expires_at === 'string' ? row.expires_at : null,
    revokedAt: typeof row.revoked_at === 'string' ? row.revoked_at : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function auditWorkspace(params: {
  workspaceId: string;
  ownerAgentId: string;
  action: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await getSupabaseAdmin().from('workspace_audit_logs').insert({
      id: crypto.randomUUID(),
      workspace_id: params.workspaceId,
      actor_id: params.ownerAgentId,
      action: params.action,
      metadata: params.metadata ?? {},
      created_at: new Date().toISOString(),
    });
  } catch {
    // best-effort
  }
}

async function resolveWorkspaceId(ownerAgentId: string, workspaceId?: string): Promise<string> {
  if (workspaceId?.trim()) {
    const workspace = await assertWorkspaceMembership(workspaceId.trim(), ownerAgentId);
    return workspace.workspace.id;
  }
  const workspace = await resolveDefaultWorkspaceForAgent(ownerAgentId);
  if (!workspace) throw new PermissionError('Workspace not found for SDK credential operation');
  return workspace.id;
}

export async function listSdkCredentials(params: {
  ownerAgentId: string;
  workspaceId?: string;
}): Promise<SdkCredentialRecord[]> {
  const workspaceId = await resolveWorkspaceId(params.ownerAgentId, params.workspaceId);
  const { data, error } = await getSupabaseAdmin()
    .from('sdk_credentials')
    .select('*')
    .eq('owner_agent_id', params.ownerAgentId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to list SDK credentials: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapCredential);
}

export async function createSdkCredential(params: {
  ownerAgentId: string;
  workspaceId?: string;
  name: string;
  scopes?: string[];
  expiresAt?: string | null;
}): Promise<{ credential: SdkCredentialRecord; token: string }> {
  const name = params.name.trim();
  if (!name) throw new ValidationError('name is required');
  if (name.length > 120) throw new ValidationError('name exceeds maximum length');
  const workspaceId = await resolveWorkspaceId(params.ownerAgentId, params.workspaceId);

  const token = `sdk_${crypto.randomBytes(24).toString('base64url')}`;
  const now = new Date().toISOString();
  const scopes = Array.isArray(params.scopes)
    ? params.scopes.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  const { data, error } = await getSupabaseAdmin()
    .from('sdk_credentials')
    .insert({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      owner_agent_id: params.ownerAgentId,
      name,
      public_ref: token.slice(0, 16),
      token_hash: hashToken(token),
      scopes,
      status: 'active',
      expires_at: params.expiresAt ?? null,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new ValidationError('A credential with this name already exists in the workspace');
    }
    throw new Error(`Failed to create SDK credential: ${error.message}`);
  }

  await auditWorkspace({
    workspaceId,
    ownerAgentId: params.ownerAgentId,
    action: 'sdk_credential_created',
    metadata: { credentialId: (data as Record<string, unknown>).id, name },
  });

  return {
    credential: mapCredential(data as Record<string, unknown>),
    token,
  };
}

export async function revokeSdkCredential(params: {
  ownerAgentId: string;
  workspaceId?: string;
  credentialId: string;
}): Promise<SdkCredentialRecord> {
  const workspaceId = await resolveWorkspaceId(params.ownerAgentId, params.workspaceId);
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from('sdk_credentials')
    .update({
      status: 'revoked',
      revoked_at: now,
      updated_at: now,
    })
    .eq('id', params.credentialId)
    .eq('owner_agent_id', params.ownerAgentId)
    .eq('workspace_id', workspaceId)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Failed to revoke SDK credential: ${error.message}`);
  if (!data) throw new PermissionError('SDK credential not found or not accessible');

  await auditWorkspace({
    workspaceId,
    ownerAgentId: params.ownerAgentId,
    action: 'sdk_credential_revoked',
    metadata: { credentialId: params.credentialId },
  });

  return mapCredential(data as Record<string, unknown>);
}
