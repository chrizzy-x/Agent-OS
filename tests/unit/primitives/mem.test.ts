import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockRedis, mockSupabase } from '../../setup.js';
import { memSet, memGet, memDelete, memList, memIncr, memExpire } from '../../../src/primitives/mem.js';
import { NotFoundError, QuotaError } from '../../../src/utils/errors.js';
import type { AgentContext } from '../../../src/auth/permissions.js';

const originalNodeEnv = process.env.NODE_ENV;
const originalRedisMemoryTimeout = process.env.AGENTOS_REDIS_MEMORY_TIMEOUT_MS;
const originalRedisMemoryCooldown = process.env.AGENTOS_REDIS_MEMORY_COOLDOWN_MS;

const ctx: AgentContext = {
  agentId: 'test-agent-01',
  allowedDomains: [],
  quotas: {
    storageQuotaBytes: 1024 * 1024 * 1024,
    memoryQuotaBytes: 100 * 1024 * 1024,
    rateLimitPerMin: 100,
  },
};

type MemoryRow = {
  id: string;
  agent_id: string;
  workspace_id: string | null;
  key: string;
  content: string;
  tags: string[];
  namespace_type: string;
  namespace_id: string;
  visibility: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function memoryRowKey(row: Pick<MemoryRow, 'agent_id' | 'key' | 'namespace_type' | 'namespace_id'>): string {
  return `${row.agent_id}:${row.key}:${row.namespace_type}:${row.namespace_id}`;
}

function defaultSupabaseTableBuilder() {
  const builder = {
    insert: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(async () => ({ data: { id: 'audit-1' }, error: null })),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  };
  return builder;
}

function installDurableMemoryTable(rows: Map<string, MemoryRow>) {
  let lastRow: MemoryRow | null = null;

  mockSupabase.from.mockImplementation((table: string) => {
    if (table !== 'agent_memory_store') {
      return defaultSupabaseTableBuilder();
    }

    const filters: Record<string, string> = {};
    const builder = {
      upsert: vi.fn((row: Omit<MemoryRow, 'id' | 'created_at'>) => {
        const now = new Date().toISOString();
        const stored: MemoryRow = {
          id: `mem-${rows.size + 1}`,
          created_at: now,
          updated_at: row.updated_at ?? now,
          ...row,
        };
        rows.set(memoryRowKey(stored), stored);
        lastRow = stored;
        return builder;
      }),
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: string) => {
        filters[column] = value;
        return builder;
      }),
      single: vi.fn(async () => ({ data: lastRow, error: null })),
      maybeSingle: vi.fn(async () => ({
        data: rows.get(`${filters.agent_id}:${filters.key}:${filters.namespace_type}:${filters.namespace_id}`) ?? null,
        error: null,
      })),
    };

    return builder;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV = originalNodeEnv;
  process.env.AGENTOS_REDIS_MEMORY_TIMEOUT_MS = originalRedisMemoryTimeout;
  process.env.AGENTOS_REDIS_MEMORY_COOLDOWN_MS = originalRedisMemoryCooldown;
  // Default: memory usage is 0
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue('OK');
  mockRedis.del.mockResolvedValue(1);
  mockRedis.incr.mockResolvedValue(1);
  mockRedis.incrby.mockResolvedValue(5);
  mockRedis.expire.mockResolvedValue(1);
  mockRedis.keys.mockResolvedValue([]);
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  process.env.AGENTOS_REDIS_MEMORY_TIMEOUT_MS = originalRedisMemoryTimeout;
  process.env.AGENTOS_REDIS_MEMORY_COOLDOWN_MS = originalRedisMemoryCooldown;
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

  it('uses durable memory in production when Redis does not respond', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AGENTOS_REDIS_MEMORY_TIMEOUT_MS = '5';
    process.env.AGENTOS_REDIS_MEMORY_COOLDOWN_MS = '5';
    const rows = new Map<string, MemoryRow>();
    installDurableMemoryTable(rows);
    mockRedis.get.mockImplementation(() => new Promise(() => undefined));
    mockRedis.set.mockImplementation(() => new Promise(() => undefined));

    const result = await memSet(ctx, { key: 'redis-timeout', value: { ok: true } });
    const stored = await memGet(ctx, { key: 'redis-timeout' });

    expect(result).toEqual({ key: 'redis-timeout' });
    expect(stored).toEqual({ key: 'redis-timeout', value: { ok: true } });
    expect(rows.size).toBe(1);
    await new Promise(resolve => setTimeout(resolve, 10));
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

  it('throws when stored value is corrupted (not valid JSON)', async () => {
    mockRedis.get.mockResolvedValue('not-valid-json{{{');
    await expect(memGet(ctx, { key: 'corrupt' })).rejects.toThrow(/Corrupted value/);
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
