export type AgentAppCommand = {
  name: string;
  description: string;
};

export type AgentAppSource = 'internal' | 'external_sdk';
export type AgentAppVisibility = 'public' | 'private' | 'workspace';
export type AgentAppRuntimeType = 'agentos-app' | 'external-app' | 'workspace-app';
export type AgentAppHealthStatus = 'online' | 'offline' | 'degraded' | 'disabled' | 'unknown';
export type AgentAppEndpointStatus = 'healthy' | 'offline' | 'degraded' | 'disabled' | 'unknown';

export type AgentAppDistribution = {
  webUrl: string | null;
  androidUrl: string | null;
  iosUrl: string | null;
};

export type AgentAppVersionEntry = {
  id: string;
  version: string;
  changeSummary: string | null;
  createdAt: string;
};

export type AgentAppManifest = {
  schemaVersion: 'agentos.app.v1';
  version: string;
  runtime: AgentAppRuntimeType;
  entrypoint: string;
  primitives: string[];
  skills: string[];
  requiredSkills: string[];
  bundledSkills: string[];
  permissions: string[];
  requiredSecrets: string[];
  commands: AgentAppCommand[];
  distribution?: Partial<AgentAppDistribution>;
};

export type AgentAppListing = {
  id: string;
  workspaceId: string | null;
  name: string;
  slug: string;
  category: string;
  description: string;
  longDescription: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  videoUrl: string | null;
  websiteUrl: string | null;
  documentationUrl: string | null;
  supportUrl: string | null;
  privacyPolicyUrl: string | null;
  termsUrl: string | null;
  releaseNotes: string | null;
  changelog: string[];
  pricing: Record<string, unknown>;
  gallery: string[];
  mediaAssets: Array<Record<string, unknown>>;
  rejectionReason: string | null;
  spotlight: boolean;
  publisherId: string;
  publisherName: string;
  developerHandle: string;
  appUrl: string | null;
  repositoryUrl: string | null;
  deviceTargets: string[];
  platforms: string[];
  manifest: AgentAppManifest;
  defaultConfig: Record<string, unknown>;
  permissionsRequired: string[];
  requiredSecrets: string[];
  screenshots: string[];
  keywords: string[];
  tags: string[];
  features: string[];
  source: AgentAppSource;
  visibility: AgentAppVisibility;
  runtimeType: AgentAppRuntimeType;
  kernelProduct: string | null;
  kernelCommandTopic: string | null;
  kernelStatusTopic: string | null;
  distribution: AgentAppDistribution;
  healthStatus: AgentAppHealthStatus;
  endpointStatus: AgentAppEndpointStatus;
  lastHeartbeatAt: string | null;
  lastCommandAt: string | null;
  lastError: string | null;
  disabled: boolean;
  heartbeatCount: number;
  openCount: number;
  webOpenCount: number;
  androidDownloadCount: number;
  iosDownloadCount: number;
  installCount: number;
  downloadCount: number;
  activeUserCount: number;
  rating: number;
  reviewCount: number;
  verified: boolean;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  versionHistory: AgentAppVersionEntry[];
};

export type AgentAppInstallation = {
  id: string;
  appId: string;
  agentId: string;
  workspaceId: string | null;
  status: 'active' | 'disabled' | 'removed';
  favorite: boolean;
  permissionsApproved: string[];
  openCount: number;
  lastOpenedAt: string | null;
  installedAt: string;
  updatedAt: string;
  installedVersion: string | null;
  updateAvailable?: boolean;
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
