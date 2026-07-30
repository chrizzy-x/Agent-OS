import crypto from 'crypto';
import { getRedisClient } from '../storage/redis.js';
import { getSupabaseAdmin } from '../storage/supabase.js';

const LOCAL_TOKENS = new Map<string, { value: string; expiresAt: number }>();
const DURABLE_TOKEN_TABLE = 'studio_confirm_tokens';

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
  try {
    await getRedisClient().setex(key, ttlSeconds, value);
    if (isProductionRuntime()) {
      try {
        await setDurableToken(key, ttlSeconds, value);
      } catch {
        // Redis remains the durable store when it accepts the write.
      }
    }
    return;
  } catch {
    // Fall through to production durable storage or local development state.
  }

  if (isProductionRuntime()) {
    await setDurableToken(key, ttlSeconds, value);
    return;
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
    // Fall through to production durable storage or local development state.
  }

  if (isProductionRuntime()) {
    return getDurableToken(key);
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
  if (isProductionRuntime()) {
    await deleteDurableToken(key);
  }
  LOCAL_TOKENS.delete(key);
}

export const TOKEN_TTL_SECONDS = 1800;
