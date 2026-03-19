import type { NextResponse } from 'next/server';

export const AGENT_SESSION_COOKIE = 'agent_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

function shouldUseSecureCookie(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}

export function extractSessionTokenFromCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;

  const cookies = cookieHeader.split(';');
  for (const entry of cookies) {
    const [rawName, ...valueParts] = entry.trim().split('=');
    if (rawName === AGENT_SESSION_COOKIE) {
      const value = valueParts.join('=');
      return value ? decodeURIComponent(value) : undefined;
    }
  }

  return undefined;
}

export function setAgentSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: AGENT_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(),
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearAgentSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: AGENT_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(),
    path: '/',
    maxAge: 0,
  });
}

export function getAgentSessionMaxAgeSeconds(): number {
  return SESSION_MAX_AGE_SECONDS;
}
