import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { buildXAuthorizationUrl, X_OAUTH_STATE_COOKIE } from '@/src/integrations/x/oauth';

export const runtime = 'nodejs';

function shouldUseSecureCookie(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}

export async function POST(request: NextRequest) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const body = await request.json().catch(() => ({}));
    const redirectTo = typeof body.redirectTo === 'string' && body.redirectTo.trim().startsWith('/')
      ? body.redirectTo.trim()
      : '/dashboard';

    const { authorizationUrl, cookieValue } = buildXAuthorizationUrl({
      ownerAgentId: agentContext.agentId,
      redirectTo,
    });

    const response = NextResponse.json({ authorizationUrl }, { status: 200 });
    response.cookies.set({
      name: X_OAUTH_STATE_COOKIE,
      value: cookieValue,
      httpOnly: true,
      sameSite: 'lax',
      secure: shouldUseSecureCookie(),
      path: '/',
      maxAge: 60 * 10,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start X OAuth';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}