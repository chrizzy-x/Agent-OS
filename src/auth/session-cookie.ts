import type { NextResponse } from 'next/server';

export const AGENT_ACCESS_COOKIE = 'agent_access';
export const AGENT_REFRESH_COOKIE = 'agent_refresh';
export const AGENT_LEGACY_SESSION_COOKIE = 'agent_session';
const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24;
const REFRESH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

function shouldUseSecureCookie(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}

function readCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const cookies = cookieHeader.split(';');
  for (const entry of cookies) {
    const [rawName, ...valueParts] = entry.trim().split('=');
    if (rawName === name) {
      const value = valueParts.join('=');
      return value ? decodeURIComponent(value) : undefined;
    }
  }
  return undefined;
}

export function extractAccessTokenFromCookie(cookieHeader: string | undefined): string | undefined {
  return readCookieValue(cookieHeader, AGENT_ACCESS_COOKIE)
    ?? readCookieValue(cookieHeader, AGENT_LEGACY_SESSION_COOKIE);
}

export function extractRefreshTokenFromCookie(cookieHeader: string | undefined): string | undefined {
  return readCookieValue(cookieHeader, AGENT_REFRESH_COOKIE);
}

export function extractSessionTokenFromCookie(cookieHeader: string | undefined): string | undefined {
  return extractAccessTokenFromCookie(cookieHeader);
}

export function setAgentSessionCookies(
  response: NextResponse,
  credentials: { accessToken: string; refreshToken: string },
): void {
  const secure = shouldUseSecureCookie();
  response.cookies.set({
    name: AGENT_ACCESS_COOKIE,
    value: credentials.accessToken,
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
  });
  response.cookies.set({
    name: AGENT_REFRESH_COOKIE,
    value: credentials.refreshToken,
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
  });
  response.cookies.set({
    name: AGENT_LEGACY_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 0,
  });
}

export function setAgentSessionCookie(response: NextResponse, token: string): void {
  const secure = shouldUseSecureCookie();
  response.cookies.set({
    name: AGENT_ACCESS_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
  });
  response.cookies.set({
    name: AGENT_LEGACY_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
  });
}

export function clearAgentSessionCookies(response: NextResponse): void {
  const secure = shouldUseSecureCookie();
  for (const name of [AGENT_ACCESS_COOKIE, AGENT_REFRESH_COOKIE, AGENT_LEGACY_SESSION_COOKIE]) {
    response.cookies.set({
      name,
      value: '',
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 0,
    });
  }
}

export function clearAgentSessionCookie(response: NextResponse): void {
  clearAgentSessionCookies(response);
}

export function getAgentSessionMaxAgeSeconds(): number {
  return ACCESS_TOKEN_MAX_AGE_SECONDS;
}

export function getAgentRefreshSessionMaxAgeSeconds(): number {
  return REFRESH_TOKEN_MAX_AGE_SECONDS;
}
