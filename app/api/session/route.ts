import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, verifyAgentTokenClaims } from '@/src/auth/agent-identity';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { clearAgentSessionCookie, extractSessionTokenFromCookie } from '@/src/auth/session-cookie';
import { findAccountById } from '@/src/auth/agent-store';
import { getPlanDescriptor } from '@/src/auth/capabilities';
import { reconcileAgentOSProvisioning } from '@/src/agentos/provisioning';

export const runtime = 'nodejs';

function readSessionToken(headers: Headers | globalThis.Headers): string | undefined {
  const authHeader = headers.get('authorization') ?? headers.get('Authorization') ?? undefined;
  const cookieHeader = headers.get('cookie') ?? headers.get('Cookie') ?? undefined;
  return extractBearerToken(authHeader) ?? extractSessionTokenFromCookie(cookieHeader);
}

export async function GET(request: NextRequest) {
  const optional = new URL(request.url).searchParams.get('optional') === '1';
  try {
    const context = await requireAgentContextWithTier(request.headers);
    try {
      await reconcileAgentOSProvisioning(context.agentId);
    } catch {
      // Session checks should continue even if reconciliation fails.
    }
    const token = readSessionToken(request.headers);
    const claims = token ? verifyAgentTokenClaims(token) : null;
    const agent = await findAccountById(context.agentId);
    const plan = getPlanDescriptor(agent?.metadata.plan ?? context.tier);

    return NextResponse.json({
      authenticated: true,
      session: {
        agentName: agent?.name ?? null,
        plan: plan.plan,
        planLabel: plan.label,
        accountType: plan.enterprise ? 'enterprise' : 'retail',
        capabilities: plan.capabilities,
        expiresAt: claims?.exp ? new Date(claims.exp * 1000).toISOString() : null,
      },
    });
  } catch {
    const response = NextResponse.json(
      { authenticated: false, error: 'unauthorized', message: 'Not signed in' },
      { status: optional ? 200 : 401 },
    );
    clearAgentSessionCookie(response);
    return response;
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  clearAgentSessionCookie(response);
  return response;
}
