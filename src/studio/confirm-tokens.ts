import crypto from 'crypto';
import { getRedisClient } from '../storage/redis.js';
import { getSupabaseAdmin } from '../storage/supabase.js';

const LOCAL_TOKENS = new Map<string, { value: string; expiresAt: number }>();
const DURABLE_TOKEN_TABLE = 'studio_confirm_tokens';
const DEFAULT_REDIS_TOKEN_TIMEOUT_MS = 800;
const DEFAULT_REDIS_TOKEN_COOLDOWN_MS = 30_000;

let redisUnavailableUntil = 0;

function pruneTokens() {
  const now = Date.now();
  for (const [key, entry] of LOCAL_TOKENS.entries()) {
    if (entry.expiresAt < now) LOCAL_TOKENS.delete(key);
  }
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

function tokenKeyHash(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function boundedNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function redisTokenTimeoutMs(): number {
  return boundedNumber(process.env.AGENTOS_REDIS_TOKEN_TIMEOUT_MS, DEFAULT_REDIS_TOKEN_TIMEOUT_MS);
}

function redisTokenCooldownMs(): number {
  return boundedNumber(process.env.AGENTOS_REDIS_TOKEN_COOLDOWN_MS, DEFAULT_REDIS_TOKEN_COOLDOWN_MS);
}

async function withRedisTokenTimeout<T>(operation: () => Promise<T>): Promise<T> {
  if (Date.now() < redisUnavailableUntil) {
    throw new Error('Redis confirmation token storage is in cooldown');
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        redisUnavailableUntil = Date.now() + redisTokenCooldownMs();
        reject(new Error('Redis confirmation token operation timed out'));
      }, redisTokenTimeoutMs());

      operation().then(resolve, reject);
    });
  } catch (error) {
    redisUnavailableUntil = Date.now() + redisTokenCooldownMs();
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function setDurableToken(key: string, ttlSeconds: number, value: string): Promise<void> {
  const expiresAt = new Date(Date.now() + (ttlSeconds * 1000)).toISOString();
  const { error } = await getSupabaseAdmin()
    .from(DURABLE_TOKEN_TABLE)
    .upsert({
      key_hash: tokenKeyHash(key),
      value,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key_hash' });

  if (error) {
    throw new Error(`Durable confirmation token write failed: ${error.message ?? 'unknown error'}`);
  }
}

async function getDurableToken(key: string): Promise<string | null> {
  const keyHash = tokenKeyHash(key);
  const { data, error } = await getSupabaseAdmin()
    .from(DURABLE_TOKEN_TABLE)
    .select('value, expires_at')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (error) {
    throw new Error(`Durable confirmation token read failed: ${error.message ?? 'unknown error'}`);
  }

  if (!data) return null;

  const row = data as { value?: unknown; expires_at?: unknown };
  const value = typeof row.value === 'string' ? row.value : null;
  const expiresAt = typeof row.expires_at === 'string' ? Date.parse(row.expires_at) : Number.NaN;

  if (!value || !Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    await deleteDurableToken(key);
    return null;
  }

  return value;
}

async function deleteDurableToken(key: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(DURABLE_TOKEN_TABLE)
    .delete()
    .eq('key_hash', tokenKeyHash(key));

  if (error) {
    throw new Error(`Durable confirmation token delete failed: ${error.message ?? 'unknown error'}`);
  }
}

export async function tokenSet(key: string, ttlSeconds: number, value: string): Promise<void> {
  if (isProductionRuntime()) {
    try {
      await setDurableToken(key, ttlSeconds, value);
    } catch (durableError) {
      try {
        await withRedisTokenTimeout(() => getRedisClient().setex(key, ttlSeconds, value));
        return;
      } catch {
        throw durableError;
      }
    }
    withRedisTokenTimeout(() => getRedisClient().setex(key, ttlSeconds, value)).catch(() => undefined);
    return;
  }

  try {
    await withRedisTokenTimeout(() => getRedisClient().setex(key, ttlSeconds, value));
    return;
  } catch {
    // Fall through to local development state.
  }

  pruneTokens();
  LOCAL_TOKENS.set(key, {
    value,
    expiresAt: Date.now() + (ttlSeconds * 1000),
  });
}

export async function tokenGet(key: string): Promise<string | null> {
  if (isProductionRuntime()) {
    try {
      const durableValue = await getDurableToken(key);
      if (durableValue !== null) return durableValue;
    } catch {
      // Fall through to Redis for one-release migration tolerance.
    }
  }

  try {
    const value = await withRedisTokenTimeout(() => getRedisClient().get(key));
    if (value !== null) return value;
  } catch {
    // Fall through to local development state.
  }

  const entry = LOCAL_TOKENS.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    LOCAL_TOKENS.delete(key);
    return null;
  }
  return entry.value;
}

export async function tokenDel(key: string): Promise<void> {
  if (isProductionRuntime()) {
    try {
      await deleteDurableToken(key);
    } catch {
      // Redis may still contain legacy confirmation tokens.
    }
    withRedisTokenTimeout(() => getRedisClient().del(key)).catch(() => undefined);
    LOCAL_TOKENS.delete(key);
    return;
  }

  try {
    await withRedisTokenTimeout(() => getRedisClient().del(key));
  } catch {
    // Ignore redis failures.
  }
  LOCAL_TOKENS.delete(key);
}

export const TOKEN_TTL_SECONDS = 1800;
