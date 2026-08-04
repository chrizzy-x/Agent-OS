import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';
import { AuthStoreUnavailableError, createAgentAccount, findAccountsByEmail } from '../../src/auth/agent-store.js';

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

  it('uses a recent real lookup when the auth store becomes temporarily unavailable', async () => {
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
    mockSupabase.from
      .mockReturnValueOnce(successfulQuery)
      .mockReturnValue(failingQuery);

    await expect(findAccountsByEmail('AgentOS-Proof@Example.Com')).resolves.toHaveLength(1);
    const fallback = await findAccountsByEmail('agentos-proof@example.com');

    expect(fallback).toHaveLength(1);
    expect(fallback[0]).toMatchObject({
      id: 'agent-1',
      email: 'agentos-proof@example.com',
      passwordHash: 'hash',
    });
    expect(successfulQuery.eq).toHaveBeenCalledWith('metadata->>email', 'agentos-proof@example.com');
    expect(mockSupabase.from).toHaveBeenCalledTimes(4);
  });

  it('uses a recent created account when the auth store stalls after signup', async () => {
    const insertQuery = {
      insert: vi.fn().mockReturnThis(),
      abortSignal: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
    };
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
    mockSupabase.from
      .mockReturnValueOnce(insertQuery)
      .mockReturnValue(failingQuery);

    await expect(createAgentAccount({
      id: 'agent-created',
      name: 'Created Proof Agent',
      email: 'Created-Proof@Example.Com',
      passwordHash: 'created-hash',
      plan: 'enterprise_plus',
    })).resolves.toEqual({ duplicate: false });

    const fallback = await findAccountsByEmail('created-proof@example.com');

    expect(fallback).toHaveLength(1);
    expect(fallback[0]).toMatchObject({
      id: 'agent-created',
      email: 'Created-Proof@Example.Com',
      passwordHash: 'created-hash',
    });
    expect(mockSupabase.from).toHaveBeenCalledTimes(4);
  });
});
