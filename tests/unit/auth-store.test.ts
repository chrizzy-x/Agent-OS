import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';
import { AuthStoreUnavailableError, findAccountsByEmail } from '../../src/auth/agent-store.js';

describe('auth store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('does not convert configured Supabase lookup failures into missing accounts', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: null,
        error: { message: 'query timeout' },
      }).then(resolve),
    };
    mockSupabase.from.mockReturnValue(query);

    await expect(findAccountsByEmail('agentos-proof@example.com')).rejects.toBeInstanceOf(AuthStoreUnavailableError);
    expect(mockSupabase.from).toHaveBeenCalledTimes(3);
  });

  it('retries transient Supabase lookup failures before returning the account', async () => {
    const failingQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: null,
        error: { message: 'query timeout' },
      }).then(resolve),
    };
    const successfulQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: [{
          id: 'agent-1',
          name: 'Proof Agent',
          metadata: {
            email: 'agentos-proof@example.com',
            password_hash: 'hash',
            plan: 'enterprise_plus',
          },
        }],
        error: null,
      }).then(resolve),
    };
    mockSupabase.from
      .mockReturnValueOnce(failingQuery)
      .mockReturnValueOnce(successfulQuery);

    const accounts = await findAccountsByEmail('agentos-proof@example.com');

    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      id: 'agent-1',
      email: 'agentos-proof@example.com',
      passwordHash: 'hash',
    });
    expect(mockSupabase.from).toHaveBeenCalledTimes(2);
  });
});
