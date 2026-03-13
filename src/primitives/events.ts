import { z } from 'zod';
import { getRedisClient, agentKey } from '../storage/redis.js';
import { withAudit } from '../runtime/audit.js';
import { validate, keySchema } from '../utils/validation.js';
import { ValidationError } from '../utils/errors.js';
import { getFFPClient } from '../ffp/client.js';
import type { AgentContext } from '../auth/permissions.js';

const MAX_MESSAGE_SIZE = 1 * 1024 * 1024; // 1MB
const MESSAGE_RETENTION_SECONDS = 60 * 60 * 24; // 24 hours
const MAX_TOPIC_MESSAGES = 1000; // max messages retained per topic

// Build a Redis key for a topic.
// Private topics are scoped to the agent; public topics are shared across agents.
function topicKey(agentId: string, topic: string, isPublic: boolean): string {
  if (isPublic) {
    return `events:public:${topic}`;
  }
  return agentKey('events', agentId, topic);
}

// Publish a message to a topic.
// Messages are stored in a Redis list for retrieval, and published to Redis pub/sub channel.
export async function eventsPublish(
  ctx: AgentContext,
  input: unknown
): Promise<{ topic: string; messageId: string }> {
  const { topic, message, isPublic } = validate(
    z.object({
      topic: keySchema,
      message: z.unknown(),
      isPublic: z.boolean().default(false),
    }),
    input
  );

  const serialized = JSON.stringify(message);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_MESSAGE_SIZE) {
    throw new ValidationError(`Message exceeds maximum size of ${MAX_MESSAGE_SIZE / 1024}KB`);
  }

  return withAudit({ agentId: ctx.agentId, primitive: 'events', operation: 'publish', metadata: { topic, isPublic } }, async () => {
    const redis = getRedisClient();
    const messageId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const envelope = JSON.stringify({
      id: messageId,
      topic,
      agentId: ctx.agentId,
      message,
      timestamp: new Date().toISOString(),
    });

    const listKey = topicKey(ctx.agentId, topic, isPublic);
    const channelKey = `${listKey}:channel`;

    // Push to list (for polling/history) and publish to channel (for real-time)
    await redis.pipeline()
      .lpush(listKey, envelope)
      .ltrim(listKey, 0, MAX_TOPIC_MESSAGES - 1)
      .expire(listKey, MESSAGE_RETENTION_SECONDS)
      .publish(channelKey, envelope)
      .exec();

    void getFFPClient().log({ primitive: 'events', action: 'publish', params: { topic, isPublic }, result: { messageId }, timestamp: Date.now(), agentId: ctx.agentId });
    return { topic, messageId };
  });
}

// Subscribe to a topic — returns subscription metadata and recent messages.
// Because this is a stateless HTTP API, "subscription" means registering interest
// and getting a handle to poll for new messages. Real-time requires SSE or WebSocket.
export async function eventsSubscribe(
  ctx: AgentContext,
  input: unknown
): Promise<{ subscriptionId: string; topic: string; recentMessages: unknown[] }> {
  const { topic, isPublic, limit } = validate(
    z.object({
      topic: keySchema,
      isPublic: z.boolean().default(false),
      limit: z.number().int().min(1).max(100).default(10),
    }),
    input
  );

  return withAudit({ agentId: ctx.agentId, primitive: 'events', operation: 'subscribe', metadata: { topic } }, async () => {
    const redis = getRedisClient();
    const listKey = topicKey(ctx.agentId, topic, isPublic);

    // Store subscription record so agent can poll for new messages
    const subscriptionId = `sub_${ctx.agentId}_${topic}_${Date.now()}`;
    const subKey = agentKey('subscriptions', ctx.agentId, subscriptionId);

    await redis.set(subKey, JSON.stringify({ topic, isPublic, createdAt: Date.now() }), 'EX', MESSAGE_RETENTION_SECONDS);

    // Return recent messages from the topic history
    const rawMessages = await redis.lrange(listKey, 0, limit - 1);
    const recentMessages = rawMessages.map(m => {
      try { return JSON.parse(m); } catch { return m; }
    });

    void getFFPClient().log({ primitive: 'events', action: 'subscribe', params: { topic }, result: { subscriptionId }, timestamp: Date.now(), agentId: ctx.agentId });
    return { subscriptionId, topic, recentMessages };
  });
}

// Unsubscribe from a topic by deleting the subscription record.
export async function eventsUnsubscribe(
  ctx: AgentContext,
  input: unknown
): Promise<{ subscriptionId: string; unsubscribed: boolean }> {
  const { subscriptionId } = validate(
    z.object({ subscriptionId: z.string().min(1).max(256) }),
    input
  );

  return withAudit({ agentId: ctx.agentId, primitive: 'events', operation: 'unsubscribe', metadata: { subscriptionId } }, async () => {
    const redis = getRedisClient();
    const subKey = agentKey('subscriptions', ctx.agentId, subscriptionId);
    const deleted = await redis.del(subKey);
    void getFFPClient().log({ primitive: 'events', action: 'unsubscribe', params: { subscriptionId }, result: { unsubscribed: deleted > 0 }, timestamp: Date.now(), agentId: ctx.agentId });
    return { subscriptionId, unsubscribed: deleted > 0 };
  });
}

// List topics that have recent messages accessible to this agent.
export async function eventsListTopics(
  ctx: AgentContext,
  _input: unknown
): Promise<{ topics: Array<{ topic: string; messageCount: number; isPublic: boolean }> }> {
  return withAudit({ agentId: ctx.agentId, primitive: 'events', operation: 'list_topics' }, async () => {
    const redis = getRedisClient();

    // Get agent's private topics
    const privatePattern = agentKey('events', ctx.agentId, '*');
    const publicPattern = 'events:public:*';

    const [privateKeys, publicKeys] = await Promise.all([
      redis.keys(privatePattern),
      redis.keys(publicPattern),
    ]);

    // Filter out channel keys (those ending in :channel)
    const allKeys = [
      ...privateKeys.filter(k => !k.endsWith(':channel')).map(k => ({ key: k, isPublic: false })),
      ...publicKeys.filter(k => !k.endsWith(':channel')).map(k => ({ key: k, isPublic: true })),
    ];

    const topics = await Promise.all(
      allKeys.map(async ({ key, isPublic }) => {
        const count = await redis.llen(key);
        const prefix = isPublic ? 'events:public:' : agentKey('events', ctx.agentId, '');
        return {
          topic: key.slice(prefix.length),
          messageCount: count,
          isPublic,
        };
      })
    );

    return { topics };
  });
}
