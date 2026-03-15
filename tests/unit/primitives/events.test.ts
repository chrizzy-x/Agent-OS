import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockRedis } from '../../setup.js';
import { eventsPublish, eventsSubscribe, eventsUnsubscribe, eventsListTopics } from '../../../src/primitives/events.js';
import type { AgentContext } from '../../../src/auth/permissions.js';

const ctx: AgentContext = {
  agentId: 'evt-agent',
  allowedDomains: [],
  quotas: {
    storageQuotaBytes: 1024 * 1024 * 1024,
    memoryQuotaBytes: 100 * 1024 * 1024,
    rateLimitPerMin: 100,
  },
};

beforeEach(() => {
  vi.clearAllMocks();

  const pipeline = {
    lpush: vi.fn().mockReturnThis(),
    ltrim: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    publish: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([1, 1, 1, 1]),
  };
  mockRedis.pipeline.mockReturnValue(pipeline);
  mockRedis.set.mockResolvedValue('OK');
  mockRedis.del.mockResolvedValue(1);
  mockRedis.lrange.mockResolvedValue([]);
  mockRedis.keys.mockResolvedValue([]);
  mockRedis.llen.mockResolvedValue(0);
});

describe('eventsPublish', () => {
  it('returns a message ID and topic', async () => {
    const result = await eventsPublish(ctx, { topic: 'my.topic', message: { event: 'click' } });
    expect(result.topic).toBe('my.topic');
    expect(typeof result.messageId).toBe('string');
    expect(result.messageId).toMatch(/^\d+-[a-z0-9]+$/);
  });

  it('stores message via Redis pipeline (lpush + ltrim + expire + publish)', async () => {
    await eventsPublish(ctx, { topic: 'orders', message: { orderId: 42 } });
    const pipeline = mockRedis.pipeline();
    expect(pipeline.lpush).toHaveBeenCalled();
    expect(pipeline.ltrim).toHaveBeenCalled();
    expect(pipeline.expire).toHaveBeenCalled();
    expect(pipeline.exec).toHaveBeenCalled();
  });

  it('uses a public topic key when isPublic is true', async () => {
    await eventsPublish(ctx, { topic: 'broadcast', message: 'hello', isPublic: true });
    const pipeline = mockRedis.pipeline();
    expect(pipeline.lpush).toHaveBeenCalledWith(
      expect.stringContaining('events:public:broadcast'),
      expect.any(String)
    );
  });

  it('generates unique message IDs across calls', async () => {
    const results = await Promise.all([
      eventsPublish(ctx, { topic: 'test', message: 'a' }),
      eventsPublish(ctx, { topic: 'test', message: 'b' }),
      eventsPublish(ctx, { topic: 'test', message: 'c' }),
    ]);
    const ids = results.map(r => r.messageId);
    expect(new Set(ids).size).toBe(3);
  });

  it('rejects oversized messages', async () => {
    const big = 'x'.repeat(1.1 * 1024 * 1024);
    await expect(eventsPublish(ctx, { topic: 'test', message: big }))
      .rejects.toThrow();
  });
});

describe('eventsSubscribe', () => {
  it('returns a subscription ID and recent messages', async () => {
    const envelope = JSON.stringify({ id: '1-abc', topic: 'orders', message: { orderId: 1 }, timestamp: new Date().toISOString() });
    mockRedis.lrange.mockResolvedValue([envelope]);

    const result = await eventsSubscribe(ctx, { topic: 'orders' });
    expect(result.subscriptionId).toContain('sub_evt-agent_orders');
    expect(result.recentMessages).toHaveLength(1);
    expect(result.recentMessages[0]).toMatchObject({ id: '1-abc' });
  });

  it('stores subscription record in Redis', async () => {
    await eventsSubscribe(ctx, { topic: 'prices' });
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining('subscriptions:evt-agent'),
      expect.any(String),
      'EX',
      expect.any(Number)
    );
  });
});

describe('eventsUnsubscribe', () => {
  it('deletes subscription key and returns unsubscribed: true', async () => {
    mockRedis.del.mockResolvedValue(1);
    const result = await eventsUnsubscribe(ctx, { subscriptionId: 'sub_evt-agent_test_123' });
    expect(result.unsubscribed).toBe(true);
  });

  it('returns unsubscribed: false when subscription did not exist', async () => {
    mockRedis.del.mockResolvedValue(0);
    const result = await eventsUnsubscribe(ctx, { subscriptionId: 'sub_evt-agent_ghost_0' });
    expect(result.unsubscribed).toBe(false);
  });
});

describe('eventsListTopics', () => {
  it('returns private and public topics', async () => {
    mockRedis.keys
      .mockResolvedValueOnce(['events:evt-agent:orders', 'events:evt-agent:prices'])
      .mockResolvedValueOnce(['events:public:broadcast']);
    mockRedis.llen.mockResolvedValue(5);

    const result = await eventsListTopics(ctx, {});
    expect(result.topics).toHaveLength(3);
    const publicTopic = result.topics.find(t => t.isPublic);
    expect(publicTopic?.topic).toBe('broadcast');
  });

  it('excludes :channel suffix keys', async () => {
    mockRedis.keys
      .mockResolvedValueOnce(['events:evt-agent:orders', 'events:evt-agent:orders:channel'])
      .mockResolvedValueOnce([]);

    const result = await eventsListTopics(ctx, {});
    expect(result.topics).toHaveLength(1);
    expect(result.topics[0].topic).toBe('orders');
  });
});
