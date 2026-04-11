import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getRedisClient, agentKey } from '../storage/redis.js';
import { withAudit } from '../runtime/audit.js';
import { validate, keySchema } from '../utils/validation.js';
import { ValidationError } from '../utils/errors.js';
import { getFFPClient } from '../ffp/client.js';
import { readLocalRuntimeState, updateLocalRuntimeState } from '../storage/local-state.js';
import type { AgentContext } from '../auth/permissions.js';

const MAX_MESSAGE_SIZE = 1 * 1024 * 1024;
const MESSAGE_RETENTION_SECONDS = 60 * 60 * 24;
const MAX_TOPIC_MESSAGES = 1000;

function topicKey(agentId: string, topic: string, isPublic: boolean): string {
  if (isPublic) {
    return `events:public:${topic}`;
  }
  return agentKey('events', agentId, topic);
}

async function getEventsRedisClient() {
  const redis = getRedisClient();
  await redis.ping();
  return redis;
}

async function withEventsFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await primary();
  } catch {
    return fallback();
  }
}

export async function eventsPublish(ctx: AgentContext, input: unknown): Promise<{ topic: string; messageId: string }> {
  const { topic, message, isPublic } = validate(
    z.object({
      topic: keySchema,
      message: z.unknown(),
      isPublic: z.boolean().default(false),
    }),
    input,
  );

  const serialized = JSON.stringify(message);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_MESSAGE_SIZE) {
    throw new ValidationError(`Message exceeds maximum size of ${MAX_MESSAGE_SIZE / 1024}KB`);
  }

  return withAudit({ agentId: ctx.agentId, primitive: 'events', operation: 'publish', metadata: { topic, isPublic } }, async () => {
    const result = await withEventsFallback(async () => {
      const redis = await getEventsRedisClient();
      const messageId = `${Date.now()}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const envelope = JSON.stringify({
        id: messageId,
        topic,
        agentId: ctx.agentId,
        message,
        timestamp: new Date().toISOString(),
      });
      const listKey = topicKey(ctx.agentId, topic, isPublic ?? false);
      const channelKey = `${listKey}:channel`;
      await redis.pipeline().lpush(listKey, envelope).ltrim(listKey, 0, MAX_TOPIC_MESSAGES - 1).expire(listKey, MESSAGE_RETENTION_SECONDS).publish(channelKey, envelope).exec();
      return { topic, messageId };
    }, async () => {
      const messageId = `${Date.now()}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      await updateLocalRuntimeState(state => {
        const envelope = {
          id: messageId,
          topic,
          agentId: ctx.agentId,
          message,
          timestamp: new Date().toISOString(),
          isPublic: isPublic ?? false,
        };

        if (isPublic) {
          state.publicEvents[topic] ??= [];
          state.publicEvents[topic].unshift(envelope);
          state.publicEvents[topic] = state.publicEvents[topic].slice(0, MAX_TOPIC_MESSAGES);
        } else {
          state.privateEvents[ctx.agentId] ??= {};
          state.privateEvents[ctx.agentId][topic] ??= [];
          state.privateEvents[ctx.agentId][topic].unshift(envelope);
          state.privateEvents[ctx.agentId][topic] = state.privateEvents[ctx.agentId][topic].slice(0, MAX_TOPIC_MESSAGES);
        }
      });
      return { topic, messageId };
    });

    void getFFPClient().log({ primitive: 'events', action: 'publish', params: { topic, isPublic }, result: { messageId: result.messageId }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function eventsSubscribe(
  ctx: AgentContext,
  input: unknown,
): Promise<{ subscriptionId: string; topic: string; recentMessages: unknown[] }> {
  const { topic, isPublic, limit } = validate(
    z.object({
      topic: keySchema,
      isPublic: z.boolean().default(false),
      limit: z.number().int().min(1).max(100).default(10),
    }),
    input,
  );

  return withAudit({ agentId: ctx.agentId, primitive: 'events', operation: 'subscribe', metadata: { topic } }, async () => {
    const result = await withEventsFallback(async () => {
      const redis = await getEventsRedisClient();
      const listKey = topicKey(ctx.agentId, topic, isPublic ?? false);
      const subscriptionId = `sub_${ctx.agentId}_${topic}_${Date.now()}_${randomUUID()}`;
      const subKey = agentKey('subscriptions', ctx.agentId, subscriptionId);
      await redis.set(subKey, JSON.stringify({ topic, isPublic, createdAt: Date.now() }), 'EX', MESSAGE_RETENTION_SECONDS);
      const rawMessages = await redis.lrange(listKey, 0, (limit ?? 10) - 1);
      const recentMessages = rawMessages.map(item => {
        try {
          return JSON.parse(item) as unknown;
        } catch {
          return item;
        }
      });
      return { subscriptionId, topic, recentMessages };
    }, async () => {
      const subscriptionId = `sub_${ctx.agentId}_${topic}_${Date.now()}_${randomUUID()}`;
      const state = await readLocalRuntimeState();
      const recentMessages = isPublic
        ? (state.publicEvents[topic] ?? []).slice(0, limit)
        : (state.privateEvents[ctx.agentId]?.[topic] ?? []).slice(0, limit);

      await updateLocalRuntimeState(nextState => {
        nextState.subscriptions[ctx.agentId] ??= {};
        nextState.subscriptions[ctx.agentId][subscriptionId] = {
          subscriptionId,
          topic,
          isPublic: isPublic ?? false,
          createdAt: new Date().toISOString(),
        };
      });

      return { subscriptionId, topic, recentMessages };
    });

    void getFFPClient().log({ primitive: 'events', action: 'subscribe', params: { topic }, result: { subscriptionId: result.subscriptionId }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function eventsUnsubscribe(
  ctx: AgentContext,
  input: unknown,
): Promise<{ subscriptionId: string; unsubscribed: boolean }> {
  const { subscriptionId, topic } = validate(
    z.object({
      subscriptionId: z.string().min(1).max(256).optional(),
      topic: keySchema.optional(),
    }).refine(value => Boolean(value.subscriptionId || value.topic), 'subscriptionId or topic is required'),
    input,
  );

  return withAudit({ agentId: ctx.agentId, primitive: 'events', operation: 'unsubscribe', metadata: { subscriptionId, topic } }, async () => {
    const result = await withEventsFallback(async () => {
      if (subscriptionId) {
        const redis = await getEventsRedisClient();
        const subKey = agentKey('subscriptions', ctx.agentId, subscriptionId);
        const deleted = await redis.del(subKey);
        return { subscriptionId, unsubscribed: deleted > 0 };
      }

      return { subscriptionId: topic ?? '', unsubscribed: true };
    }, async () => {
      return updateLocalRuntimeState(state => {
        state.subscriptions[ctx.agentId] ??= {};
        if (subscriptionId) {
          const existed = Boolean(state.subscriptions[ctx.agentId][subscriptionId]);
          delete state.subscriptions[ctx.agentId][subscriptionId];
          return { subscriptionId, unsubscribed: existed };
        }

        let removed = false;
        for (const [id, subscription] of Object.entries(state.subscriptions[ctx.agentId])) {
          if (subscription.topic === topic) {
            delete state.subscriptions[ctx.agentId][id];
            removed = true;
          }
        }

        return { subscriptionId: topic ?? '', unsubscribed: removed };
      });
    });

    void getFFPClient().log({ primitive: 'events', action: 'unsubscribe', params: { subscriptionId: result.subscriptionId }, result: { unsubscribed: result.unsubscribed }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function eventsListTopics(
  ctx: AgentContext,
  _input: unknown,
): Promise<{ topics: Array<{ topic: string; messageCount: number; isPublic: boolean }> }> {
  return withAudit({ agentId: ctx.agentId, primitive: 'events', operation: 'list_topics' }, async () => {
    return withEventsFallback(async () => {
      const redis = await getEventsRedisClient();
      const privatePattern = agentKey('events', ctx.agentId, '*');
      const publicPattern = 'events:public:*';
      const [privateKeys, publicKeys] = await Promise.all([
        redis.keys(privatePattern),
        redis.keys(publicPattern),
      ]);

      const allKeys = [
        ...privateKeys.filter(key => !key.endsWith(':channel')).map(key => ({ key, isPublic: false })),
        ...publicKeys.filter(key => !key.endsWith(':channel')).map(key => ({ key, isPublic: true })),
      ];

      const topics = await Promise.all(allKeys.map(async item => {
        const count = await redis.llen(item.key);
        const prefix = item.isPublic ? 'events:public:' : agentKey('events', ctx.agentId, '');
        return {
          topic: item.key.slice(prefix.length),
          messageCount: count,
          isPublic: item.isPublic,
        };
      }));

      if (topics.length > 0) {
        return { topics };
      }

      const state = await readLocalRuntimeState();
      const privateTopics = Object.entries(state.privateEvents[ctx.agentId] ?? {}).map(([topic, events]) => ({
        topic,
        messageCount: events.length,
        isPublic: false,
      }));
      const publicTopics = Object.entries(state.publicEvents).map(([topic, events]) => ({
        topic,
        messageCount: events.length,
        isPublic: true,
      }));
      return { topics: [...privateTopics, ...publicTopics] };
    }, async () => {
      const state = await readLocalRuntimeState();
      const privateTopics = Object.entries(state.privateEvents[ctx.agentId] ?? {}).map(([topic, events]) => ({
        topic,
        messageCount: events.length,
        isPublic: false,
      }));
      const publicTopics = Object.entries(state.publicEvents).map(([topic, events]) => ({
        topic,
        messageCount: events.length,
        isPublic: true,
      }));
      return { topics: [...privateTopics, ...publicTopics] };
    });
  });
}
