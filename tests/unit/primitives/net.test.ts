import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockRedis } from '../../setup.js';
import { SecurityError, ValidationError } from '../../../src/utils/errors.js';

// Mock dns/promises before importing net primitive
vi.mock('dns/promises', () => ({
  lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
}));

import { netHttpGet, netHttpPost, netHttpDelete, netDnsResolve } from '../../../src/primitives/net.js';
import type { AgentContext } from '../../../src/auth/permissions.js';

const ctx: AgentContext = {
  agentId: 'net-agent',
  allowedDomains: ['httpbin.org', 'api.example.com'],
  quotas: {
    storageQuotaBytes: 1024 * 1024 * 1024,
    memoryQuotaBytes: 100 * 1024 * 1024,
    rateLimitPerMin: 100,
  },
};

// Build a mock fetch response
function mockFetchResponse(status: number, body: string, contentType = 'application/json') {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(body);
  let offset = 0;

  return {
    status,
    headers: {
      get: (h: string) => h === 'content-type' ? contentType : null,
      entries: () => [['content-type', contentType]].values(),
    },
    body: {
      getReader: () => ({
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: bytes })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        cancel: vi.fn(),
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Rate limit counter: always returns 1 (under limit)
  mockRedis.incr.mockResolvedValue(1);
  mockRedis.expire.mockResolvedValue(1);
  // Reset fetch mock
  vi.stubGlobal('fetch', vi.fn());
});

describe('netHttpGet', () => {
  it('makes a GET request and returns body', async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse(200, '{"ok":true}') as any);
    const result = await netHttpGet(ctx, { url: 'https://httpbin.org/get' });
    expect(result.status).toBe(200);
    expect(result.body).toContain('"ok":true');
  });

  it('rejects HTTP (non-HTTPS) URLs', async () => {
    await expect(netHttpGet(ctx, { url: 'http://httpbin.org/get' }))
      .rejects.toThrow(SecurityError);
  });

  it('rejects private IP addresses (SSRF)', async () => {
    const { lookup } = await import('dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce([{ address: '192.168.1.1', family: 4 }] as any);
    await expect(netHttpGet(ctx, { url: 'https://internal.example.com/secret' }))
      .rejects.toThrow(SecurityError);
  });

  it('rejects loopback addresses', async () => {
    const { lookup } = await import('dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }] as any);
    await expect(netHttpGet(ctx, { url: 'https://localhost.evil.com/' }))
      .rejects.toThrow(SecurityError);
  });

  it('rejects AWS metadata endpoint', async () => {
    const { lookup } = await import('dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }] as any);
    await expect(netHttpGet(ctx, { url: 'https://metadata.aws.example.com/' }))
      .rejects.toThrow(SecurityError);
  });

  it('rejects domains not in allowlist', async () => {
    await expect(netHttpGet(ctx, { url: 'https://notallowed.example.com/' }))
      .rejects.toThrow(SecurityError);
  });

  it('passes custom headers to the request', async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse(200, '{}') as any);
    await netHttpGet(ctx, { url: 'https://httpbin.org/headers', headers: { 'X-Custom': 'value' } });
    expect(fetch).toHaveBeenCalledWith(
      'https://httpbin.org/headers',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Custom': 'value' }),
      })
    );
  });
});

describe('netHttpPost', () => {
  it('sends body as JSON', async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse(201, '{"id":1}') as any);
    const result = await netHttpPost(ctx, { url: 'https://api.example.com/items', body: { name: 'test' } });
    expect(result.status).toBe(201);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/items',
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('netHttpDelete', () => {
  it('makes a DELETE request', async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse(204, '') as any);
    const result = await netHttpDelete(ctx, { url: 'https://api.example.com/items/1' });
    expect(result.status).toBe(204);
  });
});

describe('netDnsResolve', () => {
  it('returns resolved addresses', async () => {
    const { lookup } = await import('dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:21f:cb07:6820:80da:af6b:8b2c', family: 6 },
    ] as any);
    const result = await netDnsResolve(ctx, { hostname: 'example.com' });
    expect(result.hostname).toBe('example.com');
    expect(result.addresses).toHaveLength(2);
  });
});
