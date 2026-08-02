import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';
import { AuthStoreUnavailableError, findAccountsByEmail } from '../../src/auth/agent-store.js';

describe('auth store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });
});
