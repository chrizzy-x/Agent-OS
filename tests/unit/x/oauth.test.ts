import { beforeEach, describe, expect, it } from 'vitest';
import { openJson } from '../../../src/integrations/x/crypto.js';
import { buildXAuthorizationUrl, parseXOAuthStateCookie } from '../../../src/integrations/x/oauth.js';

describe('X OAuth helpers', () => {
  beforeEach(() => {
    process.env.X_CLIENT_ID = 'client-id';
    process.env.X_REDIRECT_URI = 'https://agentos-app.vercel.app/api/x/callback';
    process.env.X_TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.X_OAUTH_SCOPES = 'tweet.read tweet.write users.read offline.access';
  });

  it('builds an authorization URL and encrypted state cookie', () => {
    const { authorizationUrl, cookieValue, state } = buildXAuthorizationUrl({
      ownerAgentId: 'agent-owner',
      redirectTo: '/dashboard/x',
    });

    const url = new URL(authorizationUrl);
    expect(url.origin).toBe('https://x.com');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');

    const payload = parseXOAuthStateCookie(cookieValue);
    expect(payload?.ownerAgentId).toBe('agent-owner');
    expect(payload?.redirectTo).toBe('/dashboard/x');
    expect(payload?.state).toBe(state);
  });

  it('round-trips encrypted JSON payloads', () => {
    const encrypted = buildXAuthorizationUrl({ ownerAgentId: 'agent-owner' }).cookieValue;
    const payload = openJson<Record<string, string>>(encrypted);
    expect(payload.ownerAgentId).toBe('agent-owner');
  });
});