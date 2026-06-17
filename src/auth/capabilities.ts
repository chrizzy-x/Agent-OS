import { PermissionError } from '../utils/errors.js';
import {
  isValidPlan,
  normalizePlan,
  isEnterprisePlan,
  PLAN_LABELS,
  PLAN_PRICES_USD,
  TIER_QUOTAS,
  type AgentPlan,
} from './tiers.js';
import type { AgentQuotas } from './permissions.js';

export type Capability =
  | 'use_super_agentos'
  | 'use_nl_studio'
  | 'create_private_subagent'
  | 'create_private_workflow'
  | 'run_workflow'
  | 'install_skill'
  | 'install_app'
  | 'use_bearer_token'
  | 'access_sdk'
  | 'access_developer_console'
  | 'create_skill'
  | 'publish_skill'
  | 'create_app'
  | 'publish_app'
  | 'manage_manifest'
  | 'manage_webhook'
  | 'manage_versions'
  | 'manage_team'
  | 'manage_org_vault'
  | 'view_audit_logs'
  | 'use_advanced_analytics';

export const ALL_CAPABILITIES: Capability[] = [
  'use_super_agentos',
  'use_nl_studio',
  'create_private_subagent',
  'create_private_workflow',
  'run_workflow',
  'install_skill',
  'install_app',
  'use_bearer_token',
  'access_sdk',
  'access_developer_console',
  'create_skill',
  'publish_skill',
  'create_app',
  'publish_app',
  'manage_manifest',
  'manage_webhook',
  'manage_versions',
  'manage_team',
  'manage_org_vault',
  'view_audit_logs',
  'use_advanced_analytics',
];

const RETAIL_BASE: Capability[] = [
  'use_super_agentos',
  'use_nl_studio',
  'create_private_subagent',
  'create_private_workflow',
  'run_workflow',
  'install_skill',
  'install_app',
];

const RETAIL_PRO_ONLY: Capability[] = [
  ...RETAIL_BASE,
  'use_bearer_token',
];

const ENTERPRISE_DEVELOPER: Capability[] = [
  ...RETAIL_PRO_ONLY,
  'access_sdk',
  'access_developer_console',
  'create_skill',
  'publish_skill',
  'create_app',
  'publish_app',
  'manage_manifest',
  'manage_webhook',
  'manage_versions',
  'manage_team',
  'manage_org_vault',
  'view_audit_logs',
  'use_advanced_analytics',
];

export const CAPABILITY_MATRIX: Record<AgentPlan, ReadonlySet<Capability>> = {
  retail_free: new Set(RETAIL_BASE),
  retail_pro: new Set(RETAIL_PRO_ONLY),
  enterprise_plus: new Set(ENTERPRISE_DEVELOPER),
  enterprise_max: new Set(ENTERPRISE_DEVELOPER),
};

export type PlanDescriptor = {
  plan: AgentPlan;
  label: string;
  priceUsd: number;
  enterprise: boolean;
  capabilities: Capability[];
  quotas: AgentQuotas;
};

export function getPlanDescriptor(planOrTier: unknown): PlanDescriptor {
  const plan = normalizePlan(planOrTier);
  return {
    plan,
    label: PLAN_LABELS[plan],
    priceUsd: PLAN_PRICES_USD[plan],
    enterprise: isEnterprisePlan(plan),
    capabilities: [...CAPABILITY_MATRIX[plan]],
    quotas: TIER_QUOTAS[plan],
  };
}

export function hasCapability(planOrTier: unknown, capability: Capability): boolean {
  if (!isValidPlan(planOrTier)) return false;
  return CAPABILITY_MATRIX[planOrTier].has(capability);
}

export function assertCapability(planOrTier: unknown, capability: Capability): void {
  if (!hasCapability(planOrTier, capability)) {
    throw new PermissionError(capabilityMessage(capability));
  }
}

export function capabilityMessage(capability: Capability): string {
  if (
    capability === 'access_sdk'
    || capability === 'access_developer_console'
    || capability === 'create_skill'
    || capability === 'publish_skill'
    || capability === 'create_app'
    || capability === 'publish_app'
    || capability === 'manage_manifest'
    || capability === 'manage_webhook'
    || capability === 'manage_versions'
  ) {
    return 'App/Skill creation and SDK access require Enterprise or Enterprise Max. You can continue saving this as a private workflow, use Bearer token access if available, or upgrade.';
  }

  return `Plan capability required: ${capability}`;
}
