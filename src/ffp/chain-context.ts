/**
 * FFP Chain Context Builder
 *
 * Creates a chain-scoped AgentContext so that all 6 primitives (mem, fs, db,
 * net, events, proc) automatically namespace their data to the FFP chain +
 * agent combination — without touching any existing primitive code.
 *
 * Scoped private reference format: "ffp:{chainId}:{privateRef}"
 *
 * Example:
 *   chainId = "finance-chain"
 *   privateRef = "<private>"
 *   → scopedAgentRef = "ffp:finance-chain:<private>"
 *
 * All Redis keys, DB schemas, and file paths will be prefixed with this private reference,
 * isolating chain data from regular agent data automatically.
 */

import type { AgentContext } from '../auth/permissions.js';
import { DEFAULT_QUOTAS } from '../auth/permissions.js';

export function buildChainScopedContext(chainId: string, agentId: string): AgentContext {
  const scopedAgentId = `ffp:${chainId}:${agentId}`;
  return {
    agentId: scopedAgentId,
    allowedDomains: [], // falls back to global ALLOWED_DOMAINS env var
    quotas: { ...DEFAULT_QUOTAS },
    tier: 'enterprise_max', // FFP chain executions require the full enterprise runtime surface
  };
}

export function getScopedAgentId(chainId: string, agentId: string): string {
  return `ffp:${chainId}:${agentId}`;
}
