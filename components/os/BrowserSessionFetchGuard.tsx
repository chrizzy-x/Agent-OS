'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    __agentosFetchGuardInstalled?: boolean;
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

export default function BrowserSessionFetchGuard() {
  useEffect(() => {
    if (window.__agentosFetchGuardInstalled) return;
    window.__agentosFetchGuardInstalled = true;
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const guarded = isSameOriginApi(input);
      const first = await nativeFetch(input, guarded ? withCredentials(init) : init);
      if (!guarded || first.status !== 401 || isSessionEndpoint(input)) return first;

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
