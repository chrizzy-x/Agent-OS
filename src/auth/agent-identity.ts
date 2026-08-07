import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { AgentContext, AgentQuotas, DEFAULT_QUOTAS } from './permissions.js';
import { isValidPlan, normalizePersistedPlan, normalizePlan, TIER_QUOTAS } from './tiers.js';
import { AuthError } from '../utils/errors.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from '../config/env.js';

export interface AgentTokenPayload {
  sub: string; // agentId
  allowedDomains?: string[];
  quotas?: Partial<AgentQuotas>;
  bearerTokenId?: string;
  scopes?: string[];
  workspaceId?: string | null;
  projectId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  iat?: number;
  exp?: number;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
}

// Verify a JWT bearer token and return its validated claims.
export function verifyAgentTokenClaims(token: string): AgentTokenPayload {
  let payload: AgentTokenPayload;

  try {
    payload = jwt.verify(token, getJwtSecret()) as AgentTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthError('Agent token has expired');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new AuthError('Invalid agent token');
    }
    throw new AuthError('Token verification failed');
  }

  if (!payload.sub) {
    throw new AuthError('Token missing agent ID (sub claim)');
  }

  return payload;
}

// Verify a JWT bearer token and extract the AgentContext from its claims.
// Throws AuthError if the token is missing, malformed, or expired.
// Tier defaults to 'free' — use verifyAgentTokenWithTier for DB-enriched context.
export function verifyAgentToken(token: string): AgentContext {
  const payload = verifyAgentTokenClaims(token);

  return {
    agentId: payload.sub,
    allowedDomains: payload.allowedDomains ?? [],
    quotas: {
      ...DEFAULT_QUOTAS,
      ...payload.quotas,
    },
    tier: 'retail_free',
  };
}

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const AGENT_IDENTITY_REST_TIMEOUT_MS = 3_000;
const AGENT_IDENTITY_TIER_CACHE_TTL_MS = 60_000;

const tierCache = new Map<string, { tier: AgentContext['tier']; cachedAt: number }>();

function agentIdentityRestEnabled(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.AGENTOS_AGENT_IDENTITY_REST_LOOKUP === '1';
}

function applyAgentIdentityQueryTimeout<T>(query: T): T {
  const timeout = (globalThis.AbortSignal as typeof AbortSignal & { timeout?: (ms: number) => AbortSignal }).timeout;
  const abortable = query as T & { abortSignal?: (signal: AbortSignal) => T };
  return typeof timeout === 'function' && typeof abortable.abortSignal === 'function'
    ? abortable.abortSignal(timeout(AGENT_IDENTITY_REST_TIMEOUT_MS))
    : query;
}

