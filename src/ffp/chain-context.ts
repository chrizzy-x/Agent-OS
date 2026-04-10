/**
 * FFP Chain Context Builder
 *
 * Creates a chain-scoped AgentContext so that all 6 primitives (mem, fs, db,
 * net, events, proc) automatically namespace their data to the FFP chain +
 * agent combination — without touching any existing primitive code.
 *
 * Scoped agent ID format: "ffp:{chainId}:{agentId}"
 *
 * Example:
 *   chainId = "finance-chain"
 *   agentId = "agent_abc123"
 *   → scopedAgentId = "ffp:finance-chain:agent_abc123"
 *
 * All Redis keys, DB schemas, and file paths will be prefixed with this ID,
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
  };
}

export function getScopedAgentId(chainId: string, agentId: string): string {
  return `ffp:${chainId}:${agentId}`;
}
