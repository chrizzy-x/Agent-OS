import { z } from 'zod';
import { getRedisClient, agentKey } from '../storage/redis.js';
import { adjustMemoryUsage, checkMemoryQuota } from '../runtime/resource-manager.js';
import { withAudit } from '../runtime/audit.js';
import { validate, keySchema, ttlSchema } from '../utils/validation.js';
import { NotFoundError, QuotaError } from '../utils/errors.js';
import { getFFPClient } from '../ffp/client.js';
import { readLocalRuntimeState, updateLocalRuntimeState } from '../storage/local-state.js';
import type { AgentContext } from '../auth/permissions.js';

const DEFAULT_TTL = 60 * 60 * 24 * 7;

function memKey(agentId: string, key: string): string {
  return agentKey('mem', agentId, key);
}

function isExpired(expiresAt: number | null): boolean {
  return typeof expiresAt === 'number' && expiresAt <= Date.now();
}

function getLocalMemoryUsage(state: Awaited<ReturnType<typeof readLocalRuntimeState>>, agentId: string): number {
  const records = Object.entries(state.mem[agentId] ?? {});
  return records.reduce((total, [, record]) => {
    if (isExpired(record.expiresAt)) {
      return total;
    }
    return total + Buffer.byteLength(record.value, 'utf8');
  }, 0);
}

async function withMemFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await primary();
  } catch {
    return fallback();
  }
}

