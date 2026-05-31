export interface BrowserSession {
  agentName: string | null;
  plan?: string;
  planLabel?: string;
  accountType?: 'retail' | 'enterprise';
  capabilities?: string[];
  expiresAt: string | null;
}

export interface BrowserTokenCredentials {
  bearerToken: string;
  apiKey: string;
  expiresIn: string;
}

export function clearLegacyBrowserAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('apiKey');
  localStorage.removeItem('agentId');
}

export async function fetchBrowserSession(): Promise<BrowserSession | null> {
  const response = await fetch('/api/session', { cache: 'no-store', credentials: 'include' });
  if (!response.ok) {
    clearLegacyBrowserAuth();
    return null;
  }

  const payload = await response.json() as { authenticated?: boolean; session?: BrowserSession };
  return payload.authenticated ? (payload.session ?? null) : null;
}

export async function destroyBrowserSession(): Promise<void> {
  await fetch('/api/session', { method: 'DELETE', credentials: 'include' });
  clearLegacyBrowserAuth();
}

export async function issueBrowserToken(): Promise<BrowserTokenCredentials> {
  const response = await fetch('/api/session/token', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  const payload = await response.json() as { credentials?: BrowserTokenCredentials; error?: string };
  if (!response.ok || !payload.credentials) {
    throw new Error(payload.error || 'Failed to generate a bearer token');
  }

  return payload.credentials;
}
