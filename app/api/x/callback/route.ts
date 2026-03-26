import { NextRequest, NextResponse } from 'next/server';
import { getPublicAppUrl } from '@/src/config/env';
import { requireAgentContext } from '@/src/auth/request';
import { connectXAccountFromOAuth } from '@/src/integrations/x/service';
import { parseXOAuthStateCookie, X_OAUTH_STATE_COOKIE } from '@/src/integrations/x/oauth';

export const runtime = 'nodejs';

function shouldUseSecureCookie(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}

function clearStateCookie(response: NextResponse): void {
  response.cookies.set({
    name: X_OAUTH_STATE_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(),
    path: '/',
    maxAge: 0,
  });
}

function redirectWithParams(pathname: string, params: Record<string, string>): NextResponse {
  const redirectUrl = new URL(pathname, getPublicAppUrl());
  for (const [key, value] of Object.entries(params)) {
    redirectUrl.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(redirectUrl);
  clearStateCookie(response);
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const cookieState = request.cookies.get(X_OAUTH_STATE_COOKIE)?.value;
  const oauthState = parseXOAuthStateCookie(cookieState);

  if (!code || !state || !oauthState || oauthState.state !== state) {
    return redirectWithParams('/dashboard', { x_oauth: 'error', reason: 'state_mismatch' });
  }

  try {
    const ownerContext = requireAgentContext(request.headers);
    if (ownerContext.agentId !== oauthState.ownerAgentId) {
      return redirectWithParams('/dashboard', { x_oauth: 'error', reason: 'session_mismatch' });
    }

    const account = await connectXAccountFromOAuth({
      ownerContext,
      code,
      codeVerifier: oauthState.codeVerifier,
    });

    const response = redirectWithParams(oauthState.redirectTo || '/dashboard', {
      x_oauth: 'success',
      username: String(account.username ?? ''),
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'x_oauth_failed';
    return redirectWithParams(oauthState.redirectTo || '/dashboard', {
      x_oauth: 'error',
      reason: message.slice(0, 120),
    });
  }
}