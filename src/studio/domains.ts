import type { AgentContext } from '../auth/permissions.js';

export const STUDIO_DEFAULT_ALLOWED_DOMAINS = [
  'api.coingecko.com',
  'api.open-meteo.com',
];

export function withStudioDefaultAllowedDomains(agentContext: AgentContext): AgentContext {
  return {
    ...agentContext,
    allowedDomains: Array.from(new Set([
      ...agentContext.allowedDomains.map(domain => domain.toLowerCase()),
      ...STUDIO_DEFAULT_ALLOWED_DOMAINS,
    ])),
  };
}