function agentIdentityRestUrl(table: string, params: Record<string, string> = {}): URL {
  const url = new URL(`${getSupabaseUrl().replace(/\/+$/, '')}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function agentIdentityRestRows(
  table: string,
  params: Record<string, string>,
  init?: RequestInit,
): Promise<Array<Record<string, unknown>> | null> {
  if (!agentIdentityRestEnabled()) return null;
  try {
    const serviceRoleKey = getSupabaseServiceRoleKey();
    const timeout = (globalThis.AbortSignal as typeof AbortSignal & { timeout?: (ms: number) => AbortSignal }).timeout;
    const response = await fetch(agentIdentityRestUrl(table, params), {
      ...init,
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        ...(init?.headers ?? {}),
      },
      signal: typeof timeout === 'function' ? timeout(AGENT_IDENTITY_REST_TIMEOUT_MS) : init?.signal,
    });
    if (!response.ok) return null;
    if (response.status === 204) return [];
    const rows = await response.json().catch(() => null) as unknown;
    return Array.isArray(rows) ? rows as Array<Record<string, unknown>> : null;
  } catch {
    return null;
  }
}

async function readStoredBearerTokenViaRest(payload: AgentTokenPayload): Promise<Array<Record<string, unknown>> | null> {
  if (!payload.bearerTokenId) return [];
  return agentIdentityRestRows('bearer_tokens', {
    select: 'id,owner_agent_id,token_hash,status,expires_at',
    id: `eq.${payload.bearerTokenId}`,
    owner_agent_id: `eq.${payload.sub}`,
    limit: '1',
  });
}

async function touchStoredBearerTokenViaRest(payload: AgentTokenPayload): Promise<void> {
  if (!payload.bearerTokenId || !agentIdentityRestEnabled()) return;
  const now = new Date().toISOString();
  await agentIdentityRestRows(
    'bearer_tokens',
    {
      id: `eq.${payload.bearerTokenId}`,
      owner_agent_id: `eq.${payload.sub}`,
    },
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ last_used_at: now, updated_at: now }),
    },
  ).catch(() => null);
}

function validateStoredBearerTokenRow(row: Record<string, unknown> | null | undefined, token: string): void {
  if (!row) throw new AuthError('Bearer token has been revoked or removed');
  if (row.status !== 'active') throw new AuthError('Bearer token has been revoked');
  if (typeof row.expires_at === 'string' && new Date(row.expires_at).getTime() <= Date.now()) {
    throw new AuthError('Bearer token has expired');
  }
  if (typeof row.token_hash === 'string' && row.token_hash !== hashToken(token)) {
    throw new AuthError('Bearer token does not match its stored credential');
  }
}

async function assertStoredBearerToken(payload: AgentTokenPayload, token: string): Promise<void> {
  if (!payload.bearerTokenId) return;
  const restRows = await readStoredBearerTokenViaRest(payload);
  if (restRows) {
    validateStoredBearerTokenRow(restRows[0], token);
    await touchStoredBearerTokenViaRest(payload);
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new AuthError('Bearer token validation failed');
  }
  try {
    const { data, error } = await applyAgentIdentityQueryTimeout(getSupabaseAdmin()
      .from('bearer_tokens')
      .select('id, owner_agent_id, token_hash, status, expires_at')
      .eq('id', payload.bearerTokenId)
      .eq('owner_agent_id', payload.sub)
      .maybeSingle());
    if (error) {
      return;
    }
    if (!data) {
      return;
    }
    const row = data as Record<string, unknown>;
    validateStoredBearerTokenRow(row, token);
    await applyAgentIdentityQueryTimeout(getSupabaseAdmin()
      .from('bearer_tokens')
      .update({ last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', payload.bearerTokenId)
      .eq('owner_agent_id', payload.sub));
  } catch (error) {
    if (error instanceof AuthError) throw error;
  }
}

function tierFromAgentRow(row: Record<string, unknown>): AgentContext['tier'] {
  const metadata = (row.metadata as Record<string, unknown> | null | undefined) ?? {};
  return isValidPlan(metadata.plan) ? normalizePlan(metadata.plan) : normalizePersistedPlan(row.tier);
}

function getCachedTier(agentId: string): AgentContext['tier'] | null {
  const cached = tierCache.get(agentId);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > AGENT_IDENTITY_TIER_CACHE_TTL_MS) {
    tierCache.delete(agentId);
    return null;
  }
  return cached.tier;
}

function cacheTier(agentId: string, tier: AgentContext['tier']): void {
  tierCache.set(agentId, { tier, cachedAt: Date.now() });
}

async function readAgentTierViaRest(agentId: string): Promise<AgentContext['tier'] | null> {
  const rows = await agentIdentityRestRows('agents', {
    select: 'tier,metadata',
    id: `eq.${agentId}`,
    limit: '1',
  });
  if (!rows?.[0]) return null;
  return tierFromAgentRow(rows[0]);
}

// Verify a JWT bearer token and enrich the AgentContext with the agent's tier from DB.
// Merges TIER_QUOTAS[tier] as baseline, then applies any JWT custom quota overrides.
export async function verifyAgentTokenWithTier(token: string): Promise<AgentContext> {
  const payload = verifyAgentTokenClaims(token);
  await assertStoredBearerToken(payload, token);

  let tier: AgentContext['tier'] = 'retail_free';
  const restTier = await readAgentTierViaRest(payload.sub);
  if (restTier) {
    tier = restTier;
    cacheTier(payload.sub, tier);
  } else {
    const cachedTier = getCachedTier(payload.sub);
    if (cachedTier) {
      tier = cachedTier;
    } else if (process.env.NODE_ENV !== 'production') {
      try {
        const supabase = getSupabaseAdmin();
        const { data } = await applyAgentIdentityQueryTimeout(supabase
          .from('agents')
          .select('tier, metadata')
          .eq('id', payload.sub)
          .maybeSingle());
        if (data) {
          tier = tierFromAgentRow(data as Record<string, unknown>);
          cacheTier(payload.sub, tier);
        }
      } catch {
        // Non-fatal - default to free tier on lookup failure.
      }
    }
  }

  const tierQuotas = TIER_QUOTAS[tier];

  return {
    agentId: payload.sub,
    allowedDomains: payload.allowedDomains ?? [],
    quotas: {
      ...tierQuotas,
      ...payload.quotas, // JWT custom quotas override tier baseline
    },
    tier,
  };
}

// Create a signed JWT for an agent - used in admin agent creation and testing.
export function createAgentToken(
  agentId: string,
  options?: {
    allowedDomains?: string[];
    quotas?: Partial<AgentQuotas>;
    bearerTokenId?: string;
    scopes?: string[];
    workspaceId?: string | null;
    projectId?: string | null;
    subjectType?: string | null;
    subjectId?: string | null;
    expiresIn?: string | number;
  }
): string {
  const payload: AgentTokenPayload = {
    sub: agentId,
    allowedDomains: options?.allowedDomains ?? [],
    quotas: options?.quotas,
    bearerTokenId: options?.bearerTokenId,
    scopes: options?.scopes,
    workspaceId: options?.workspaceId,
    projectId: options?.projectId,
    subjectType: options?.subjectType,
    subjectId: options?.subjectId,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: (options?.expiresIn ?? '30d') as any,
  });
}

// Extract a bearer token from an Authorization header value.
// Returns undefined if the header is absent or not a bearer token.
export function extractBearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1];
  }
  return undefined;
}