export async function memSet(ctx: AgentContext, input: unknown): Promise<{ key: string }> {
  const { key, value, ttl } = validate(
    z.object({ key: keySchema, value: z.unknown(), ttl: ttlSchema }),
    input,
  );

  const serialized = JSON.stringify(value);
  const bytes = Buffer.byteLength(serialized, 'utf8');

  return withAudit({ agentId: ctx.agentId, primitive: 'mem', operation: 'set', metadata: { key } }, async () => {
    const result = await withMemFallback(async () => {
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
      return { key };
    }, async () => {
      return updateLocalRuntimeState(state => {
        state.mem[ctx.agentId] ??= {};
        const existing = state.mem[ctx.agentId][key];
        const existingBytes = existing && !isExpired(existing.expiresAt)
          ? Buffer.byteLength(existing.value, 'utf8')
          : 0;
        const currentUsage = getLocalMemoryUsage(state, ctx.agentId);
        const delta = bytes - existingBytes;

        if (currentUsage + delta > ctx.quotas.memoryQuotaBytes) {
          throw new QuotaError('Memory quota exceeded');
        }

        state.mem[ctx.agentId][key] = {
          value: serialized,
          expiresAt: Date.now() + ((ttl ?? DEFAULT_TTL) * 1000),
        };
        return { key };
      });
    });

    void getFFPClient().log({ primitive: 'mem', action: 'set', params: { key, bytes }, result, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function memGet(ctx: AgentContext, input: unknown): Promise<{ key: string; value: unknown }> {
  const { key } = validate(z.object({ key: keySchema }), input);

  return withAudit({ agentId: ctx.agentId, primitive: 'mem', operation: 'get', metadata: { key } }, async () => {
    const result = await withMemFallback(async () => {
      const redis = getRedisClient();
      const raw = await redis.get(memKey(ctx.agentId, key));
      if (raw === null) {
        throw new NotFoundError(`Key not found: ${key}`);
      }
      return { key, value: JSON.parse(raw) as unknown };
    }, async () => {
      const state = await readLocalRuntimeState();
      const record = state.mem[ctx.agentId]?.[key];
      if (!record || isExpired(record.expiresAt)) {
        if (record && isExpired(record.expiresAt)) {
          await updateLocalRuntimeState(nextState => {
            delete nextState.mem[ctx.agentId]?.[key];
          });
        }
        throw new NotFoundError(`Key not found: ${key}`);
      }

      return { key, value: JSON.parse(record.value) as unknown };
    });

    void getFFPClient().log({ primitive: 'mem', action: 'get', params: { key }, result: { key }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function memDelete(ctx: AgentContext, input: unknown): Promise<{ key: string; deleted: boolean }> {
  const { key } = validate(z.object({ key: keySchema }), input);

  return withAudit({ agentId: ctx.agentId, primitive: 'mem', operation: 'delete', metadata: { key } }, async () => {
    const result = await withMemFallback(async () => {
      const redis = getRedisClient();
      const rKey = memKey(ctx.agentId, key);
      const existing = await redis.get(rKey);
      const existingBytes = existing ? Buffer.byteLength(existing, 'utf8') : 0;
      const deleted = await redis.del(rKey);

      if (deleted > 0 && existingBytes > 0) {
        await adjustMemoryUsage(ctx.agentId, -existingBytes);
      }

      return { key, deleted: deleted > 0 };
    }, async () => {
      return updateLocalRuntimeState(state => {
        const record = state.mem[ctx.agentId]?.[key];
        if (!record) {
          return { key, deleted: false };
        }

        delete state.mem[ctx.agentId][key];
        return { key, deleted: true };
      });
    });

    void getFFPClient().log({ primitive: 'mem', action: 'delete', params: { key }, result, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function memList(ctx: AgentContext, input: unknown): Promise<{ keys: string[] }> {
  const { prefix } = validate(z.object({ prefix: z.string().max(256).optional().default('') }), input);

  return withAudit({ agentId: ctx.agentId, primitive: 'mem', operation: 'list', metadata: { prefix } }, async () => {
    return withMemFallback(async () => {
      const redis = getRedisClient();
      const pattern = memKey(ctx.agentId, `${prefix}*`);
      const prefixToStrip = memKey(ctx.agentId, '');
      const rawKeys = await redis.keys(pattern);
      return {
        keys: rawKeys.slice(0, 1000).map(item => item.slice(prefixToStrip.length)),
      };
    }, async () => {
      return updateLocalRuntimeState(state => {
        state.mem[ctx.agentId] ??= {};
        const keys = Object.entries(state.mem[ctx.agentId])
          .filter(([, record]) => !isExpired(record.expiresAt))
          .map(([name]) => name)
          .filter(name => name.startsWith(prefix))
          .slice(0, 1000);

        for (const [name, record] of Object.entries(state.mem[ctx.agentId])) {
          if (isExpired(record.expiresAt)) {
            delete state.mem[ctx.agentId][name];
          }
        }

        return { keys };
      });
    });
  });
}

export async function memIncr(ctx: AgentContext, input: unknown): Promise<{ key: string; value: number }> {
  const { key, amount } = validate(
    z.object({ key: keySchema, amount: z.number().int().default(1) }),
    input,
  );

  return withAudit({ agentId: ctx.agentId, primitive: 'mem', operation: 'incr', metadata: { key } }, async () => {
    const result = await withMemFallback(async () => {
      const redis = getRedisClient();
      const value = await redis.incrby(memKey(ctx.agentId, key), amount);
      return { key, value };
    }, async () => {
      return updateLocalRuntimeState(state => {
        state.mem[ctx.agentId] ??= {};
        const record = state.mem[ctx.agentId][key];
        const current = record && !isExpired(record.expiresAt)
          ? Number.parseInt(JSON.parse(record.value) as string, 10)
          : 0;
        const value = current + amount;
        state.mem[ctx.agentId][key] = {
          value: JSON.stringify(value),
          expiresAt: record?.expiresAt ?? null,
        };
        return { key, value };
      });
    });

    void getFFPClient().log({ primitive: 'mem', action: 'incr', params: { key, amount }, result, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function memExpire(ctx: AgentContext, input: unknown): Promise<{ key: string; set: boolean }> {
  const { key, seconds } = validate(
    z.object({ key: keySchema, seconds: z.number().int().min(1).max(60 * 60 * 24 * 30) }),
    input,
  );

  return withAudit({ agentId: ctx.agentId, primitive: 'mem', operation: 'expire', metadata: { key, seconds } }, async () => {
    const result = await withMemFallback(async () => {
      const redis = getRedisClient();
      const expResult = await redis.expire(memKey(ctx.agentId, key), seconds);
      return { key, set: expResult === 1 };
    }, async () => {
      return updateLocalRuntimeState(state => {
        const record = state.mem[ctx.agentId]?.[key];
        if (!record || isExpired(record.expiresAt)) {
          return { key, set: false };
        }

        record.expiresAt = Date.now() + (seconds * 1000);
        return { key, set: true };
      });
    });

    void getFFPClient().log({ primitive: 'mem', action: 'expire', params: { key, seconds }, result, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}
