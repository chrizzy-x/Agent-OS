import { NextRequest, NextResponse } from 'next/server';
import { createAgentToken, verifyAgentTokenWithTier } from '@/src/auth/agent-identity';
import { rotateBrowserSession } from '@/src/auth/browser-auth';
import { assertCapability } from '@/src/auth/capabilities';
import { requireRouteCapability } from '@/src/auth/request';
import { ROUTE_CAPABILITY_POLICY } from '@/src/auth/route-policy';
import { extractRefreshTokenFromCookie, getCookieRequestContext, setAgentSessionCookie } from '@/src/auth/session-cookie';
import { AuthError, toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

async function resolveTokenIssueContext(request: NextRequest, response: NextResponse) {
  try {
    return await requireRouteCapability(request.headers, 'session.token.issue');
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
    const cookieHeader = request.headers.get('cookie') ?? request.headers.get('Cookie') ?? undefined;
    const refreshToken = extractRefreshTokenFromCookie(cookieHeader);
    if (!refreshToken) throw error;
    const rotated = await rotateBrowserSession(response, {
      rawRefreshToken: refreshToken,
      request,
    });
    const context = await verifyAgentTokenWithTier(rotated.accessToken);
    assertCapability(context.tier, ROUTE_CAPABILITY_POLICY['session.token.issue']);
    return context;
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionCookieResponse = NextResponse.json({});
    const context = await resolveTokenIssueContext(request, sessionCookieResponse);
    const bearerToken = createAgentToken(context.agentId, { expiresIn: '90d' });
    const response = NextResponse.json({
      success: true,
      credentials: {
        bearerToken,
        apiKey: bearerToken,
        expiresIn: '90 days',
      },
    }, { headers: sessionCookieResponse.headers });
    setAgentSessionCookie(response, bearerToken, getCookieRequestContext(request));
    return response;
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
