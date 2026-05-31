import { getSupabaseAdmin } from '../storage/supabase.js';
import { AuthError, PermissionError } from '../utils/errors.js';
import type { AgentContext } from './permissions.js';
import type { Capability } from './capabilities.js';
import { assertCapability } from './capabilities.js';
import { ROUTE_CAPABILITY_POLICY, type RoutePolicyKey } from './route-policy.js';
import { extractBearerToken, verifyAgentToken, verifyAgentTokenWithTier } from './agent-identity.js';
import { extractSessionTokenFromCookie } from './session-cookie.js';
import { getAdminToken, getCronSecret } from '../config/env.js';
import { requireSdkKernelContext } from '../sdk/auth.js';
import { resolveDefaultWorkspaceForAgent } from '../workspaces/service.js';

function readAuthorization(headers: Headers | globalThis.Headers): string | undefined {
  return headers.get('authorization') ?? headers.get('Authorization') ?? undefined;
}

function readCookie(headers: Headers | globalThis.Headers): string | undefined {
  return headers.get('cookie') ?? headers.get('Cookie') ?? undefined;
}

function readAgentToken(headers: Headers | globalThis.Headers): string | undefined {
  return extractBearerToken(readAuthorization(headers)) ?? extractSessionTokenFromCookie(readCookie(headers));
}

export type KernelRouteContext = AgentContext & {
  workspaceId: string | null;
  authSource: 'agent' | 'sdk';
  sdkCredentialId?: string | null;
  sdkScopes?: string[] | null;
};

export function requireAgentContext(headers: Headers | globalThis.Headers): AgentContext {
  const token = readAgentToken(headers);
  if (!token) {
    throw new AuthError('Authorization bearer token required');
  }
  return verifyAgentToken(token);
}

// Async variant — enriches context with tier from DB.
export async function requireAgentContextWithTier(headers: Headers | globalThis.Headers): Promise<AgentContext> {
  const token = readAgentToken(headers);
  if (!token) {
    throw new AuthError('Authorization bearer token required');
  }
  return verifyAgentTokenWithTier(token);
}

export async function requireAgentCapability(
  headers: Headers | globalThis.Headers,
  capability: Capability,
): Promise<AgentContext> {
  const context = await requireAgentContextWithTier(headers);
  assertCapability(context.tier, capability);
  return context;
}

export async function requireRouteCapability(
  headers: Headers | globalThis.Headers,
  route: RoutePolicyKey,
): Promise<AgentContext> {
  return requireAgentCapability(headers, ROUTE_CAPABILITY_POLICY[route]);
}

export async function requireKernelRouteAccess(
  headers: Headers | globalThis.Headers,
  access: 'read' | 'register' | 'command',
): Promise<KernelRouteContext> {
  const bearer = extractBearerToken(readAuthorization(headers));
  if (bearer?.startsWith('sdk_')) {
    const requiredScopes = access === 'read'
      ? ['kernel.read', 'kernel']
      : access === 'command'
        ? ['kernel.command', 'kernel.write', 'kernel']
        : ['kernel.register', 'kernel.write', 'kernel'];
    return requireSdkKernelContext(bearer, requiredScopes);
  }

  const ctx = await requireRouteCapability(headers, 'sdk.kernel');
  const workspace = await resolveDefaultWorkspaceForAgent(ctx.agentId);
  return {
    ...ctx,
    workspaceId: workspace?.id ?? null,
    authSource: 'agent',
    sdkCredentialId: null,
    sdkScopes: null,
  };
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

function isOpsAdminMetadata(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.ops_admin === true || metadata?.role === 'platform_admin';
}

export async function requireOpsAdminAccess(headers: Headers | globalThis.Headers): Promise<void> {
  if (hasAdminAccess(headers)) {
    return;
  }

  const agentContext = requireAgentContext(headers);
  const supabase = getSupabaseAdmin();
  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, metadata')
    .eq('id', agentContext.agentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load agent record: ${error.message}`);
  }

  if (!agent) {
    throw new AuthError('Unknown agent');
  }

  const metadata = (agent.metadata as Record<string, unknown> | null | undefined) ?? {};
  if (!isOpsAdminMetadata(metadata)) {
    throw new PermissionError('Ops admin access required');
  }
}

export async function hasOpsAdminAccess(headers: Headers | globalThis.Headers): Promise<boolean> {
  try {
    await requireOpsAdminAccess(headers);
    return true;
  } catch {
    return false;
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
