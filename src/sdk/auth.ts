import crypto from 'crypto';
import type { AgentContext } from '../auth/permissions.js';
import { TIER_QUOTAS, normalizePlan } from '../auth/tiers.js';
import { findAccountById } from '../auth/agent-store.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { AuthError, PermissionError } from '../utils/errors.js';

export type VerifiedSdkCredential = {
  id: string;
  workspaceId: string;
  ownerAgentId: string;
  publicRef: string;
  scopes: string[];
  status: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type SdkKernelContext = AgentContext & {
  workspaceId: string;
  authSource: 'sdk';
  sdkCredentialId: string;
  sdkScopes: string[];
};

function hashSdkToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function scopeMatches(granted: string, required: string): boolean {
  return granted === '*'
    || granted === required
    || (granted === 'kernel' && required.startsWith('kernel.'))
    || (granted === 'kernel:*' && required.startsWith('kernel.'));
}

function ensureScopes(scopes: string[], requiredScopes: string[]): void {
  if (scopes.length === 0 || requiredScopes.length === 0) return;
  const allowed = requiredScopes.some(required => scopes.some(granted => scopeMatches(granted, required)));
  if (!allowed) {
    throw new PermissionError('SDK credential does not allow this kernel action');
  }
}

export async function verifySdkCredentialToken(token: string, requiredScopes: string[] = []): Promise<VerifiedSdkCredential> {
  if (!token.startsWith('sdk_')) {
    throw new AuthError('Invalid SDK credential');
  }

  const publicRef = token.slice(0, 16);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('sdk_credentials')
    .select('*')
    .eq('public_ref', publicRef)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load SDK credential: ${error.message}`);
  }
  if (!data) {
    throw new AuthError('Unknown SDK credential');
  }

  const row = data as Record<string, unknown>;
  const tokenHash = typeof row.token_hash === 'string' ? row.token_hash : '';
  if (!tokenHash || tokenHash !== hashSdkToken(token)) {
    throw new AuthError('Invalid SDK credential');
  }

  const status = typeof row.status === 'string' ? row.status : 'revoked';
  if (status !== 'active') {
    throw new PermissionError('SDK credential is revoked');
  }

  const expiresAt = typeof row.expires_at === 'string' ? row.expires_at : null;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    throw new PermissionError('SDK credential has expired');
  }

  const scopes = Array.isArray(row.scopes)
    ? row.scopes.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  ensureScopes(scopes, requiredScopes);

  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    ownerAgentId: String(row.owner_agent_id),
    publicRef,
    scopes,
    status,
    expiresAt,
    revokedAt: typeof row.revoked_at === 'string' ? row.revoked_at : null,
  };
}

export async function requireSdkKernelContext(token: string, requiredScopes: string[] = []): Promise<SdkKernelContext> {
  const credential = await verifySdkCredentialToken(token, requiredScopes);
  const account = await findAccountById(credential.ownerAgentId);
  const plan = normalizePlan(account?.metadata.plan ?? 'enterprise_plus');

  return {
    agentId: credential.ownerAgentId,
    allowedDomains: [],
    quotas: TIER_QUOTAS[plan],
    tier: plan,
    workspaceId: credential.workspaceId,
    authSource: 'sdk',
    sdkCredentialId: credential.id,
    sdkScopes: credential.scopes,
  };
}
