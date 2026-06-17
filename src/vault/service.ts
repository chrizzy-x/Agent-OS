import crypto from 'crypto';
import { readLocalRuntimeState, updateLocalRuntimeState } from '../storage/local-state.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { maskSecretValue, redactSecretsDeep, redactSecretsInString } from '../security/secret-redaction.js';
import { appendStudioEvent } from '../studio/persistence.js';
import { PermissionError, ValidationError } from '../utils/errors.js';
import { assertWorkspaceMembership } from '../workspaces/service.js';
import { assertVaultRuntimeAllowed } from '../panic/service.js';

export type VaultSecretMetadata = {
  id: string;
  vaultId: string;
  workspaceId: string;
  name: string;
  maskedValue: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string | null;
};

export type VaultSubjectType = 'super_agentos' | 'subagent' | 'workflow' | 'session' | 'sdk_credential' | 'app' | 'skill';

export type VaultSecretVersion = {
  id: string;
  secretId: string;
  version: number;
  maskedValue: string;
  createdAt: string;
};

export type VaultSecretAssignment = {
  id: string;
  secretId: string;
  subjectType: VaultSubjectType;
  subjectId: string;
  status: string;
  createdAt: string;
  revokedAt: string | null;
};

export type VaultAccessHistoryRecord = {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type VaultRuntimeGrantRecord = {
  id: string;
  secretId: string;
  vaultId: string;
  workspaceId: string;
  ownerAgentId: string;
  name: string;
  subjectType: VaultSubjectType;
  subjectId: string;
  metadata: Record<string, unknown>;
  status: 'active' | 'consumed' | 'cleaned' | 'expired';
  expiresAt: string;
  consumedAt: string | null;
  cleanedUpAt: string | null;
  createdAt: string;
};

export { maskSecretValue, redactSecretsDeep, redactSecretsInString } from '../security/secret-redaction.js';

function getEncryptionKey(): Buffer {
  const raw = process.env.VAULT_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('VAULT_ENCRYPTION_KEY or ENCRYPTION_KEY is required');

  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptVaultSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptVaultSecret(ciphertext: string): string {
  const [version, ivRaw, tagRaw, encryptedRaw] = ciphertext.split(':');
  if (version !== 'v1' || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('Unsupported vault secret format');
  }

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function mapSecret(row: Record<string, unknown>): VaultSecretMetadata {
  return {
    id: String(row.id),
    vaultId: String(row.vault_id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    maskedValue: typeof row.masked_value === 'string' ? row.masked_value : '****************',
    status: typeof row.status === 'string' ? row.status : 'active',
    version: Number(row.version ?? 1),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
    lastAccessedAt: typeof row.last_accessed_at === 'string' ? row.last_accessed_at : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mapRuntimeGrant(row: Record<string, unknown>): VaultRuntimeGrantRecord {
  return {
    id: String(row.id),
    secretId: String(row.secret_id),
    vaultId: String(row.vault_id),
    workspaceId: String(row.workspace_id),
    ownerAgentId: String(row.owner_agent_id),
    name: String(row.name),
    subjectType: String(row.subject_type) as VaultSubjectType,
    subjectId: String(row.subject_id),
    metadata: asRecord(row.metadata),
    status: String(row.status ?? 'active') as VaultRuntimeGrantRecord['status'],
    expiresAt: String(row.expires_at ?? new Date().toISOString()),
    consumedAt: typeof row.consumed_at === 'string' ? row.consumed_at : null,
    cleanedUpAt: typeof row.cleaned_up_at === 'string' ? row.cleaned_up_at : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapVersion(row: Record<string, unknown>): VaultSecretVersion {
  return {
    id: String(row.id),
    secretId: String(row.secret_id),
    version: Number(row.version ?? 1),
    maskedValue: typeof row.masked_value === 'string' ? row.masked_value : '****************',
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapAssignment(row: Record<string, unknown>): VaultSecretAssignment {
  return {
    id: String(row.id),
    secretId: String(row.secret_id),
    subjectType: String(row.subject_type) as VaultSubjectType,
    subjectId: String(row.subject_id),
    status: String(row.status ?? 'active'),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    revokedAt: typeof row.revoked_at === 'string' ? row.revoked_at : null,
  };
}

function mapAccessHistory(row: Record<string, unknown>): VaultAccessHistoryRecord {
  return {
    id: String(row.id),
    action: String(row.action ?? ''),
    metadata: asRecord(row.metadata),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

async function loadOwnedVault(ownerAgentId: string, workspaceId?: string): Promise<Record<string, unknown>> {
  if (workspaceId) {
    await assertWorkspaceMembership(workspaceId, ownerAgentId);
  }
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('vaults')
    .select('*')
    .eq('owner_agent_id', ownerAgentId);

  if (workspaceId) query = query.eq('workspace_id', workspaceId);

  const { data, error } = await query.order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (error) throw new Error(`Failed to load Vault: ${error.message}`);
  if (!data) throw new PermissionError('Vault not found or not accessible');
  return data as Record<string, unknown>;
}

async function auditVault(params: {
  ownerAgentId: string;
  workspaceId: string;
  vaultId: string;
  secretId?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await getSupabaseAdmin().from('vault_access_logs').insert({
      id: crypto.randomUUID(),
      owner_agent_id: params.ownerAgentId,
      workspace_id: params.workspaceId,
      vault_id: params.vaultId,
      secret_id: params.secretId ?? null,
      action: params.action,
      metadata: redactSecretsDeep(params.metadata ?? {}),
      created_at: new Date().toISOString(),
    });
  } catch {
    // Vault auditing must not expose secrets or block cleanup paths.
  }
}

const VAULT_SUBJECT_TYPES = new Set<VaultSubjectType>([
  'super_agentos',
  'subagent',
  'workflow',
  'session',
  'sdk_credential',
  'app',
  'skill',
]);

function assertSubjectType(subjectType: string): VaultSubjectType {
  if (!VAULT_SUBJECT_TYPES.has(subjectType as VaultSubjectType)) {
    throw new ValidationError('Unsupported vault subject type');
  }
  return subjectType as VaultSubjectType;
}

async function persistSecretVersion(params: {
  secretId: string;
  vaultId: string;
  workspaceId: string;
  ownerAgentId: string;
  version: number;
  encryptedValue: string;
  maskedValue: string;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('vault_secret_versions')
    .insert({
      id: crypto.randomUUID(),
      secret_id: params.secretId,
      vault_id: params.vaultId,
      workspace_id: params.workspaceId,
      owner_agent_id: params.ownerAgentId,
      version: params.version,
      encrypted_value: params.encryptedValue,
      masked_value: params.maskedValue,
      created_at: new Date().toISOString(),
    });

  if (error) throw new Error(`Failed to write Vault secret version: ${error.message}`);
}

export async function listVaultSecrets(params: {
  ownerAgentId: string;
  workspaceId?: string;
  search?: string;
}): Promise<{ vaultId: string; workspaceId: string; secrets: VaultSecretMetadata[] }> {
  const vault = await loadOwnedVault(params.ownerAgentId, params.workspaceId);
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('vault_secrets')
    .select('id,vault_id,workspace_id,name,masked_value,status,version,created_at,updated_at,last_accessed_at')
    .eq('vault_id', vault.id)
    .order('name', { ascending: true });

  if (params.search?.trim()) {
    query = query.ilike('name', `%${params.search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list Vault secrets: ${error.message}`);
  return {
    vaultId: String(vault.id),
    workspaceId: String(vault.workspace_id),
    secrets: ((data ?? []) as Record<string, unknown>[]).map(mapSecret),
  };
}

export async function upsertVaultSecret(params: {
  ownerAgentId: string;
  workspaceId?: string;
  name: string;
  value: string;
}): Promise<VaultSecretMetadata> {
  const name = params.name.trim().toUpperCase();
  if (!/^[A-Z0-9_]{2,120}$/.test(name)) {
    throw new ValidationError('Secret name must be 2-120 uppercase letters, numbers, or underscores');
  }
  if (!params.value) throw new ValidationError('Secret value is required');

  const vault = await loadOwnedVault(params.ownerAgentId, params.workspaceId);
  const workspaceId = String(vault.workspace_id);
  const vaultId = String(vault.id);
  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  const encrypted = encryptVaultSecret(params.value);
  const masked = maskSecretValue(params.value);

  const { data: existing, error: lookupError } = await supabase
    .from('vault_secrets')
    .select('id,version')
    .eq('vault_id', vaultId)
    .eq('name', name)
    .maybeSingle();

  if (lookupError) throw new Error(`Failed to check Vault secret: ${lookupError.message}`);

  const version = Number(existing?.version ?? 0) + 1;
  const payload: Record<string, unknown> = {
    id: existing?.id ?? crypto.randomUUID(),
    vault_id: vaultId,
    workspace_id: workspaceId,
    owner_agent_id: params.ownerAgentId,
    name,
    encrypted_value: encrypted,
    masked_value: masked,
    status: 'active',
    version,
    updated_at: now,
  };
  if (!existing) payload.created_at = now;

  const write = existing
    ? await supabase.from('vault_secrets').update(payload).eq('id', existing.id).select('id,vault_id,workspace_id,name,masked_value,status,version,created_at,updated_at,last_accessed_at').single()
    : await supabase.from('vault_secrets').insert(payload).select('id,vault_id,workspace_id,name,masked_value,status,version,created_at,updated_at,last_accessed_at').single();

  if (write.error) throw new Error(`Failed to save Vault secret: ${write.error.message}`);

  const row = write.data as Record<string, unknown>;
  await persistSecretVersion({
    secretId: String(row.id),
    vaultId,
    workspaceId,
    ownerAgentId: params.ownerAgentId,
    version,
    encryptedValue: encrypted,
    maskedValue: masked,
  });

  await auditVault({
    ownerAgentId: params.ownerAgentId,
    workspaceId,
    vaultId,
    secretId: String(row.id),
    action: existing ? 'secret_rotated' : 'secret_created',
    metadata: { name, version },
  });

  return mapSecret(row);
}

export async function deleteVaultSecret(params: {
  ownerAgentId: string;
  secretId: string;
}): Promise<{ deleted: true }> {
  const supabase = getSupabaseAdmin();
  const { data: secret, error: lookupError } = await supabase
    .from('vault_secrets')
    .select('id,vault_id,workspace_id,owner_agent_id,name')
    .eq('id', params.secretId)
    .eq('owner_agent_id', params.ownerAgentId)
    .maybeSingle();

  if (lookupError) throw new Error(`Failed to load Vault secret: ${lookupError.message}`);
  if (!secret) throw new PermissionError('Vault secret not found or not accessible');

  const { error } = await supabase
    .from('vault_secrets')
    .delete()
    .eq('id', params.secretId)
    .eq('owner_agent_id', params.ownerAgentId);

  if (error) throw new Error(`Failed to delete Vault secret: ${error.message}`);

  await auditVault({
    ownerAgentId: params.ownerAgentId,
    workspaceId: String(secret.workspace_id),
    vaultId: String(secret.vault_id),
    secretId: params.secretId,
    action: 'secret_deleted',
    metadata: { name: secret.name },
  });

  return { deleted: true };
}

export async function setVaultSecretStatus(params: {
  ownerAgentId: string;
  secretId: string;
  status: 'active' | 'disabled';
}): Promise<VaultSecretMetadata> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('vault_secrets')
    .update({ status: params.status, updated_at: now })
    .eq('id', params.secretId)
    .eq('owner_agent_id', params.ownerAgentId)
    .select('id,vault_id,workspace_id,name,masked_value,status,version,created_at,updated_at,last_accessed_at')
    .maybeSingle();

  if (error) throw new Error(`Failed to update Vault secret status: ${error.message}`);
  if (!data) throw new PermissionError('Vault secret not found or not accessible');
  const row = data as Record<string, unknown>;

  await auditVault({
    ownerAgentId: params.ownerAgentId,
    workspaceId: String(row.workspace_id),
    vaultId: String(row.vault_id),
    secretId: String(row.id),
    action: 'secret_updated',
    metadata: { status: params.status, name: row.name },
  });

  return mapSecret(row);
}

export async function rotateVaultSecret(params: {
  ownerAgentId: string;
  secretId: string;
  value: string;
}): Promise<VaultSecretMetadata> {
  if (!params.value) throw new ValidationError('Secret value is required');
  const supabase = getSupabaseAdmin();
  const { data: secret, error: lookupError } = await supabase
    .from('vault_secrets')
    .select('id,vault_id,workspace_id,name,version')
    .eq('id', params.secretId)
    .eq('owner_agent_id', params.ownerAgentId)
    .maybeSingle();

  if (lookupError) throw new Error(`Failed to load Vault secret: ${lookupError.message}`);
  if (!secret) throw new PermissionError('Vault secret not found or not accessible');

  const now = new Date().toISOString();
  const version = Number(secret.version ?? 0) + 1;
  const encrypted = encryptVaultSecret(params.value);
  const masked = maskSecretValue(params.value);
  const { data: rotated, error } = await supabase
    .from('vault_secrets')
    .update({
      encrypted_value: encrypted,
      masked_value: masked,
      version,
      status: 'active',
      updated_at: now,
    })
    .eq('id', params.secretId)
    .eq('owner_agent_id', params.ownerAgentId)
    .select('id,vault_id,workspace_id,name,masked_value,status,version,created_at,updated_at,last_accessed_at')
    .maybeSingle();

  if (error) throw new Error(`Failed to rotate Vault secret: ${error.message}`);
  if (!rotated) throw new PermissionError('Vault secret not found or not accessible');

  await persistSecretVersion({
    secretId: String(secret.id),
    vaultId: String(secret.vault_id),
    workspaceId: String(secret.workspace_id),
    ownerAgentId: params.ownerAgentId,
    version,
    encryptedValue: encrypted,
    maskedValue: masked,
  });

  await auditVault({
    ownerAgentId: params.ownerAgentId,
    workspaceId: String(secret.workspace_id),
    vaultId: String(secret.vault_id),
    secretId: String(secret.id),
    action: 'secret_rotated',
    metadata: { name: secret.name, version },
  });

  return mapSecret(rotated as Record<string, unknown>);
}

export async function listVaultSecretVersions(params: {
  ownerAgentId: string;
  secretId: string;
}): Promise<VaultSecretVersion[]> {
  const supabase = getSupabaseAdmin();
  const { data: secret, error: lookupError } = await supabase
    .from('vault_secrets')
    .select('id,owner_agent_id')
    .eq('id', params.secretId)
    .eq('owner_agent_id', params.ownerAgentId)
    .maybeSingle();
  if (lookupError) throw new Error(`Failed to load Vault secret: ${lookupError.message}`);
  if (!secret) throw new PermissionError('Vault secret not found or not accessible');

  const { data, error } = await supabase
    .from('vault_secret_versions')
    .select('id,secret_id,version,masked_value,created_at')
    .eq('secret_id', params.secretId)
    .eq('owner_agent_id', params.ownerAgentId)
    .order('version', { ascending: false });

  if (error) throw new Error(`Failed to load Vault secret versions: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapVersion);
}

export async function assignVaultSecret(params: {
  ownerAgentId: string;
  secretId: string;
  subjectType: string;
  subjectId: string;
}): Promise<VaultSecretAssignment> {
  const subjectType = assertSubjectType(params.subjectType);
  const subjectId = params.subjectId.trim();
  if (!subjectId) throw new ValidationError('subjectId is required');

  const supabase = getSupabaseAdmin();
  const { data: secret, error: secretError } = await supabase
    .from('vault_secrets')
    .select('id,vault_id,workspace_id,name')
    .eq('id', params.secretId)
    .eq('owner_agent_id', params.ownerAgentId)
    .maybeSingle();

  if (secretError) throw new Error(`Failed to load Vault secret: ${secretError.message}`);
  if (!secret) throw new PermissionError('Vault secret not found or not accessible');

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('vault_assignments')
    .upsert({
      id: crypto.randomUUID(),
      secret_id: params.secretId,
      vault_id: secret.vault_id,
      workspace_id: secret.workspace_id,
      owner_agent_id: params.ownerAgentId,
      subject_type: subjectType,
      subject_id: subjectId,
      status: 'active',
      created_at: now,
      revoked_at: null,
    }, { onConflict: 'secret_id,subject_type,subject_id' })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to assign Vault secret: ${error.message}`);
  await auditVault({
    ownerAgentId: params.ownerAgentId,
    workspaceId: String(secret.workspace_id),
    vaultId: String(secret.vault_id),
    secretId: params.secretId,
    action: 'secret_assigned',
    metadata: { subjectType, subjectId, name: secret.name },
  });
  return mapAssignment(data as Record<string, unknown>);
}

export async function unassignVaultSecret(params: {
  ownerAgentId: string;
  secretId: string;
  subjectType: string;
  subjectId: string;
}): Promise<{ revoked: true }> {
  const subjectType = assertSubjectType(params.subjectType);
  const subjectId = params.subjectId.trim();
  if (!subjectId) throw new ValidationError('subjectId is required');

  const supabase = getSupabaseAdmin();
  const { data: secret, error: secretError } = await supabase
    .from('vault_secrets')
    .select('id,vault_id,workspace_id,name')
    .eq('id', params.secretId)
    .eq('owner_agent_id', params.ownerAgentId)
    .maybeSingle();

  if (secretError) throw new Error(`Failed to load Vault secret: ${secretError.message}`);
  if (!secret) throw new PermissionError('Vault secret not found or not accessible');

  const { error } = await supabase
    .from('vault_assignments')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('secret_id', params.secretId)
    .eq('owner_agent_id', params.ownerAgentId)
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId);

  if (error) throw new Error(`Failed to unassign Vault secret: ${error.message}`);
  await auditVault({
    ownerAgentId: params.ownerAgentId,
    workspaceId: String(secret.workspace_id),
    vaultId: String(secret.vault_id),
    secretId: params.secretId,
    action: 'secret_unassigned',
    metadata: { subjectType, subjectId, name: secret.name },
  });
  return { revoked: true };
}

export async function listVaultAssignments(params: {
  ownerAgentId: string;
  secretId: string;
}): Promise<VaultSecretAssignment[]> {
  const supabase = getSupabaseAdmin();
  const { data: secret, error: secretError } = await supabase
    .from('vault_secrets')
    .select('id')
    .eq('id', params.secretId)
    .eq('owner_agent_id', params.ownerAgentId)
    .maybeSingle();

  if (secretError) throw new Error(`Failed to load Vault secret: ${secretError.message}`);
  if (!secret) throw new PermissionError('Vault secret not found or not accessible');

  const { data, error } = await supabase
    .from('vault_assignments')
    .select('*')
    .eq('secret_id', params.secretId)
    .eq('owner_agent_id', params.ownerAgentId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to list Vault assignments: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapAssignment);
}

export async function listVaultAccessHistory(params: {
  ownerAgentId: string;
  secretId?: string;
  limit?: number;
}): Promise<VaultAccessHistoryRecord[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('vault_access_logs')
    .select('id,action,metadata,created_at')
    .eq('owner_agent_id', params.ownerAgentId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(params.limit ?? 100, 500)));

  if (params.secretId) {
    query = query.eq('secret_id', params.secretId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list Vault access history: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapAccessHistory);
}

export async function validateRequiredSecrets(params: {
  ownerAgentId: string;
  workspaceId?: string;
  names: string[];
}): Promise<{ missing: string[]; available: string[] }> {
  const normalizedNames = [...new Set(
    params.names
      .map(name => name.trim().toUpperCase())
      .filter(Boolean),
  )];
  if (normalizedNames.length === 0) return { missing: [], available: [] };

  const { secrets } = await listVaultSecrets({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
  });

  const availableSet = new Set(
    secrets
      .filter(secret => secret.status === 'active')
      .map(secret => secret.name.toUpperCase()),
  );

  const missing = normalizedNames.filter(name => !availableSet.has(name));
  return {
    missing,
    available: normalizedNames.filter(name => availableSet.has(name)),
  };
}

async function validateRuntimeSecretRequest(params: {
  ownerAgentId: string;
  workspaceId?: string;
  name: string;
  subjectType?: string;
  subjectId?: string;
  appSlug?: string;
  sessionId?: string | null;
}): Promise<{
  name: string;
  vault: Record<string, unknown>;
  secret: Record<string, unknown>;
  scopedType: VaultSubjectType | null;
  subjectId: string | null;
}> {
  const name = params.name.trim().toUpperCase();
  const vault = await loadOwnedVault(params.ownerAgentId, params.workspaceId);
  const supabase = getSupabaseAdmin();
  const { data: secret, error } = await supabase
    .from('vault_secrets')
    .select('id,vault_id,workspace_id,name,encrypted_value,status')
    .eq('vault_id', vault.id)
    .eq('name', name)
    .maybeSingle();

  if (error) throw new Error(`Failed to load runtime secret: ${error.message}`);
  if (!secret || secret.status !== 'active') {
    await auditVault({
      ownerAgentId: params.ownerAgentId,
      workspaceId: String(vault.workspace_id),
      vaultId: String(vault.id),
      action: 'runtime_access_denied',
      metadata: { name },
    });
    await appendRuntimeSecretStudioEvent({
      ownerAgentId: params.ownerAgentId,
      sessionId: params.sessionId,
      type: 'secret_access_denied',
      payload: { name, reason: 'missing_or_disabled' },
    });
    throw new PermissionError('Required secret is missing or disabled');
  }

  const subjectType = params.subjectType?.trim();
  const subjectId = params.subjectId?.trim();
  if (!subjectType && !subjectId) {
    return { name, vault, secret: secret as Record<string, unknown>, scopedType: null, subjectId: null };
  }
  if (!subjectType || !subjectId) {
    await auditVault({
      ownerAgentId: params.ownerAgentId,
      workspaceId: String(secret.workspace_id),
      vaultId: String(secret.vault_id),
      secretId: String(secret.id),
      action: 'runtime_access_denied',
      metadata: { name, reason: 'missing_subject' },
    });
    await appendRuntimeSecretStudioEvent({
      ownerAgentId: params.ownerAgentId,
      sessionId: params.sessionId,
      type: 'secret_access_denied',
      payload: { name, reason: 'missing_subject' },
    });
    throw new ValidationError('Both subjectType and subjectId are required for scoped runtime access');
  }

  const scopedType = assertSubjectType(subjectType);
  if (scopedType === 'app') {
    const appSlug = params.appSlug?.trim();
    if (!appSlug) {
      await auditVault({
        ownerAgentId: params.ownerAgentId,
        workspaceId: String(secret.workspace_id),
        vaultId: String(secret.vault_id),
        secretId: String(secret.id),
        action: 'runtime_access_denied',
        metadata: { name, reason: 'missing_app_slug', subjectType: scopedType, subjectId },
      });
      await appendRuntimeSecretStudioEvent({
        ownerAgentId: params.ownerAgentId,
        sessionId: params.sessionId,
        type: 'secret_access_denied',
        payload: { name, reason: 'missing_app_slug', subjectType: scopedType, subjectId },
      });
      throw new ValidationError('appSlug is required for app-scoped runtime access');
    }

    const { assertAgentAppPermissionAccess } = await import('../appstore/service.js');
    let appAccess;
    try {
      appAccess = await assertAgentAppPermissionAccess({
        agentId: params.ownerAgentId,
        slug: appSlug,
        permission: 'vault',
      });
    } catch (error) {
      await appendRuntimeSecretStudioEvent({
        ownerAgentId: params.ownerAgentId,
        sessionId: params.sessionId,
        type: 'secret_access_denied',
        payload: { name, reason: 'app_access_denied', subjectType: scopedType, subjectId, appSlug },
      });
      throw error;
    }
    if (appAccess.app.id !== subjectId) {
      await auditVault({
        ownerAgentId: params.ownerAgentId,
        workspaceId: String(secret.workspace_id),
        vaultId: String(secret.vault_id),
        secretId: String(secret.id),
        action: 'runtime_access_denied',
        metadata: { name, reason: 'app_subject_mismatch', subjectType: scopedType, subjectId, appSlug },
      });
      await appendRuntimeSecretStudioEvent({
        ownerAgentId: params.ownerAgentId,
        sessionId: params.sessionId,
        type: 'secret_access_denied',
        payload: { name, reason: 'app_subject_mismatch', subjectType: scopedType, subjectId, appSlug },
      });
      throw new PermissionError('App subject does not match the approved installed app');
    }
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from('vault_assignments')
    .select('id,status')
    .eq('secret_id', secret.id)
    .eq('owner_agent_id', params.ownerAgentId)
    .eq('subject_type', scopedType)
    .eq('subject_id', subjectId)
    .maybeSingle();

  if (assignmentError) throw new Error(`Failed to validate Vault assignment: ${assignmentError.message}`);
  if (!assignment || assignment.status !== 'active') {
    await auditVault({
      ownerAgentId: params.ownerAgentId,
      workspaceId: String(secret.workspace_id),
      vaultId: String(secret.vault_id),
      secretId: String(secret.id),
      action: 'runtime_access_denied',
      metadata: { name, subjectType: scopedType, subjectId },
    });
    await appendRuntimeSecretStudioEvent({
      ownerAgentId: params.ownerAgentId,
      sessionId: params.sessionId,
      type: 'secret_access_denied',
      payload: { name, reason: 'assignment_missing', subjectType: scopedType, subjectId },
    });
    throw new PermissionError('Secret is not assigned to this runtime subject');
  }

  return {
    name,
    vault,
    secret: secret as Record<string, unknown>,
    scopedType,
    subjectId,
  };
}

async function loadRuntimeGrant(params: {
  ownerAgentId: string;
  grantId: string;
}): Promise<VaultRuntimeGrantRecord> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('vault_runtime_grants')
      .select('*')
      .eq('id', params.grantId)
      .eq('owner_agent_id', params.ownerAgentId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load runtime grant: ${error.message}`);
    if (!data) throw new PermissionError('Runtime secret grant not found or not accessible');
    return mapRuntimeGrant(data as Record<string, unknown>);
  } catch (error) {
    if (error instanceof PermissionError) throw error;
  }

  const state = await readLocalRuntimeState();
  const grant = state.vaultRuntimeGrants.find(item => item.id === params.grantId && item.owner_agent_id === params.ownerAgentId);
  if (!grant) throw new PermissionError('Runtime secret grant not found or not accessible');
  return mapRuntimeGrant(grant as unknown as Record<string, unknown>);
}

export async function createRuntimeSecretGrant(params: {
  ownerAgentId: string;
  workspaceId?: string;
  name: string;
  subjectType?: string;
  subjectId?: string;
  appSlug?: string;
  expiresInMs?: number;
  metadata?: Record<string, unknown>;
  sessionId?: string | null;
}): Promise<VaultRuntimeGrantRecord> {
  await assertVaultRuntimeAllowed(params.ownerAgentId);
  const validated = await validateRuntimeSecretRequest(params);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(30_000, Math.min(params.expiresInMs ?? 300_000, 900_000))).toISOString();
  const payload = {
    id: crypto.randomUUID(),
    secret_id: String(validated.secret.id),
    vault_id: String(validated.secret.vault_id),
    workspace_id: String(validated.secret.workspace_id),
    owner_agent_id: params.ownerAgentId,
    name: validated.name,
    subject_type: validated.scopedType ?? 'super_agentos',
    subject_id: validated.subjectId ?? params.ownerAgentId,
    metadata: redactSecretsDeep({
      ...(params.metadata ?? {}),
      appSlug: params.appSlug ?? null,
      sessionId: params.sessionId ?? null,
    }) as Record<string, unknown>,
    status: 'active' as const,
    expires_at: expiresAt,
    consumed_at: null,
    cleaned_up_at: null,
    created_at: now.toISOString(),
  };

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('vault_runtime_grants')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw new Error(`Failed to create runtime grant: ${error.message}`);
    await auditVault({
      ownerAgentId: params.ownerAgentId,
      workspaceId: String(validated.secret.workspace_id),
      vaultId: String(validated.secret.vault_id),
      secretId: String(validated.secret.id),
      action: 'runtime_grant_created',
      metadata: { name: validated.name, subjectType: validated.scopedType, subjectId: validated.subjectId, expiresAt },
    });
    return mapRuntimeGrant(data as Record<string, unknown>);
  } catch {
    const grant = await updateLocalRuntimeState(state => {
      state.vaultRuntimeGrants.unshift(payload);
      return payload;
    });
    await auditVault({
      ownerAgentId: params.ownerAgentId,
      workspaceId: String(validated.secret.workspace_id),
      vaultId: String(validated.secret.vault_id),
      secretId: String(validated.secret.id),
      action: 'runtime_grant_created',
      metadata: { name: validated.name, subjectType: validated.scopedType, subjectId: validated.subjectId, expiresAt },
    });
    return mapRuntimeGrant(grant as unknown as Record<string, unknown>);
  }
}

async function appendRuntimeSecretStudioEvent(params: {
  ownerAgentId: string;
  sessionId?: string | null;
  type: 'secret_access_granted' | 'secret_access_denied';
  payload: Record<string, unknown>;
}): Promise<void> {
  if (!params.sessionId?.trim()) return;
  try {
    await appendStudioEvent({
      ownerAgentId: params.ownerAgentId,
      sessionId: params.sessionId,
      type: params.type,
      payload: params.payload,
    });
  } catch {
    // Vault audit remains authoritative if Studio event append fails.
  }
}

export async function consumeRuntimeSecretGrant(params: {
  ownerAgentId: string;
  grantId: string;
  sessionId?: string | null;
}): Promise<{ grant: VaultRuntimeGrantRecord; name: string; value: string }> {
  const grant = await loadRuntimeGrant(params);
  const sessionId = params.sessionId ?? (typeof grant.metadata.sessionId === 'string' ? grant.metadata.sessionId : null);
  const now = new Date().toISOString();
  if (new Date(grant.expiresAt).getTime() <= Date.now()) {
    await cleanupRuntimeSecretGrant({ ownerAgentId: params.ownerAgentId, grantId: grant.id, expired: true });
    throw new PermissionError('Runtime secret grant has expired');
  }
  if (grant.status !== 'active') {
    throw new PermissionError('Runtime secret grant is not active');
  }

  const appSlug = typeof grant.metadata.appSlug === 'string' ? grant.metadata.appSlug : undefined;
  const validated = await validateRuntimeSecretRequest({
    ownerAgentId: params.ownerAgentId,
    workspaceId: grant.workspaceId,
    name: grant.name,
    subjectType: grant.subjectType,
    subjectId: grant.subjectId,
    appSlug,
    sessionId,
  });
  const value = decryptVaultSecret(String(validated.secret.encrypted_value));

  try {
    const supabase = getSupabaseAdmin();
    await supabase
      .from('vault_secrets')
      .update({ last_accessed_at: now })
      .eq('id', validated.secret.id)
      .eq('owner_agent_id', params.ownerAgentId);
    const { data, error } = await supabase
      .from('vault_runtime_grants')
      .update({
        status: 'consumed',
        consumed_at: now,
      })
      .eq('id', grant.id)
      .eq('owner_agent_id', params.ownerAgentId)
      .select('*')
      .single();
    if (error) throw new Error(`Failed to consume runtime grant: ${error.message}`);
    await auditVault({
      ownerAgentId: params.ownerAgentId,
      workspaceId: String(validated.secret.workspace_id),
      vaultId: String(validated.secret.vault_id),
      secretId: String(validated.secret.id),
      action: 'runtime_access_granted',
      metadata: { name: validated.name, subjectType: validated.scopedType, subjectId: validated.subjectId, grantId: grant.id },
    });
    await appendRuntimeSecretStudioEvent({
      ownerAgentId: params.ownerAgentId,
      sessionId,
      type: 'secret_access_granted',
      payload: { name: validated.name, subjectType: validated.scopedType, subjectId: validated.subjectId, grantId: grant.id },
    });
    return { grant: mapRuntimeGrant(data as Record<string, unknown>), name: validated.name, value };
  } catch {
    const nextGrant = await updateLocalRuntimeState(state => {
      const target = state.vaultRuntimeGrants.find(item => item.id === grant.id && item.owner_agent_id === params.ownerAgentId);
      if (!target) throw new PermissionError('Runtime secret grant not found or not accessible');
      target.status = 'consumed';
      target.consumed_at = now;
      return target;
    });
    await auditVault({
      ownerAgentId: params.ownerAgentId,
      workspaceId: String(validated.secret.workspace_id),
      vaultId: String(validated.secret.vault_id),
      secretId: String(validated.secret.id),
      action: 'runtime_access_granted',
      metadata: { name: validated.name, subjectType: validated.scopedType, subjectId: validated.subjectId, grantId: grant.id },
    });
    await appendRuntimeSecretStudioEvent({
      ownerAgentId: params.ownerAgentId,
      sessionId,
      type: 'secret_access_granted',
      payload: { name: validated.name, subjectType: validated.scopedType, subjectId: validated.subjectId, grantId: grant.id },
    });
    return { grant: mapRuntimeGrant(nextGrant as unknown as Record<string, unknown>), name: validated.name, value };
  }
}

export async function cleanupRuntimeSecretGrant(params: {
  ownerAgentId: string;
  grantId: string;
  expired?: boolean;
}): Promise<VaultRuntimeGrantRecord> {
  const now = new Date().toISOString();
  const current = await loadRuntimeGrant({ ownerAgentId: params.ownerAgentId, grantId: params.grantId });
  const status = params.expired ? 'expired' : 'cleaned';
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('vault_runtime_grants')
      .update({
        status,
        cleaned_up_at: now,
      })
      .eq('id', current.id)
      .eq('owner_agent_id', params.ownerAgentId)
      .select('*')
      .single();
    if (error) throw new Error(`Failed to clean runtime grant: ${error.message}`);
    await auditVault({
      ownerAgentId: params.ownerAgentId,
      workspaceId: current.workspaceId,
      vaultId: current.vaultId,
      secretId: current.secretId,
      action: params.expired ? 'runtime_grant_expired' : 'runtime_grant_cleaned',
      metadata: { name: current.name, subjectType: current.subjectType, subjectId: current.subjectId, grantId: current.id },
    });
    return mapRuntimeGrant(data as Record<string, unknown>);
  } catch {
    const grant = await updateLocalRuntimeState(state => {
      const target = state.vaultRuntimeGrants.find(item => item.id === current.id && item.owner_agent_id === params.ownerAgentId);
      if (!target) throw new PermissionError('Runtime secret grant not found or not accessible');
      target.status = status;
      target.cleaned_up_at = now;
      return target;
    });
    await auditVault({
      ownerAgentId: params.ownerAgentId,
      workspaceId: current.workspaceId,
      vaultId: current.vaultId,
      secretId: current.secretId,
      action: params.expired ? 'runtime_grant_expired' : 'runtime_grant_cleaned',
      metadata: { name: current.name, subjectType: current.subjectType, subjectId: current.subjectId, grantId: current.id },
    });
    return mapRuntimeGrant(grant as unknown as Record<string, unknown>);
  }
}

export async function grantRuntimeSecretAccess(params: {
  ownerAgentId: string;
  workspaceId?: string;
  name: string;
  subjectType?: string;
  subjectId?: string;
  appSlug?: string;
  sessionId?: string | null;
}): Promise<{ name: string; value: string; cleanup: () => void }> {
  const grant = await createRuntimeSecretGrant({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
    name: params.name,
    subjectType: params.subjectType,
    subjectId: params.subjectId,
    appSlug: params.appSlug,
    sessionId: params.sessionId,
  });
  const consumed = await consumeRuntimeSecretGrant({
    ownerAgentId: params.ownerAgentId,
    grantId: grant.id,
    sessionId: params.sessionId,
  });

  let liveValue: string | null = consumed.value;
  return {
    name: consumed.name,
    get value() {
      if (liveValue === null) throw new Error('Runtime secret has been cleaned up');
      return liveValue;
    },
    cleanup() {
      liveValue = null;
      void cleanupRuntimeSecretGrant({ ownerAgentId: params.ownerAgentId, grantId: grant.id }).catch(() => {});
    },
  };
}

export async function withRuntimeSecretsAccess<T>(params: {
  ownerAgentId: string;
  workspaceId?: string;
  names: string[];
  subjectType?: string;
  subjectId?: string;
  appSlug?: string;
  sessionId?: string | null;
  handler: (secrets: Record<string, string>) => Promise<T>;
}): Promise<T> {
  const names = [...new Set(params.names.map(name => name.trim().toUpperCase()).filter(Boolean))];
  const grants: Array<{ name: string; value: string; cleanup: () => void }> = [];
  const secrets: Record<string, string> = {};
  try {
    for (const name of names) {
      grants.push(await grantRuntimeSecretAccess({
        ownerAgentId: params.ownerAgentId,
        workspaceId: params.workspaceId,
        name,
        subjectType: params.subjectType,
        subjectId: params.subjectId,
        appSlug: params.appSlug,
        sessionId: params.sessionId,
      }));
    }
    for (const grant of grants) {
      secrets[grant.name] = grant.value;
    }
    return await params.handler(secrets);
  } finally {
    for (const key of Object.keys(secrets)) {
      delete secrets[key];
    }
    for (const grant of grants) grant.cleanup();
  }
}
