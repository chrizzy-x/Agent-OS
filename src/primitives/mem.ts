import { z } from 'zod';
import { getRedisClient, agentKey } from '../storage/redis.js';
import { adjustMemoryUsage, checkMemoryQuota } from '../runtime/resource-manager.js';
import { withAudit } from '../runtime/audit.js';
import { validate, keySchema, ttlSchema } from '../utils/validation.js';
import { NotFoundError } from '../utils/errors.js';
import { getFFPClient } from '../ffp/client.js';
import type { AgentContext } from '../auth/permissions.js';

const DEFAULT_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

function memKey(agentId: string, key: string): string {
  return agentKey('mem', agentId, key);
}

// Store a value. Value is JSON-serialized. Returns the stored key.
export async function memSet(
  ctx: AgentContext,
  input: unknown
): Promise<{ key: string }> {
  const { key, value, ttl } = validate(
    z.object({ key: keySchema, value: z.unknown(), ttl: ttlSchema }),
    input
  );

  const serialized = JSON.stringify(value);
  const bytes = Buffer.byteLength(serialized, 'utf8');

  return withAudit({ agentId: ctx.agentId, primitive: 'mem', operation: 'set', metadata: { key } }, async () => {
    // Check if key already exists to compute delta correctly
    const redis = getRedisClient();
    const rKey = memKey(ctx.agentId, key);
    const existing = await redis.get(rKey);
    const existingBytes = existing ? Buffer.byteLength(existing, 'utf8') : 0;
    const delta = bytes - existingBytes;

    if (delta > 0) {
      await checkMemoryQuota(ctx, delta);
    }

    const effectiveTtl = ttl ?? DEFAULT_TTL;
    await redis.set(rKey, serialized, 'EX', effectiveTtl);
    await adjustMemoryUsage(ctx.agentId, delta);

    const result = { key };
    void getFFPClient().log({ primitive: 'mem', action: 'set', params: { key, bytes }, result, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

// Retrieve a value by key. Throws NotFoundError if absent.
export async function memGet(
  ctx: AgentContext,
  input: unknown
): Promise<{ key: string; value: unknown }> {
  const { key } = validate(z.object({ key: keySchema }), input);

  return withAudit({ agentId: ctx.agentId, primitive: 'mem', operation: 'get', metadata: { key } }, async () => {
    const redis = getRedisClient();
    const raw = await redis.get(memKey(ctx.agentId, key));

    if (raw === null) {
      throw new NotFoundError(`Key not found: ${key}`);
    }

    const result = { key, value: JSON.parse(raw) };
    void getFFPClient().log({ primitive: 'mem', action: 'get', params: { key }, result: { key }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

// Delete a key. Returns whether the key existed.
export async function memDelete(
  ctx: AgentContext,
  input: unknown
): Promise<{ key: string; deleted: boolean }> {
  const { key } = validate(z.object({ key: keySchema }), input);

  return withAudit({ agentId: ctx.agentId, primitive: 'mem', operation: 'delete', metadata: { key } }, async () => {
    const redis = getRedisClient();
    const rKey = memKey(ctx.agentId, key);

    // Get size before deleting to update quota tracking
    const existing = await redis.get(rKey);
    const existingBytes = existing ? Buffer.byteLength(existing, 'utf8') : 0;

    const deleted = await redis.del(rKey);

    if (deleted > 0 && existingBytes > 0) {
      await adjustMemoryUsage(ctx.agentId, -existingBytes);
    }

    const result = { key, deleted: deleted > 0 };
    void getFFPClient().log({ primitive: 'mem', action: 'delete', params: { key }, result, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

// List keys with an optional prefix filter. Returns up to 1000 keys.
export async function memList(
  ctx: AgentContext,
  input: unknown
): Promise<{ keys: string[] }> {
  const { prefix } = validate(z.object({ prefix: z.string().max(256).optional().default('') }), input);

  return withAudit({ agentId: ctx.agentId, primitive: 'mem', operation: 'list', metadata: { prefix } }, async () => {
    const redis = getRedisClient();
    const pattern = memKey(ctx.agentId, `${prefix}*`);
    const prefixToStrip = memKey(ctx.agentId, '');

    // SCAN is preferred over KEYS in production, but for simplicity KEYS is used here
    // In a high-traffic environment, replace with SCAN iteration
    const rawKeys = await redis.keys(pattern);
    const keys = rawKeys
      .slice(0, 1000)
      .map(k => k.slice(prefixToStrip.length));

    return { keys };
  });
}

// Atomically increment a numeric counter. Creates the key if absent (starting from 0).
export async function memIncr(
  ctx: AgentContext,
  input: unknown
): Promise<{ key: string; value: number }> {
  const { key, amount } = validate(
    z.object({ key: keySchema, amount: z.number().int().default(1) }),
    input
  );

  return withAudit({ agentId: ctx.agentId, primitive: 'mem', operation: 'incr', metadata: { key } }, async () => {
    const redis = getRedisClient();
    const rKey = memKey(ctx.agentId, key);
    const newValue = await redis.incrby(rKey, amount);
    const result = { key, value: newValue };
    void getFFPClient().log({ primitive: 'mem', action: 'incr', params: { key, amount }, result, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

// Set or update the TTL on an existing key.
export async function memExpire(
  ctx: AgentContext,
  input: unknown
): Promise<{ key: string; set: boolean }> {
  const { key, seconds } = validate(
    z.object({ key: keySchema, seconds: z.number().int().min(1).max(60 * 60 * 24 * 30) }),
    input
  );

  return withAudit({ agentId: ctx.agentId, primitive: 'mem', operation: 'expire', metadata: { key, seconds } }, async () => {
    const redis = getRedisClient();
    const expResult = await redis.expire(memKey(ctx.agentId, key), seconds);
    const result = { key, set: expResult === 1 };
    void getFFPClient().log({ primitive: 'mem', action: 'expire', params: { key, seconds }, result, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}
