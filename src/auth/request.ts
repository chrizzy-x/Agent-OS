import { AuthError } from '../utils/errors.js';
import type { AgentContext } from './permissions.js';
import { extractBearerToken, verifyAgentToken } from './agent-identity.js';
import { getAdminToken, getCronSecret } from '../config/env.js';

function readAuthorization(headers: Headers | globalThis.Headers): string | undefined {
  return headers.get('authorization') ?? headers.get('Authorization') ?? undefined;
}

export function requireAgentContext(headers: Headers | globalThis.Headers): AgentContext {
  const token = extractBearerToken(readAuthorization(headers));
  if (!token) {
    throw new AuthError('Authorization bearer token required');
  }
  return verifyAgentToken(token);
}

export function hasAgentAccess(headers: Headers | globalThis.Headers): boolean {
  try {
    requireAgentContext(headers);
    return true;
  } catch {
    return false;
  }
}

export function hasAdminAccess(headers: Headers | globalThis.Headers): boolean {
  const token = extractBearerToken(readAuthorization(headers));
  if (!token) return false;
  return token === getAdminToken();
}

export function requireAdminAccess(headers: Headers | globalThis.Headers): void {
  if (!hasAdminAccess(headers)) {
    throw new AuthError('Invalid admin token');
  }
}

export function hasCronAccess(headers: Headers | globalThis.Headers): boolean {
  const token = extractBearerToken(readAuthorization(headers));
  const cronSecret = getCronSecret();

  if (token && token === getAdminToken()) {
    return true;
  }

  if (token && cronSecret && token === cronSecret) {
    return true;
  }

  const vercelCron = headers.get('x-vercel-cron');
  return typeof vercelCron === 'string' && vercelCron.length > 0 && Boolean(cronSecret);
}

export function requireCronAccess(headers: Headers | globalThis.Headers): void {
  if (!hasCronAccess(headers)) {
    throw new AuthError('Invalid cron token');
  }
}
