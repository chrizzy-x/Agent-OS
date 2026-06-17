import type { AgentQuotas } from './permissions.js';

export type AccountType = 'retail' | 'enterprise';
export type AgentPlan = 'retail_free' | 'retail_pro' | 'enterprise_plus' | 'enterprise_max';
export type AgentTier = AgentPlan;
export type PersistedAgentTier = AgentPlan | 'free' | 'pro' | 'enterprise' | 'hyper';

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const RETAIL_PLANS = ['retail_free', 'retail_pro'] as const satisfies readonly AgentPlan[];
export const ENTERPRISE_PLANS = ['enterprise_plus', 'enterprise_max'] as const satisfies readonly AgentPlan[];
export const PLAN_ORDER = ['retail_free', 'retail_pro', 'enterprise_plus', 'enterprise_max'] as const satisfies readonly AgentPlan[];

export const PLAN_LABELS: Record<AgentPlan, string> = {
  retail_free: 'Free',
  retail_pro: 'Pro',
  enterprise_plus: 'Enterprise',
  enterprise_max: 'Enterprise Max',
};

export const PLAN_PRICES_USD: Record<AgentPlan, number> = {
  retail_free: 0,
  retail_pro: 0,
  enterprise_plus: 0,
  enterprise_max: 0,
};

export const PLAN_ACCOUNT_TYPE: Record<AgentPlan, AccountType> = {
  retail_free: 'retail',
  retail_pro: 'retail',
  enterprise_plus: 'enterprise',
  enterprise_max: 'enterprise',
};

export const TIER_QUOTAS: Record<AgentTier, AgentQuotas> = {
  retail_free: {
    storageQuotaBytes: 1 * GB,
    memoryQuotaBytes: 100 * MB,
    rateLimitPerMin: 60,
  },
  retail_pro: {
    storageQuotaBytes: 10 * GB,
    memoryQuotaBytes: 1 * GB,
    rateLimitPerMin: 300,
  },
  enterprise_plus: {
    storageQuotaBytes: 100 * GB,
    memoryQuotaBytes: 10 * GB,
    rateLimitPerMin: 1000,
  },
  enterprise_max: {
    storageQuotaBytes: 250 * GB,
    memoryQuotaBytes: 25 * GB,
    rateLimitPerMin: 2500,
  },
};

export const TIER_CAPABILITIES: Record<AgentTier, string[]> = {
  retail_free: ['mem', 'fs', 'db', 'net', 'events', 'proc', 'studio', 'workflows', 'subagents', 'vault'],
  retail_pro: ['mem', 'fs', 'db', 'net', 'events', 'proc', 'skills', 'mcp', 'studio', 'workflows', 'subagents', 'vault', 'bearer'],
  enterprise_plus: ['mem', 'fs', 'db', 'net', 'events', 'proc', 'skills', 'mcp', 'ffp', 'kernel', 'sdk', 'apps', 'studio', 'workflows', 'subagents', 'vault'],
  enterprise_max: ['mem', 'fs', 'db', 'net', 'events', 'proc', 'skills', 'mcp', 'ffp', 'kernel', 'sdk', 'apps', 'studio', 'workflows', 'subagents', 'vault'],
};

export function isValidPlan(value: unknown): value is AgentPlan {
  return value === 'retail_free'
    || value === 'retail_pro'
    || value === 'enterprise_plus'
    || value === 'enterprise_max';
}

export function isValidTier(value: unknown): value is AgentTier {
  return isValidPlan(value);
}

export function normalizePlan(value: unknown): AgentPlan {
  return isValidPlan(value) ? value : 'retail_free';
}

export function normalizePersistedPlan(value: unknown): AgentPlan {
  if (value === 'free') return 'retail_free';
  if (value === 'pro') return 'retail_pro';
  if (value === 'enterprise') return 'enterprise_plus';
  if (value === 'hyper') return 'enterprise_max';
  return normalizePlan(value);
}

export function toPersistedTier(value: AgentPlan): PersistedAgentTier {
  switch (value) {
    case 'retail_free':
      return 'free';
    case 'retail_pro':
      return 'pro';
    case 'enterprise_plus':
      return 'enterprise';
    case 'enterprise_max':
      return 'hyper';
    default:
      return value;
  }
}

export function isEnterprisePlan(value: unknown): boolean {
  const plan = normalizePlan(value);
  return plan === 'enterprise_plus' || plan === 'enterprise_max';
}

export function isEnterpriseTier(value: unknown): boolean {
  return isEnterprisePlan(value);
}

export function getUpgradeablePlans(value: unknown): AgentPlan[] {
  const current = normalizePlan(value);
  const index = PLAN_ORDER.indexOf(current);
  return index >= 0 ? [...PLAN_ORDER.slice(index + 1)] : [...PLAN_ORDER];
}

export function parsePlanSelection(accountType: unknown, selectedPlan: unknown): AgentPlan | null {
  const account = accountType === 'enterprise' ? 'enterprise' : accountType === 'retail' ? 'retail' : null;
  if (!account || !isValidPlan(selectedPlan)) return null;
  const plan = selectedPlan;
  return PLAN_ACCOUNT_TYPE[plan] === account ? plan : null;
}
