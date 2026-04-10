// Agent context is threaded through every primitive call.
// It carries everything needed to enforce security and quotas without extra DB lookups.

import type { AgentTier } from './tiers.js';

export type { AgentTier };

export interface AgentQuotas {
  // Maximum total storage in bytes across all files (default: 1GB)
  storageQuotaBytes: number;
  // Maximum Redis memory usage in bytes (default: 100MB)
  memoryQuotaBytes: number;
  // Maximum HTTP requests per minute via net primitive (default: 100)
  rateLimitPerMin: number;
}

export interface AgentContext {
  // Stable identifier — used to namespace all resources
  agentId: string;
  // Domains this agent is allowed to reach via net primitive
  // Empty array = use global ALLOWED_DOMAINS env var
  allowedDomains: string[];
  // Resource quotas for this agent
  quotas: AgentQuotas;
  // Capability tier: free | pro | hyper
  tier: AgentTier;
}

// Default quotas applied when not overridden in agent record
export const DEFAULT_QUOTAS: AgentQuotas = {
  storageQuotaBytes: parseInt(process.env.STORAGE_QUOTA_GB ?? '1', 10) * 1024 * 1024 * 1024,
  memoryQuotaBytes: parseInt(process.env.MEMORY_QUOTA_MB ?? '100', 10) * 1024 * 1024,
  rateLimitPerMin: parseInt(process.env.RATE_LIMIT_PER_MIN ?? '100', 10),
};
