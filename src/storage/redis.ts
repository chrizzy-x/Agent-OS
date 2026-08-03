import Redis from 'ioredis';

let client: Redis | null = null;
const DEFAULT_REDIS_CONNECT_TIMEOUT_MS = 1_000;

function redisConnectTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.AGENTOS_REDIS_CONNECT_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REDIS_CONNECT_TIMEOUT_MS;
}

// Returns a shared Redis client, creating it on first call.
// Uses lazy initialization so tests can control when the connection is made.
export function getRedisClient(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('REDIS_URL environment variable is required');
    }
    client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: false,
      connectTimeout: redisConnectTimeoutMs(),
      retryStrategy(times) {
        return times <= 1 ? Math.min(times * 250, 1_000) : null;
      },
    });

    client.on('error', (err) => {
      console.error('[redis] connection error:', err.message);
    });
  }
  return client;
}

// Build a namespaced Redis key for a given agent and sub-key.
// Format: {prefix}:{privateAgentRef}:{key}
export function agentKey(prefix: string, agentId: string, key: string): string {
  return `${prefix}:${agentId}:${key}`;
}

// Allow replacing the client in tests without touching the module-level variable directly
export function setRedisClient(c: Redis): void {
  client = c;
}

// Cleanly disconnect — call during graceful shutdown
export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
