import { createHash } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';
import { AuthError } from '../../src/utils/errors.js';
import { createAgentToken, verifyAgentTokenWithTier } from '../../src/auth/agent-identity.js';

describe('agent identity route auth', () => {
  const originalRestLookup = process.env.AGENTOS_AGENT_IDENTITY_REST_LOOKUP;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReset();
    process.env.AGENTOS_AGENT_IDENTITY_REST_LOOKUP = '1';
  });

  afterEach(() => {
    if (originalRestLookup === undefined) {
      delete process.env.AGENTOS_AGENT_IDENTITY_REST_LOOKUP;
    } else {
      process.env.AGENTOS_AGENT_IDENTITY_REST_LOOKUP = originalRestLookup;
    }
    vi.unstubAllGlobals();
  });

  it('uses bounded Supabase REST tier lookup before the SDK route auth lookup', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([{
        tier: 'enterprise',
        metadata: { plan: 'enterprise_plus' },
      }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const token = createAgentToken('agent-route-rest', { expiresIn: '1h' });
    const ctx = await verifyAgentTokenWithTier(token);

    expect(ctx.tier).toBe('enterprise_plus');
    expect(ctx.quotas.rateLimitPerMin).toBe(1000);
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/rest/v1/agents?');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ apikey: 'test-service-role-key' }),
    });
  });

  it('uses the recent tier cache when a later REST tier lookup is unavailable', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([{
          tier: 'enterprise',
          metadata: { plan: 'enterprise_plus' },
        }]),
      })
      .mockRejectedValueOnce(new Error('transient unavailable'));
    vi.stubGlobal('fetch', fetchMock);

    const token = createAgentToken('agent-route-cache', { expiresIn: '1h' });

    await expect(verifyAgentTokenWithTier(token)).resolves.toMatchObject({ tier: 'enterprise_plus' });
    await expect(verifyAgentTokenWithTier(token)).resolves.toMatchObject({ tier: 'enterprise_plus' });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('validates stored bearer tokens through REST and updates usage without blocking tier lookup', async () => {
    const token = createAgentToken('agent-bearer-rest', { bearerTokenId: 'token-1', expiresIn: '1h' });
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const fetchMock = vi.fn(async (url: URL, init?: RequestInit) => {
      const href = String(url);
      if (href.includes('/rest/v1/bearer_tokens') && init?.method === 'PATCH') {
        return { ok: true, status: 204, json: vi.fn() };
      }
      if (href.includes('/rest/v1/bearer_tokens')) {
        return {
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue([{
            id: 'token-1',
            owner_agent_id: 'agent-bearer-rest',
            token_hash: tokenHash,
            status: 'active',
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          }]),
        };
      }
      return {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([{
          tier: 'enterprise',
          metadata: { plan: 'enterprise_plus' },
        }]),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyAgentTokenWithTier(token)).resolves.toMatchObject({ tier: 'enterprise_plus' });

    const bearerRead = fetchMock.mock.calls.find(([url, init]) =>
      String(url).includes('/rest/v1/bearer_tokens?') && !(init as RequestInit | undefined)?.method);
    const bearerPatch = fetchMock.mock.calls.find(([url, init]) =>
      String(url).includes('/rest/v1/bearer_tokens?') && (init as RequestInit | undefined)?.method === 'PATCH');
    expect(bearerRead).toBeTruthy();
    expect(bearerPatch).toBeTruthy();
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('rejects revoked stored bearer tokens returned by REST', async () => {
    const token = createAgentToken('agent-bearer-revoked', { bearerTokenId: 'token-revoked', expiresIn: '1h' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([{
        id: 'token-revoked',
        owner_agent_id: 'agent-bearer-revoked',
        token_hash: createHash('sha256').update(token).digest('hex'),
        status: 'revoked',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyAgentTokenWithTier(token)).rejects.toThrow(AuthError);
  });
});
