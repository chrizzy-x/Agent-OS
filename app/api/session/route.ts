import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, verifyAgentTokenClaims, verifyAgentTokenWithTier } from '@/src/auth/agent-identity';
import { getPlanDescriptor } from '@/src/auth/capabilities';
import { findRefreshSessionByToken, revokeRefreshSession } from '@/src/auth/browser-sessions';
import { rotateBrowserSession } from '@/src/auth/browser-auth';
import {
  clearAgentSessionCookies,
  extractAccessTokenFromCookie,
  extractRefreshTokenFromCookie,
  getCookieRequestContext,
} from '@/src/auth/session-cookie';
import { findAccountById } from '@/src/auth/agent-store';
import { reconcileAgentOSProvisioning } from '@/src/agentos/provisioning';

export const runtime = 'nodejs';

function readAccessToken(headers: Headers | globalThis.Headers): string | undefined {
  const authHeader = headers.get('authorization') ?? headers.get('Authorization') ?? undefined;
  const cookieHeader = headers.get('cookie') ?? headers.get('Cookie') ?? undefined;
  return extractBearerToken(authHeader) ?? extractAccessTokenFromCookie(cookieHeader);
}

function readRefreshToken(headers: Headers | globalThis.Headers): string | undefined {
  const cookieHeader = headers.get('cookie') ?? headers.get('Cookie') ?? undefined;
  return extractRefreshTokenFromCookie(cookieHeader);
}

async function buildSessionPayload(agentId: string, token: string) {
  try {
    await reconcileAgentOSProvisioning(agentId);
  } catch {
    // Session checks should continue even if reconciliation fails.
  }
  const claims = verifyAgentTokenClaims(token);
  const agent = await findAccountById(agentId);
  const plan = getPlanDescriptor(agent?.metadata.plan);
  return {
    authenticated: true,
    session: {
      agentName: agent?.name ?? null,
      plan: plan.plan,
      planLabel: plan.label,
      accountType: plan.enterprise ? 'enterprise' : 'retail',
      capabilities: plan.capabilities,
      expiresAt: claims.exp ? new Date(claims.exp * 1000).toISOString() : null,
    },
  };
}

export async function GET(request: NextRequest) {
  const optional = new URL(request.url).searchParams.get('optional') === '1';

  const accessToken = readAccessToken(request.headers);
  if (accessToken) {
    try {
      const context = await verifyAgentTokenWithTier(accessToken);
      return NextResponse.json(await buildSessionPayload(context.agentId, accessToken));
    } catch {
      // Continue to refresh session fallback.
    }
  }

  const refreshToken = readRefreshToken(request.headers);
  if (refreshToken) {
    try {
      const response = NextResponse.json({ authenticated: true });
      const rotated = await rotateBrowserSession(response, {
        rawRefreshToken: refreshToken,
        request,
      });
      const payload = await buildSessionPayload(rotated.agentId, rotated.accessToken);
      return NextResponse.json(payload, {
        headers: response.headers,
      });
    } catch {
      // Fall through to unauthorized response.
    }
  }

  const response = NextResponse.json(
    { authenticated: false, error: 'unauthorized', message: 'Not signed in' },
    { status: optional ? 200 : 401 },
  );
  clearAgentSessionCookies(response, getCookieRequestContext(request));
  return response;
}

export async function DELETE(request: NextRequest) {
  const refreshToken = readRefreshToken(request.headers);
  if (refreshToken) {
    try {
      const session = await findRefreshSessionByToken(refreshToken);
      if (session) {
        await revokeRefreshSession({ agentId: session.agentId, sessionId: session.id });
      }
    } catch {
      // Continue clearing cookies even if revocation fails.
    }
  }

  const response = NextResponse.json({ success: true });
  clearAgentSessionCookies(response, getCookieRequestContext(request));
  return response;
}
