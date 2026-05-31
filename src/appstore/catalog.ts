export type AgentAppCommand = {
  name: string;
  description: string;
};

export type AgentAppSource = 'internal' | 'external_sdk';
export type AgentAppVisibility = 'public' | 'private' | 'unlisted';
export type AgentAppRuntimeType = 'agentos-app' | 'external-app' | 'workspace-app';

export type AgentAppManifest = {
  schemaVersion: 'agentos.app.v1';
  version: string;
  runtime: AgentAppRuntimeType;
  entrypoint: string;
  primitives: string[];
  skills: string[];
  permissions: string[];
  requiredSecrets: string[];
  commands: AgentAppCommand[];
};

export type AgentAppListing = {
  id: string;
  workspaceId: string | null;
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
  permissionsRequired: string[];
  requiredSecrets: string[];
  screenshots: string[];
  source: AgentAppSource;
  visibility: AgentAppVisibility;
  runtimeType: AgentAppRuntimeType;
  kernelProduct: string | null;
  kernelCommandTopic: string | null;
  kernelStatusTopic: string | null;
  lastHeartbeatAt: string | null;
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
