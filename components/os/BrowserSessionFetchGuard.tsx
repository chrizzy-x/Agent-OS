'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    __agentosFetchGuardInstalled?: boolean;
    __agentosSessionLogoutBlockedUntil?: number;
  }
}

function isSameOriginApi(input: RequestInfo | URL): boolean {
  if (typeof window === 'undefined') return false;
  const raw = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  const url = new URL(raw, window.location.origin);
  return url.origin === window.location.origin && url.pathname.startsWith('/api/');
}

function isSessionEndpoint(input: RequestInfo | URL): boolean {
  if (typeof window === 'undefined') return false;
  const raw = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  const url = new URL(raw, window.location.origin);
  return url.origin === window.location.origin && url.pathname.startsWith('/api/session');
}

function withCredentials(init?: RequestInit): RequestInit {
  return {
    ...init,
    credentials: init?.credentials ?? 'include',
  };
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return String(init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
}

function isLogoutBlocked(): boolean {
  return Date.now() < (window.__agentosSessionLogoutBlockedUntil ?? 0);
}

function blockLogoutRefresh(ms: number): void {
  window.__agentosSessionLogoutBlockedUntil = Math.max(window.__agentosSessionLogoutBlockedUntil ?? 0, Date.now() + ms);
}

function settleLogoutRefresh(ms: number): void {
  window.__agentosSessionLogoutBlockedUntil = Date.now() + ms;
}

function signedOutSessionResponse(): Response {
  return new Response(JSON.stringify({ authenticated: false, error: 'unauthorized', message: 'Not signed in' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default function BrowserSessionFetchGuard() {
  useEffect(() => {
    if (window.__agentosFetchGuardInstalled) return;
    window.__agentosFetchGuardInstalled = true;
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const guarded = isSameOriginApi(input);
      const sessionEndpoint = isSessionEndpoint(input);
      const method = requestMethod(input, init);
      const logoutRequest = sessionEndpoint && method === 'DELETE';
      if (logoutRequest) blockLogoutRefresh(15_000);
      if (sessionEndpoint && method === 'GET' && isLogoutBlocked()) return signedOutSessionResponse();

      const first = await nativeFetch(input, guarded ? withCredentials(init) : init);
      if (logoutRequest) settleLogoutRefresh(2_000);
      if (!guarded || first.status !== 401 || sessionEndpoint || isLogoutBlocked()) return first;

      const refresh = await nativeFetch('/api/session/refresh', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'include',
      }).catch(() => null);
      if (!refresh?.ok) return first;

      const payload = await refresh.clone().json().catch(() => null) as { authenticated?: boolean } | null;
      if (payload?.authenticated !== true) return first;

      return nativeFetch(input, withCredentials(init));
    };
  }, []);

  return null;
}
