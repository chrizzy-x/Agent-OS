import { createHash, randomUUID } from 'crypto';
import { createAgentToken } from './agent-identity.js';
import { readLocalRuntimeState, updateLocalRuntimeState, type LocalBearerTokenRecord } from '../storage/local-state.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

export type BearerTokenScope = 'workspace' | 'project' | 'app' | 'workflow' | 'mcp_connector' | 'external_agent' | 'api';
export type BearerTokenStatus = 'active' | 'revoked';

export type BearerTokenRecord = {
  id: string;
  name: string;
  workspaceId: string | null;
  projectId: string | null;
  subjectType: string | null;
  subjectId: string | null;
  scopes: string[];
  permissions: string[];
  maskedToken: string;
  status: BearerTokenStatus;
  lastUsedAt: string | null;
  rotatedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BearerTokenCreateResult = {
  token: BearerTokenRecord;
  bearerToken: string;
};

const VALID_SCOPES = new Set<BearerTokenScope>(['workspace', 'project', 'app', 'workflow', 'mcp_connector', 'external_agent', 'api']);

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function maskToken(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))]
    : [];
}

function normalizeScopes(value: unknown): string[] {
  const scopes = stringArray(value).filter(scope => VALID_SCOPES.has(scope as BearerTokenScope));
  return scopes.length > 0 ? scopes : ['api'];
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseExpiresAt(value: unknown): string | null {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(Date.now() + value * 1000).toISOString();
  return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
}

function toPublic(row: Record<string, unknown> | LocalBearerTokenRecord): BearerTokenRecord {
  return {
    id: String(row.id),
    name: String(row.name ?? 'Bearer token'),
    workspaceId: nullableString('workspace_id' in row ? row.workspace_id : row.workspaceId),
    projectId: nullableString('project_id' in row ? row.project_id : row.projectId),
    subjectType: nullableString('subject_type' in row ? row.subject_type : row.subjectType),
    subjectId: nullableString('subject_id' in row ? row.subject_id : row.subjectId),
    scopes: stringArray(row.scopes),
    permissions: stringArray(row.permissions),
    maskedToken: String(('masked_token' in row ? row.masked_token : row.maskedToken) ?? 'masked'),
    status: row.status === 'revoked' ? 'revoked' : 'active',
    lastUsedAt: nullableString('last_used_at' in row ? row.last_used_at : row.lastUsedAt),
    rotatedAt: nullableString('rotated_at' in row ? row.rotated_at : row.rotatedAt),
    revokedAt: nullableString('revoked_at' in row ? row.revoked_at : row.revokedAt),
    expiresAt: nullableString('expires_at' in row ? row.expires_at : row.expiresAt),
    createdAt: String(('created_at' in row ? row.created_at : row.createdAt) ?? new Date().toISOString()),
    updatedAt: String(('updated_at' in row ? row.updated_at : row.updatedAt) ?? new Date().toISOString()),
  };
}

function dbPayload(record: LocalBearerTokenRecord): Record<string, unknown> {
  return {
    id: record.id,
    owner_agent_id: record.ownerAgentId,
    name: record.name,
    workspace_id: record.workspaceId,
    project_id: record.projectId,
    subject_type: record.subjectType,
    subject_id: record.subjectId,
    scopes: record.scopes,
    permissions: record.permissions,
    token_hash: record.tokenHash,
    masked_token: record.maskedToken,
    status: record.status,
    last_used_at: record.lastUsedAt,
    rotated_at: record.rotatedAt,
    revoked_at: record.revokedAt,
    expires_at: record.expiresAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function createSignedToken(params: {
  ownerAgentId: string;
  tokenId: string;
  scopes: string[];
  workspaceId?: string | null;
  projectId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
}): string {
  return createAgentToken(params.ownerAgentId, {
    bearerTokenId: params.tokenId,
    scopes: params.scopes,
    workspaceId: params.workspaceId ?? null,
    projectId: params.projectId ?? null,
    subjectType: params.subjectType ?? null,
    subjectId: params.subjectId ?? null,
    expiresIn: '90d',
  });
}

export async function listBearerTokens(ownerAgentId: string): Promise<BearerTokenRecord[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('bearer_tokens')
      .select('*')
      .eq('owner_agent_id', ownerAgentId)
      .order('updated_at', { ascending: false });
    if (!error && Array.isArray(data)) return data.map(row => toPublic(row as Record<string, unknown>));
  } catch {
    // Fall through to local test/dev state.
  }

  const state = await readLocalRuntimeState();
  return state.bearerTokens
    .filter(token => token.ownerAgentId === ownerAgentId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(toPublic);
}

export async function createBearerToken(params: {
  ownerAgentId: string;
  name?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  scopes?: unknown;
  permissions?: unknown;
  expiresAt?: unknown;
}): Promise<BearerTokenCreateResult> {
  const name = params.name?.trim() || 'Bearer token';
  const scopes = normalizeScopes(params.scopes);
  const id = randomUUID();
  const bearerToken = createSignedToken({
    ownerAgentId: params.ownerAgentId,
    tokenId: id,
    scopes,
    workspaceId: params.workspaceId ?? null,
    projectId: params.projectId ?? null,
    subjectType: params.subjectType ?? null,
    subjectId: params.subjectId ?? null,
  });
  const now = new Date().toISOString();
  const record: LocalBearerTokenRecord = {
    id,
    ownerAgentId: params.ownerAgentId,
    name,
    workspaceId: params.workspaceId ?? null,
    projectId: params.projectId ?? null,
    subjectType: params.subjectType ?? null,
    subjectId: params.subjectId ?? null,
    scopes,
    permissions: stringArray(params.permissions),
    tokenHash: hashToken(bearerToken),
    maskedToken: maskToken(bearerToken),
    status: 'active',
    lastUsedAt: null,
    rotatedAt: null,
    revokedAt: null,
    expiresAt: parseExpiresAt(params.expiresAt),
    createdAt: now,
    updatedAt: now,
  };

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('bearer_tokens')
      .insert(dbPayload(record))
      .select('*')
      .single();
    if (!error && data) return { token: toPublic(data as Record<string, unknown>), bearerToken };
  } catch {
    // Fall through to local test/dev state.
  }

  await updateLocalRuntimeState(state => {
    state.bearerTokens.unshift(record);
  });
  return { token: toPublic(record), bearerToken };
}

async function findLocalToken(ownerAgentId: string, id: string): Promise<LocalBearerTokenRecord> {
  const state = await readLocalRuntimeState();
  const token = state.bearerTokens.find(item => item.ownerAgentId === ownerAgentId && item.id === id);
  if (!token) throw new NotFoundError('Bearer token not found');
  return token;
}

export async function updateBearerToken(params: {
  ownerAgentId: string;
  id: string;
  name?: string | null;
  scopes?: unknown;
  permissions?: unknown;
  action?: 'rotate' | 'revoke';
}): Promise<{ token: BearerTokenRecord; bearerToken?: string }> {
  const now = new Date().toISOString();
  let oneTimeToken: string | undefined;

  const current = await findLocalToken(params.ownerAgentId, params.id).catch(() => null);
  const baseScopes = normalizeScopes(params.scopes ?? current?.scopes ?? ['api']);
  if (params.action === 'rotate') {
    oneTimeToken = createSignedToken({
      ownerAgentId: params.ownerAgentId,
      tokenId: params.id,
      scopes: baseScopes,
      workspaceId: current?.workspaceId ?? null,
      projectId: current?.projectId ?? null,
      subjectType: current?.subjectType ?? null,
      subjectId: current?.subjectId ?? null,
    });
  }

  const patch: Record<string, unknown> = {
    updated_at: now,
  };
  if (params.name !== undefined) patch.name = params.name?.trim() || 'Bearer token';
  if (params.scopes !== undefined) patch.scopes = baseScopes;
  if (params.permissions !== undefined) patch.permissions = stringArray(params.permissions);
  if (params.action === 'rotate' && oneTimeToken) {
    patch.token_hash = hashToken(oneTimeToken);
    patch.masked_token = maskToken(oneTimeToken);
    patch.rotated_at = now;
    patch.status = 'active';
    patch.revoked_at = null;
  }
  if (params.action === 'revoke') {
    patch.status = 'revoked';
    patch.revoked_at = now;
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('bearer_tokens')
      .update(patch)
      .eq('id', params.id)
      .eq('owner_agent_id', params.ownerAgentId)
      .select('*')
      .maybeSingle();
    if (!error && data) return { token: toPublic(data as Record<string, unknown>), bearerToken: oneTimeToken };
  } catch {
    // Fall through to local test/dev state.
  }

  let updated: LocalBearerTokenRecord | null = null;
  await updateLocalRuntimeState(state => {
    const token = state.bearerTokens.find(item => item.ownerAgentId === params.ownerAgentId && item.id === params.id);
    if (!token) throw new NotFoundError('Bearer token not found');
    if (params.name !== undefined) token.name = params.name?.trim() || 'Bearer token';
    if (params.scopes !== undefined) token.scopes = baseScopes;
    if (params.permissions !== undefined) token.permissions = stringArray(params.permissions);
    if (params.action === 'rotate' && oneTimeToken) {
      token.tokenHash = hashToken(oneTimeToken);
      token.maskedToken = maskToken(oneTimeToken);
      token.rotatedAt = now;
      token.status = 'active';
      token.revokedAt = null;
    }
    if (params.action === 'revoke') {
      token.status = 'revoked';
      token.revokedAt = now;
    }
    token.updatedAt = now;
    updated = token;
  });
  if (!updated) throw new NotFoundError('Bearer token not found');
  return { token: toPublic(updated), bearerToken: oneTimeToken };
}

export async function revokeBearerToken(ownerAgentId: string, id: string): Promise<BearerTokenRecord> {
  return (await updateBearerToken({ ownerAgentId, id, action: 'revoke' })).token;
}

export function assertBearerScope(token: BearerTokenRecord, scope: string): void {
  if (token.status !== 'active') throw new ValidationError('Bearer token is revoked');
  if (!token.scopes.includes(scope) && !token.scopes.includes('api')) {
    throw new ValidationError(`Bearer token is missing ${scope} scope`);
  }
}
