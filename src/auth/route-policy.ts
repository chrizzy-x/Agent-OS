import type { Capability } from './capabilities.js';

export const ROUTE_CAPABILITY_POLICY = {
  'studio.command': 'use_nl_studio',
  'studio.intent': 'use_nl_studio',
  'studio.sessions.read': 'use_nl_studio',
  'studio.sessions.create': 'use_nl_studio',
  'studio.sessions.update': 'use_nl_studio',
  'studio.sessions.stream': 'use_nl_studio',
  'studio.snapshots': 'use_nl_studio',
  'subagents.manage': 'create_private_subagent',
  'workflows.manage': 'create_private_workflow',
  'workflows.run': 'run_workflow',
  'skills.install': 'install_skill',
  'skills.create': 'create_skill',
  'skills.publish': 'publish_skill',
  'apps.install': 'install_app',
  'apps.create': 'create_app',
  'apps.publish': 'publish_app',
  'session.token.issue': 'use_bearer_token',
  'developer.console': 'access_developer_console',
  'developer.analytics': 'use_advanced_analytics',
  'sdk.credentials': 'access_sdk',
  'sdk.kernel': 'access_sdk',
  'vault.manage': 'use_nl_studio',
  'super-agent.manage': 'use_super_agentos',
  'plan.transition': 'use_super_agentos',
} as const satisfies Record<string, Capability>;

export type RoutePolicyKey = keyof typeof ROUTE_CAPABILITY_POLICY;
