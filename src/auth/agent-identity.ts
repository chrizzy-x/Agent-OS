import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { AgentContext, AgentQuotas, DEFAULT_QUOTAS } from './permissions.js';
import { isValidPlan, normalizePersistedPlan, normalizePlan, TIER_QUOTAS } from './tiers.js';
import { AuthError } from '../utils/errors.js';
import { getSupabaseAdmin } from '../storage/supabase.js';

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

async function assertStoredBearerToken(payload: AgentTokenPayload, token: string): Promise<void> {
  if (!payload.bearerTokenId) return;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('bearer_tokens')
      .select('id, owner_agent_id, token_hash, status, expires_at')
      .eq('id', payload.bearerTokenId)
      .eq('owner_agent_id', payload.sub)
      .maybeSingle();
    if (error) {
      if (process.env.NODE_ENV !== 'production') return;
      throw new AuthError('Bearer token validation failed');
    }
    if (!data) {
      if (process.env.NODE_ENV !== 'production') return;
      throw new AuthError('Bearer token has been revoked or removed');
    }
    const row = data as Record<string, unknown>;
    if (row.status !== 'active') throw new AuthError('Bearer token has been revoked');
    if (typeof row.expires_at === 'string' && new Date(row.expires_at).getTime() <= Date.now()) {
      throw new AuthError('Bearer token has expired');
    }
    if (typeof row.token_hash === 'string' && row.token_hash !== hashToken(token)) {
      throw new AuthError('Bearer token does not match its stored credential');
    }
    await getSupabaseAdmin()
      .from('bearer_tokens')
      .update({ last_used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', payload.bearerTokenId)
      .eq('owner_agent_id', payload.sub);
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (process.env.NODE_ENV === 'production') throw new AuthError('Bearer token validation failed');
  }
}

// Verify a JWT bearer token and enrich the AgentContext with the agent's tier from DB.
// Merges TIER_QUOTAS[tier] as baseline, then applies any JWT custom quota overrides.
export async function verifyAgentTokenWithTier(token: string): Promise<AgentContext> {
  const payload = verifyAgentTokenClaims(token);
  await assertStoredBearerToken(payload, token);

  let tier: AgentContext['tier'] = 'retail_free';
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('agents')
      .select('tier, metadata')
      .eq('id', payload.sub)
      .maybeSingle();
    if (data) {
      const metadata = (data.metadata as Record<string, unknown> | null | undefined) ?? {};
      if (isValidPlan(metadata.plan)) {
        tier = normalizePlan(metadata.plan);
      } else {
        tier = normalizePersistedPlan(data.tier);
      }
    }
  } catch {
    // Non-fatal — default to free tier on lookup failure
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
