import { getRedisClient } from '../storage/redis.js';

const LOCAL_TOKENS = new Map<string, { value: string; expiresAt: number }>();

function pruneTokens() {
  const now = Date.now();
  for (const [key, entry] of LOCAL_TOKENS.entries()) {
    if (entry.expiresAt < now) LOCAL_TOKENS.delete(key);
  }
}

export async function tokenSet(key: string, ttlSeconds: number, value: string): Promise<void> {
  try {
    await getRedisClient().setex(key, ttlSeconds, value);
    return;
  } catch {
    // Fall through to local state.
  }
  pruneTokens();
  LOCAL_TOKENS.set(key, {
    value,
    expiresAt: Date.now() + (ttlSeconds * 1000),
  });
}

export async function tokenGet(key: string): Promise<string | null> {
  try {
    const value = await getRedisClient().get(key);
    if (value !== null) return value;
  } catch {
    // Fall through to local state.
  }
  const entry = LOCAL_TOKENS.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    LOCAL_TOKENS.delete(key);
    return null;
  }
  return entry.value;
}

export async function tokenDel(key: string): Promise<void> {
  try {
    await getRedisClient().del(key);
  } catch {
    // Ignore redis failures.
  }
  LOCAL_TOKENS.delete(key);
}

export const TOKEN_TTL_SECONDS = 1800;
