export type AgentAppCommand = {
  name: string;
  description: string;
};

export type AgentAppManifest = {
  schemaVersion: 'agentos.app.v1';
  version: string;
  runtime: 'agentos-app' | 'external-app' | 'workspace-app';
  entrypoint: string;
  primitives: string[];
  skills: string[];
  permissions: string[];
  requiredSecrets: string[];
  commands: AgentAppCommand[];
};

export type AgentAppListing = {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  longDescription: string;
  publisherId: string;
  publisherName: string;
  appUrl: string | null;
  repositoryUrl: string | null;
  deviceTargets: string[];
  manifest: AgentAppManifest;
  defaultConfig: Record<string, unknown>;
  installCount: number;
  verified: boolean;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

export const AGENT_APP_CATEGORIES = [
  'All',
  'Research',
  'Finance',
  'Growth',
  'Data',
  'Security',
  'Support',
  'Operations',
];

export const AGENT_APP_DEVICE_TARGETS = [
  'AgentOS Desktop',
  'AgentOS Cloud',
  'Enterprise Workspace',
  'Mobile Companion',
];
