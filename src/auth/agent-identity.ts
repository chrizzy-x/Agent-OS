import jwt from 'jsonwebtoken';
import { AgentContext, AgentQuotas, DEFAULT_QUOTAS } from './permissions.js';
import { AuthError } from '../utils/errors.js';

export interface AgentTokenPayload {
  sub: string; // agentId
  allowedDomains?: string[];
  quotas?: Partial<AgentQuotas>;
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
export function verifyAgentToken(token: string): AgentContext {
  const payload = verifyAgentTokenClaims(token);

  return {
    agentId: payload.sub,
    allowedDomains: payload.allowedDomains ?? [],
    quotas: {
      ...DEFAULT_QUOTAS,
      ...payload.quotas,
    },
  };
}

// Create a signed JWT for an agent - used in admin agent creation and testing.
export function createAgentToken(
  agentId: string,
  options?: {
    allowedDomains?: string[];
    quotas?: Partial<AgentQuotas>;
    expiresIn?: string | number;
  }
): string {
  const payload: AgentTokenPayload = {
    sub: agentId,
    allowedDomains: options?.allowedDomains ?? [],
    quotas: options?.quotas,
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
