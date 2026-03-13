import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockRedis, mockSupabase } from '../setup.js';
import { checkRateLimit, checkStorageQuota, checkMemoryQuota, adjustMemoryUsage } from '../../src/runtime/resource-manager.js';
import { RateLimitError, QuotaError } from '../../src/utils/errors.js';
import type { AgentContext } from '../../src/auth/permissions.js';

const ctx: AgentContext = {
  agentId: 'quota-agent',
  allowedDomains: [],
  quotas: {
    storageQuotaBytes: 10 * 1024 * 1024,  // 10MB
    memoryQuotaBytes: 5 * 1024 * 1024,    // 5MB
    rateLimitPerMin: 5,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis.incr.mockResolvedValue(1);
  mockRedis.expire.mockResolvedValue(1);
  mockRedis.get.mockResolvedValue(null);
  mockRedis.incrby.mockResolvedValue(0);
  mockRedis.decrby.mockResolvedValue(0);
});

describe('checkRateLimit', () => {
  it('does not throw when under the limit', async () => {
    mockRedis.incr.mockResolvedValue(3); // 3 of 5
    await expect(checkRateLimit(ctx)).resolves.not.toThrow();
  });

  it('throws RateLimitError when count exceeds limit', async () => {
    mockRedis.incr.mockResolvedValue(6); // 6 > 5
    await expect(checkRateLimit(ctx)).rejects.toThrow(RateLimitError);
  });

  it('sets 2-minute TTL on first request in a bucket', async () => {
    mockRedis.incr.mockResolvedValue(1); // first request
    await checkRateLimit(ctx);
    expect(mockRedis.expire).toHaveBeenCalledWith(expect.stringContaining('rate:quota-agent:'), 120);
  });

  it('does not reset TTL on subsequent requests', async () => {
    mockRedis.incr.mockResolvedValue(2); // second request
    await checkRateLimit(ctx);
    expect(mockRedis.expire).not.toHaveBeenCalled();
  });
});

describe('checkStorageQuota', () => {
  it('does not throw when under quota', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [{ size_bytes: 1024 * 1024 }], error: null }), // 1MB used
    };
    mockSupabase.from.mockReturnValue(chain);
    // Adding 1MB: 1MB + 1MB = 2MB < 10MB quota
    await expect(checkStorageQuota(ctx, 1024 * 1024)).resolves.not.toThrow();
  });

  it('throws QuotaError when storage would exceed quota', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [{ size_bytes: 9.5 * 1024 * 1024 }], error: null }), // 9.5MB used
    };
    mockSupabase.from.mockReturnValue(chain);
    // Adding 1MB: 9.5MB + 1MB = 10.5MB > 10MB quota
    await expect(checkStorageQuota(ctx, 1024 * 1024)).rejects.toThrow(QuotaError);
  });

  it('fails open (does not throw) when quota check itself errors', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    };
    mockSupabase.from.mockReturnValue(chain);
    // Should not throw — fail open
    await expect(checkStorageQuota(ctx, 1024)).resolves.not.toThrow();
  });
});

describe('checkMemoryQuota', () => {
  it('does not throw when under quota', async () => {
    mockRedis.get.mockResolvedValue(String(1 * 1024 * 1024)); // 1MB used
    // Adding 1MB: 1MB + 1MB = 2MB < 5MB quota
    await expect(checkMemoryQuota(ctx, 1024 * 1024)).resolves.not.toThrow();
  });

  it('throws QuotaError when memory would exceed quota', async () => {
    mockRedis.get.mockResolvedValue(String(4.8 * 1024 * 1024)); // 4.8MB used
    // Adding 500KB: 4.8MB + 0.5MB = 5.3MB > 5MB quota
    await expect(checkMemoryQuota(ctx, 500 * 1024)).rejects.toThrow(QuotaError);
  });

  it('starts from 0 when no usage key exists', async () => {
    mockRedis.get.mockResolvedValue(null);
    // No usage + 1MB = 1MB < 5MB
    await expect(checkMemoryQuota(ctx, 1024 * 1024)).resolves.not.toThrow();
  });
});

describe('adjustMemoryUsage', () => {
  it('increments usage for positive delta', async () => {
    await adjustMemoryUsage('quota-agent', 1024);
    expect(mockRedis.incrby).toHaveBeenCalledWith('mem_usage:quota-agent:total', 1024);
  });

  it('decrements usage for negative delta', async () => {
    await adjustMemoryUsage('quota-agent', -512);
    expect(mockRedis.decrby).toHaveBeenCalledWith('mem_usage:quota-agent:total', 512);
  });

  it('does nothing for delta of 0', async () => {
    await adjustMemoryUsage('quota-agent', 0);
    expect(mockRedis.incrby).not.toHaveBeenCalled();
    expect(mockRedis.decrby).not.toHaveBeenCalled();
  });
});
