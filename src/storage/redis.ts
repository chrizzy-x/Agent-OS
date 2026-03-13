import Redis from 'ioredis';

let client: Redis | null = null;

// Returns a shared Redis client, creating it on first call.
// Uses lazy initialization so tests can control when the connection is made.
export function getRedisClient(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('REDIS_URL environment variable is required');
    }
    client = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    client.on('error', (err) => {
      console.error('[redis] connection error:', err.message);
    });
  }
  return client;
}

// Build a namespaced Redis key for a given agent and sub-key.
// Format: {prefix}:{agentId}:{key}
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
