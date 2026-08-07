import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mockSupabase } from '../setup.js';
import { POST } from '../../app/api/signin/route.js';
import { hashPassword } from '../../src/auth/password.js';
import { createSigninLookupHint } from '../../src/auth/signin-hint.js';
import { resetAuthStoreLookupCacheForTests } from '../../src/auth/agent-store.js';
import { AGENT_SIGNIN_HINT_COOKIE } from '../../src/auth/session-cookie.js';

function createSigninRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      email: 'proof@example.com',
      password: 'strongpass123',
      ...body,
    }),
  });
}

describe('POST /api/signin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthStoreLookupCacheForTests();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('metadata email lookup unavailable')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses a valid signin hint cookie for persistent re-login before falling back to email lookup', async () => {
    const passwordHash = await hashPassword('strongpass123');
    const agentQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'agent_hint',
          name: 'Hinted Agent',
          metadata: {
            email: 'proof@example.com',
            password_hash: passwordHash,
            plan: 'enterprise_plus',
          },
        },
        error: null,
      }),
      abortSignal: vi.fn().mockReturnThis(),
    };
    const sessionQuery = {
      upsert: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'use local test state' } }),
    };
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'agents') return agentQuery;
      return sessionQuery;
    });

    const response = await POST(createSigninRequest({}, {
      cookie: `${AGENT_SIGNIN_HINT_COOKIE}=${encodeURIComponent(createSigninLookupHint('agent_hint', 'proof@example.com'))}`,
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.credentials.signinHint).toEqual(expect.any(String));
    expect(response.headers.get('set-cookie')).toContain(`${AGENT_SIGNIN_HINT_COOKIE}=`);
    expect(agentQuery.eq).toHaveBeenCalledWith('id', 'agent_hint');
    expect(agentQuery.eq).not.toHaveBeenCalledWith('metadata->>email', 'proof@example.com');
  });
});
