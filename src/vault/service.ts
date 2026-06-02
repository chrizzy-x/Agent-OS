import crypto from 'crypto';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { PermissionError, ValidationError } from '../utils/errors.js';
import { assertWorkspaceMembership } from '../workspaces/service.js';

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

const SECRET_VALUE_KEYS = new Set([
  'secret',
  'token',
  'api_key',
  'apikey',
  'password',
  'authorization',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'private_key',
]);

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

export function maskSecretValue(value?: string | null): string {
  if (!value) return '****************';
  return `${'*'.repeat(Math.max(12, Math.min(20, value.length)))}${value.length > 4 ? value.slice(-4) : ''}`;
}

export function redactSecretsDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecretsDeep);
  if (!value || typeof value !== 'object') return value;

  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    next[key] = SECRET_VALUE_KEYS.has(normalized) || normalized.endsWith('_secret') || normalized.endsWith('_token')
      ? '[redacted]'
      : redactSecretsDeep(item);
  }
  return next;
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

export async function grantRuntimeSecretAccess(params: {
  ownerAgentId: string;
  workspaceId?: string;
  name: string;
  subjectType?: string;
  subjectId?: string;
}): Promise<{ name: string; value: string; cleanup: () => void }> {
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
    throw new PermissionError('Required secret is missing or disabled');
  }

  const subjectType = params.subjectType?.trim();
  const subjectId = params.subjectId?.trim();
  if (subjectType || subjectId) {
    if (!subjectType || !subjectId) {
      await auditVault({
        ownerAgentId: params.ownerAgentId,
        workspaceId: String(secret.workspace_id),
        vaultId: String(secret.vault_id),
        secretId: String(secret.id),
        action: 'runtime_access_denied',
        metadata: { name, reason: 'missing_subject' },
      });
      throw new ValidationError('Both subjectType and subjectId are required for scoped runtime access');
    }

    const scopedType = assertSubjectType(subjectType);
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
      throw new PermissionError('Secret is not assigned to this runtime subject');
    }
  }

  const value = decryptVaultSecret(String(secret.encrypted_value));
  await supabase
    .from('vault_secrets')
    .update({ last_accessed_at: new Date().toISOString() })
    .eq('id', secret.id)
    .eq('owner_agent_id', params.ownerAgentId);
  await auditVault({
    ownerAgentId: params.ownerAgentId,
    workspaceId: String(secret.workspace_id),
    vaultId: String(secret.vault_id),
    secretId: String(secret.id),
    action: 'runtime_access_granted',
    metadata: { name, subjectType: subjectType ?? null, subjectId: subjectId ?? null },
  });

  let liveValue: string | null = value;
  return {
    name,
    get value() {
      if (liveValue === null) throw new Error('Runtime secret has been cleaned up');
      return liveValue;
    },
    cleanup() {
      liveValue = null;
    },
  };
}

export async function grantRuntimeSecretsAccess(params: {
  ownerAgentId: string;
  workspaceId?: string;
  names: string[];
  subjectType?: string;
  subjectId?: string;
}): Promise<{ secrets: Record<string, string>; cleanup: () => void }> {
  const names = [...new Set(params.names.map(name => name.trim().toUpperCase()).filter(Boolean))];
  const grants: Array<{ name: string; value: string; cleanup: () => void }> = [];
  try {
    for (const name of names) {
      grants.push(await grantRuntimeSecretAccess({
        ownerAgentId: params.ownerAgentId,
        workspaceId: params.workspaceId,
        name,
        subjectType: params.subjectType,
        subjectId: params.subjectId,
      }));
    }

    return {
      secrets: Object.fromEntries(grants.map(grant => [grant.name, grant.value])),
      cleanup() {
        for (const grant of grants) grant.cleanup();
      },
    };
  } catch (error) {
    for (const grant of grants) grant.cleanup();
    throw error;
  }
}
