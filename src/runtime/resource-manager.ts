import { getRedisClient, agentKey } from '../storage/redis.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { QuotaError, RateLimitError, PermissionError } from '../utils/errors.js';
import type { AgentContext } from '../auth/permissions.js';
import { TIER_CAPABILITIES } from '../auth/tiers.js';

type LocalRateLimitBucket = {
  count: number;
  expiresAt: number;
};

const localRateLimitBuckets = new Map<string, LocalRateLimitBucket>();

function pruneLocalRateLimitBuckets(now: number): void {
  for (const [key, bucket] of localRateLimitBuckets.entries()) {
    if (bucket.expiresAt <= now) {
      localRateLimitBuckets.delete(key);
    }
  }
}

function checkLocalRateLimit(ctx: AgentContext, limit: number): void {
  const now = Date.now();
  pruneLocalRateLimitBuckets(now);

  const bucketKey = agentKey('rate', ctx.agentId, currentMinuteBucket());
  const existing = localRateLimitBuckets.get(bucketKey);
  const count = existing && existing.expiresAt > now ? existing.count + 1 : 1;

  localRateLimitBuckets.set(bucketKey, {
    count,
    expiresAt: now + (2 * 60 * 1000),
  });

  if (count > limit) {
    throw new RateLimitError(
      `Rate limit exceeded: ${count}/${limit} requests this minute. Try again in the next minute.`,
    );
  }
}

// Rate limit using a sliding window counter in Redis.
// Allows up to `limit` requests per minute, using 1-minute buckets.
export async function checkRateLimit(ctx: AgentContext): Promise<void> {
  const bucketKey = agentKey('rate', ctx.agentId, currentMinuteBucket());
  const limit = ctx.quotas.rateLimitPerMin;

  try {
    const redis = getRedisClient();

    // Atomic increment + expire
    const count = await redis.incr(bucketKey);
    if (count === 1) {
      // First request in this bucket - set TTL of 2 minutes (bucket + buffer)
      await redis.expire(bucketKey, 120);
    }

    if (count > limit) {
      throw new RateLimitError(
        `Rate limit exceeded: ${count}/${limit} requests this minute. Try again in the next minute.`,
      );
    }
  } catch {
    checkLocalRateLimit(ctx, limit);
  }
}

// Check whether adding `additionalBytes` would exceed the agent's storage quota.
export async function checkStorageQuota(ctx: AgentContext, additionalBytes: number): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('agent_files')
    .select('size_bytes')
    .eq('agent_id', ctx.agentId);

  if (error) {
    // If we can't check quota, fail open (don't block agent) but log
    console.warn('[resource-manager] could not check storage quota:', error.message);
    return;
  }

  const usedBytes = (data ?? []).reduce((sum, row) => sum + (row.size_bytes ?? 0), 0);
  const totalAfter = usedBytes + additionalBytes;

  if (totalAfter > ctx.quotas.storageQuotaBytes) {
    const usedMB = (usedBytes / 1024 / 1024).toFixed(1);
    const limitMB = (ctx.quotas.storageQuotaBytes / 1024 / 1024).toFixed(1);
    throw new QuotaError(
      `Storage quota exceeded: using ${usedMB}MB, limit is ${limitMB}MB`,
    );
  }
}

// Check whether the total size of values stored in Redis for this agent exceeds memory quota.
// Uses a Redis key that tracks cumulative memory usage.
export async function checkMemoryQuota(ctx: AgentContext, additionalBytes: number): Promise<void> {
  const redis = getRedisClient();
  const usageKey = agentKey('mem_usage', ctx.agentId, 'total');

  const currentStr = await redis.get(usageKey);
  const currentBytes = currentStr ? parseInt(currentStr, 10) : 0;
  const totalAfter = currentBytes + additionalBytes;

  if (totalAfter > ctx.quotas.memoryQuotaBytes) {
    const usedMB = (currentBytes / 1024 / 1024).toFixed(1);
    const limitMB = (ctx.quotas.memoryQuotaBytes / 1024 / 1024).toFixed(1);
    throw new QuotaError(
      `Memory quota exceeded: using ${usedMB}MB, limit is ${limitMB}MB`,
    );
  }
}

// Increment the memory usage counter for an agent by `delta` bytes.
// Pass negative delta when values are deleted.
export async function adjustMemoryUsage(agentId: string, delta: number): Promise<void> {
  const redis = getRedisClient();
  const usageKey = agentKey('mem_usage', agentId, 'total');

  if (delta > 0) {
    await redis.incrby(usageKey, delta);
  } else if (delta < 0) {
    await redis.decrby(usageKey, Math.abs(delta));
  }
}

// Check whether this agent's tier grants access to a given capability/primitive.
// Throws PermissionError if the primitive is not in the tier's capability list.
export function checkCapability(ctx: AgentContext, primitive: string): void {
  const allowed = TIER_CAPABILITIES[ctx.tier] ?? TIER_CAPABILITIES.free;
  if (!allowed.includes(primitive)) {
    throw new PermissionError(
      `Your ${ctx.tier} plan does not include access to "${primitive}". Upgrade to unlock this capability.`,
    );
  }
}

// Returns the current minute as a bucket string for rate limiting (e.g. "2024-01-15T10:35")
function currentMinuteBucket(): string {
  const now = new Date();
  return now.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
}