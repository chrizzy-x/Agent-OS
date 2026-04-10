import type { AgentQuotas } from './permissions.js';

export type AgentTier = 'free' | 'pro' | 'hyper';

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const TIER_QUOTAS: Record<AgentTier, AgentQuotas> = {
  free: {
    storageQuotaBytes: 1 * GB,
    memoryQuotaBytes: 100 * MB,
    rateLimitPerMin: 60,
  },
  pro: {
    storageQuotaBytes: 10 * GB,
    memoryQuotaBytes: 1 * GB,
    rateLimitPerMin: 300,
  },
  hyper: {
    storageQuotaBytes: 100 * GB,
    memoryQuotaBytes: 10 * GB,
    rateLimitPerMin: 1000,
  },
};

export const TIER_CAPABILITIES: Record<AgentTier, string[]> = {
  free:  ['mem', 'fs', 'db', 'net', 'events', 'proc'],
  pro:   ['mem', 'fs', 'db', 'net', 'events', 'proc', 'skills', 'mcp'],
  hyper: ['mem', 'fs', 'db', 'net', 'events', 'proc', 'skills', 'mcp', 'ffp', 'kernel'],
};

export function isValidTier(value: unknown): value is AgentTier {
  return value === 'free' || value === 'pro' || value === 'hyper';
}
