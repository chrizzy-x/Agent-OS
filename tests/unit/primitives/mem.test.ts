import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockRedis } from '../../setup.js';
import { memSet, memGet, memDelete, memList, memIncr, memExpire } from '../../../src/primitives/mem.js';
import { NotFoundError, QuotaError } from '../../../src/utils/errors.js';
import type { AgentContext } from '../../../src/auth/permissions.js';

const ctx: AgentContext = {
  agentId: 'test-agent-01',
  allowedDomains: [],
  quotas: {
    storageQuotaBytes: 1024 * 1024 * 1024,
    memoryQuotaBytes: 100 * 1024 * 1024,
    rateLimitPerMin: 100,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: memory usage is 0
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue('OK');
  mockRedis.del.mockResolvedValue(1);
  mockRedis.incr.mockResolvedValue(1);
  mockRedis.incrby.mockResolvedValue(5);
  mockRedis.expire.mockResolvedValue(1);
  mockRedis.keys.mockResolvedValue([]);
});

describe('memSet', () => {
  it('stores a value and returns the key', async () => {
    mockRedis.get.mockResolvedValueOnce(null); // key does not exist yet
    const result = await memSet(ctx, { key: 'foo', value: { hello: 'world' } });
    expect(result).toEqual({ key: 'foo' });
    expect(mockRedis.set).toHaveBeenCalledWith(
      'mem:test-agent-01:foo',
      JSON.stringify({ hello: 'world' }),
      'EX',
      expect.any(Number)
    );
  });

  it('respects custom TTL', async () => {
    await memSet(ctx, { key: 'ttlkey', value: 42, ttl: 300 });
    expect(mockRedis.set).toHaveBeenCalledWith(
      'mem:test-agent-01:ttlkey',
      '42',
      'EX',
      300
    );
  });

  it('throws QuotaError when memory quota would be exceeded', async () => {
    // Simulate quota already used up
    const limitedCtx = { ...ctx, quotas: { ...ctx.quotas, memoryQuotaBytes: 1 } };
    mockRedis.get
      .mockResolvedValueOnce(null) // key lookup in memSet
      .mockResolvedValueOnce('1');  // mem_usage counter = 1 byte already used

    await expect(memSet(limitedCtx, { key: 'big', value: 'x'.repeat(100) }))
      .rejects.toThrow(QuotaError);
  });
});

describe('memGet', () => {
  it('returns the deserialized value', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ count: 7 }));
    const result = await memGet(ctx, { key: 'counter' });
    expect(result).toEqual({ key: 'counter', value: { count: 7 } });
    expect(mockRedis.get).toHaveBeenCalledWith('mem:test-agent-01:counter');
  });

  it('throws NotFoundError when key is absent', async () => {
    mockRedis.get.mockResolvedValue(null);
    await expect(memGet(ctx, { key: 'missing' })).rejects.toThrow(NotFoundError);
  });
});

describe('memDelete', () => {
  it('deletes an existing key and returns deleted: true', async () => {
    mockRedis.get.mockResolvedValue('"some value"');
    mockRedis.del.mockResolvedValue(1);
    const result = await memDelete(ctx, { key: 'foo' });
    expect(result).toEqual({ key: 'foo', deleted: true });
    expect(mockRedis.del).toHaveBeenCalledWith('mem:test-agent-01:foo');
  });

  it('returns deleted: false for non-existent key', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.del.mockResolvedValue(0);
    const result = await memDelete(ctx, { key: 'gone' });
    expect(result).toEqual({ key: 'gone', deleted: false });
  });
});

describe('memList', () => {
  it('returns keys with prefix stripped', async () => {
    mockRedis.keys.mockResolvedValue([
      'mem:test-agent-01:key1',
      'mem:test-agent-01:key2',
    ]);
    const result = await memList(ctx, { prefix: '' });
    expect(result.keys).toEqual(['key1', 'key2']);
  });

  it('returns empty array when no keys match', async () => {
    mockRedis.keys.mockResolvedValue([]);
    const result = await memList(ctx, { prefix: 'nonexistent' });
    expect(result.keys).toEqual([]);
  });
});

describe('memIncr', () => {
  it('increments and returns new value', async () => {
    mockRedis.incrby.mockResolvedValue(3);
    const result = await memIncr(ctx, { key: 'counter', amount: 2 });
    expect(result).toEqual({ key: 'counter', value: 3 });
    expect(mockRedis.incrby).toHaveBeenCalledWith('mem:test-agent-01:counter', 2);
  });

  it('defaults amount to 1', async () => {
    mockRedis.incrby.mockResolvedValue(1);
    await memIncr(ctx, { key: 'counter' });
    expect(mockRedis.incrby).toHaveBeenCalledWith('mem:test-agent-01:counter', 1);
  });
});

describe('memExpire', () => {
  it('sets TTL and returns set: true when key exists', async () => {
    mockRedis.expire.mockResolvedValue(1);
    const result = await memExpire(ctx, { key: 'mykey', seconds: 600 });
    expect(result).toEqual({ key: 'mykey', set: true });
  });

  it('returns set: false when key does not exist', async () => {
    mockRedis.expire.mockResolvedValue(0);
    const result = await memExpire(ctx, { key: 'missing', seconds: 600 });
    expect(result).toEqual({ key: 'missing', set: false });
  });
});
