import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import type { AgentAppListing } from '../appstore/catalog.js';

export type LocalAccountRecord = {
  agentId: string;
  email: string;
  agentName: string;
  avatarUrl?: string | null;
  passwordHash: string;
  plan?: string;
  accountType?: 'retail' | 'enterprise';
  createdAt: string;
  updatedAt: string;
  passwordReset: {
    token_hash: string;
    expires_at: string;
    requested_at: string;
  } | null;
};

export type LocalMemRecord = {
  value: string;
  expiresAt: number | null;
};

export type LocalFileRecord = {
  content: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type LocalDbColumn = {
  column: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  default?: string;
};

export type LocalDbTable = {
  schema: LocalDbColumn[];
  rows: Array<Record<string, unknown>>;
  autoIncrement: number;
};

export type LocalProcessRecord = {
  id: string;
  language: string;
  status: string;
  command: string | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number | null;
  createdAt: string;
  completedAt: string | null;
};

export type LocalScheduledTaskRecord = {
  id: string;
  language: string;
  cronExpression: string;
  code: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

export type LocalEventEnvelope = {
  id: string;
  topic: string;
  agentId: string;
  message: unknown;
  timestamp: string;
  isPublic: boolean;
};

export type LocalEventSubscription = {
  subscriptionId: string;
  topic: string;
  isPublic: boolean;
  createdAt: string;
};

export type LocalSkillCapability = {
  name: string;
  description: string;
};

export type LocalSkillRecord = {
  id: string;
  name: string;
  slug: string;
  version: string;
  author_id: string;
  author_name: string;
  workspace_id?: string | null;
  category: string;
  description: string;
  icon: string;
  icon_url?: string | null;
  banner_url?: string | null;
  video_url?: string | null;
  website_url?: string | null;
  documentation_url?: string | null;
  support_url?: string | null;
  privacy_policy_url?: string | null;
  terms_url?: string | null;
  release_notes?: string | null;
  changelog?: string[];
  gallery?: string[];
  media_assets?: Array<Record<string, unknown>>;
  compatible_apps?: string[];
  compatible_agents?: string[];
  compatible_workflows?: string[];
  rejection_reason?: string | null;
  spotlight?: boolean;
  pricing_model: string;
  price_per_call: number;
  free_tier_calls: number;
  total_installs: number;
  total_calls: number;
  rating: number;
  review_count: number;
  primitives_required: string[];
  capabilities: LocalSkillCapability[];
  tags: string[];
  published: boolean;
  verified: boolean;
  permissions_required?: string[];
  required_secrets?: string[];
  developer_handle?: string | null;
  required_skills?: string[];
  optional_skills?: string[];
  compatibility?: string[];
  examples?: Array<Record<string, unknown>>;
  inputs?: Array<Record<string, unknown>>;
  outputs?: Array<Record<string, unknown>>;
  dependencies?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
  source_code: string | null;
};

export type LocalSkillInstallationRecord = {
  id: string;
  skill_id: string;
  workspace_id?: string | null;
  status?: 'active' | 'disabled' | 'removed';
  permissions_approved?: string[];
  dependency_install?: boolean;
  installed_at: string;
  updated_at?: string;
};

export type LocalExternalAgentRegistrationRecord = {
  agent_id: string;
  name: string;
  description: string | null;
  owner_email: string | null;
  allowed_domains: string[];
  allowed_tools: string[];
  status: string;
  total_calls: number;
  last_active_at: string | null;
  created_at: string;
};

export type LocalAgentAppRecord = AgentAppListing;
export type LocalAppInstallationRecord = {
  id: string;
  app_id: string;
  agent_id: string;
  workspace_id: string | null;
  status: 'active' | 'disabled' | 'removed';
  favorite: boolean;
  permissions_approved: string[];
  open_count: number;
  last_opened_at: string | null;
  installed_at: string;
  updated_at: string;
  installed_version?: string | null;
};

export type LocalAppPackageCacheRecord = {
  id: string;
  appId: string;
  workspaceId: string | null;
  ownerAgentId: string;
  packageRef: string;
  packagePayload: Record<string, unknown>;
  version: string;
  status: 'cached' | 'stale' | 'removed';
  cachedAt: string;
  updatedAt: string;
};

export type LocalAppDeviceInstallationRecord = {
  id: string;
  appId: string;
  workspaceId: string | null;
  ownerAgentId: string;
  target: string;
  packageRef: string;
  status: 'installed' | 'removed';
  installedAt: string;
  updatedAt: string;
};

export type LocalBearerTokenRecord = {
  id: string;
  ownerAgentId: string;
  name: string;
  workspaceId: string | null;
  projectId: string | null;
  subjectType: string | null;
  subjectId: string | null;
  scopes: string[];
  permissions: string[];
  tokenHash: string;
  maskedToken: string;
  status: 'active' | 'revoked';
  lastUsedAt: string | null;
  rotatedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LocalFfpTempSettingRecord = {
  workspaceId: string;
  ownerAgentId: string;
  enabled: boolean;
  updatedAt: string;
};

export type LocalProjectRecord = {
  id: string;
  workspaceId: string;
  ownerAgentId: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'active' | 'archived';
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type LocalWorkspaceRecord = {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: string;
  createdAt: string;
};

export type LocalWorkspaceMemberRecord = {
  workspaceId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: string;
};

export type LocalNotificationRow = Record<string, unknown>;

export type LocalLibraryItemRecord = {
  id: string;
  ownerAgentId: string;
  workspaceId: string | null;
  projectId: string | null;
  sourceType: string;
  sourceId: string;
  name: string;
  description: string | null;
  visibility: 'private' | 'workspace' | 'public';
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type LocalMarketplaceOwnershipRecord = {
  id: string;
  ownerAgentId: string;
  workspaceId: string | null;
  assetType: 'app' | 'skill' | 'workflow' | 'subagent';
  assetId: string;
  sourceSlug: string;
  status: 'owned' | 'revoked';
  metadata: Record<string, unknown>;
  acquiredAt: string;
  updatedAt: string;
};

export type LocalWorkspaceAssetRegistryRecord = {
  id: string;
  ownerAgentId: string;
  workspaceId: string | null;
  assetType: 'app' | 'skill' | 'workflow' | 'subagent' | 'file' | 'vault_asset' | 'memory_asset' | 'mcp_connection';
  assetId: string;
  sourceId: string | null;
  name: string;
  description: string | null;
  href: string | null;
  status: 'active' | 'disabled' | 'removed';
  searchText: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type LocalStudioSessionRow = Record<string, unknown>;
export type LocalStudioMessageRow = Record<string, unknown>;
export type LocalStudioEventRow = Record<string, unknown>;

export type LocalVaultRuntimeGrantRecord = {
  id: string;
  secret_id: string;
  vault_id: string;
  workspace_id: string;
  owner_agent_id: string;
  name: string;
  subject_type: string;
  subject_id: string;
  metadata: Record<string, unknown>;
  status: 'active' | 'consumed' | 'cleaned' | 'expired';
  expires_at: string;
  consumed_at: string | null;
  cleaned_up_at: string | null;
  created_at: string;
};

export type LocalTrustedDeviceRecord = {
  id: string;
  agentId: string;
  fingerprint: string;
  label: string;
  userAgent: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  revokedAt: string | null;
};

export type LocalAuthRefreshSessionRecord = {
  id: string;
  agentId: string;
  deviceId: string | null;
  sessionSelector: string;
  tokenHash: string;
  userAgent: string | null;
  deviceLabel: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  replacedById: string | null;
};

export type LocalSessionAuditLogRecord = {
  id: string;
  agentId: string;
  sessionId: string | null;
  deviceId: string | null;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type LocalDeveloperWebhookRecord = {
  id: string;
  ownerAgentId: string;
  name: string;
  callbackUrl: string;
  secretMasked: string;
  events: string[];
  status: 'active' | 'disabled';
  failureCount: number;
  lastDeliveryAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LocalDeveloperWebhookLogRecord = {
  id: string;
  webhookId: string;
  ownerAgentId: string;
  status: 'success' | 'failure' | 'retrying';
  event: string;
  responseCode: number | null;
  error: string | null;
  createdAt: string;
};

export type LocalCapabilityNodeRecord = Record<string, unknown>;
export type LocalTaskRecord = Record<string, unknown>;
export type LocalTaskStepRecord = Record<string, unknown>;
export type LocalConfirmationRecord = Record<string, unknown>;
export type LocalSuperAgentAuditLogRecord = Record<string, unknown>;

export type LocalRuntimeState = {
  accounts: Record<string, LocalAccountRecord>;
  externalAgents: Record<string, LocalExternalAgentRegistrationRecord>;
  mem: Record<string, Record<string, LocalMemRecord>>;
  files: Record<string, Record<string, LocalFileRecord>>;
  directories: Record<string, string[]>;
  db: Record<string, Record<string, LocalDbTable>>;
  processes: Record<string, LocalProcessRecord[]>;
  scheduledTasks: Record<string, LocalScheduledTaskRecord[]>;
  privateEvents: Record<string, Record<string, LocalEventEnvelope[]>>;
  publicEvents: Record<string, LocalEventEnvelope[]>;
  subscriptions: Record<string, Record<string, LocalEventSubscription>>;
  skills: {
    catalog: LocalSkillRecord[];
    installations: Record<string, LocalSkillInstallationRecord[]>;
  };
  agentApps: {
    catalog: LocalAgentAppRecord[];
    installations: Record<string, LocalAppInstallationRecord[]>;
  };
  appPackageCache: LocalAppPackageCacheRecord[];
  appDeviceInstallations: LocalAppDeviceInstallationRecord[];
  bearerTokens: LocalBearerTokenRecord[];
  ffpTempSettings: LocalFfpTempSettingRecord[];
  workspaces: LocalWorkspaceRecord[];
  workspaceMembers: LocalWorkspaceMemberRecord[];
  projects: Record<string, LocalProjectRecord[]>;
  studioSessions: LocalStudioSessionRow[];
  studioMessages: LocalStudioMessageRow[];
  studioEvents: LocalStudioEventRow[];
  notifications: LocalNotificationRow[];
  trustedDevices: Record<string, LocalTrustedDeviceRecord[]>;
  authRefreshSessions: Record<string, LocalAuthRefreshSessionRecord[]>;
  sessionAuditLogs: Record<string, LocalSessionAuditLogRecord[]>;
  developerWebhooks: Record<string, LocalDeveloperWebhookRecord[]>;
  developerWebhookLogs: Record<string, LocalDeveloperWebhookLogRecord[]>;
  vaultRuntimeGrants: LocalVaultRuntimeGrantRecord[];
  libraryItems: LocalLibraryItemRecord[];
  marketplaceOwnership: LocalMarketplaceOwnershipRecord[];
  workspaceAssetRegistry: LocalWorkspaceAssetRegistryRecord[];
  capabilityRegistry: LocalCapabilityNodeRecord[];
  agentTasks: LocalTaskRecord[];
  agentTaskSteps: LocalTaskStepRecord[];
  agentConfirmations: LocalConfirmationRecord[];
  superAgentAuditLogs: LocalSuperAgentAuditLogRecord[];
};

const DEFAULT_STATE_FILE = join(tmpdir(), 'agentos-runtime-state.json');
function getStateFilePath(): string {
  return process.env.AGENTOS_STATE_FILE?.trim() || DEFAULT_STATE_FILE;
}

function assertLocalRuntimeStateEnabled(): void {
  if (process.env.NODE_ENV === 'production' && process.env.AGENTOS_ALLOW_LOCAL_STATE !== '1') {
    throw new Error('Local runtime state is disabled in production');
  }
}

function defaultSkillCatalog(): LocalSkillRecord[] {
  return [];
}

function createDefaultState(): LocalRuntimeState {
  return {
    accounts: {},
    externalAgents: {},
    mem: {},
    files: {},
    directories: {},
    db: {},
    processes: {},
    scheduledTasks: {},
    privateEvents: {},
    publicEvents: {},
    subscriptions: {},
    skills: {
      catalog: defaultSkillCatalog(),
      installations: {},
    },
    agentApps: {
      catalog: [],
      installations: {},
    },
    appPackageCache: [],
    appDeviceInstallations: [],
    bearerTokens: [],
    ffpTempSettings: [],
    workspaces: [],
    workspaceMembers: [],
    projects: {},
    studioSessions: [],
    studioMessages: [],
    studioEvents: [],
    notifications: [],
    trustedDevices: {},
    authRefreshSessions: {},
    sessionAuditLogs: {},
    developerWebhooks: {},
    developerWebhookLogs: {},
    vaultRuntimeGrants: [],
    libraryItems: [],
    marketplaceOwnership: [],
    workspaceAssetRegistry: [],
    capabilityRegistry: [],
    agentTasks: [],
    agentTaskSteps: [],
    agentConfirmations: [],
    superAgentAuditLogs: [],
  };
}

function normalizeState(value: unknown): LocalRuntimeState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createDefaultState();
  }

  const state = value as Partial<LocalRuntimeState>;
  const defaults = createDefaultState();

  return {
    accounts: state.accounts ?? defaults.accounts,
    externalAgents: state.externalAgents ?? defaults.externalAgents,
    mem: state.mem ?? defaults.mem,
    files: state.files ?? defaults.files,
    directories: state.directories ?? defaults.directories,
    db: state.db ?? defaults.db,
    processes: state.processes ?? defaults.processes,
    scheduledTasks: state.scheduledTasks ?? defaults.scheduledTasks,
    privateEvents: state.privateEvents ?? defaults.privateEvents,
    publicEvents: state.publicEvents ?? defaults.publicEvents,
    subscriptions: state.subscriptions ?? defaults.subscriptions,
    skills: {
      catalog: state.skills?.catalog?.length ? state.skills.catalog : defaults.skills.catalog,
      installations: state.skills?.installations ?? defaults.skills.installations,
    },
    agentApps: {
      catalog: state.agentApps?.catalog ?? defaults.agentApps.catalog,
      installations: state.agentApps?.installations ?? defaults.agentApps.installations,
    },
    appPackageCache: state.appPackageCache ?? defaults.appPackageCache,
    appDeviceInstallations: state.appDeviceInstallations ?? defaults.appDeviceInstallations,
    bearerTokens: state.bearerTokens ?? defaults.bearerTokens,
    ffpTempSettings: state.ffpTempSettings ?? defaults.ffpTempSettings,
    workspaces: state.workspaces ?? defaults.workspaces,
    workspaceMembers: state.workspaceMembers ?? defaults.workspaceMembers,
    projects: state.projects ?? defaults.projects,
    studioSessions: state.studioSessions ?? defaults.studioSessions,
    studioMessages: state.studioMessages ?? defaults.studioMessages,
    studioEvents: state.studioEvents ?? defaults.studioEvents,
    notifications: state.notifications ?? defaults.notifications,
    trustedDevices: state.trustedDevices ?? defaults.trustedDevices,
    authRefreshSessions: state.authRefreshSessions ?? defaults.authRefreshSessions,
    sessionAuditLogs: state.sessionAuditLogs ?? defaults.sessionAuditLogs,
    developerWebhooks: state.developerWebhooks ?? defaults.developerWebhooks,
    developerWebhookLogs: state.developerWebhookLogs ?? defaults.developerWebhookLogs,
    vaultRuntimeGrants: state.vaultRuntimeGrants ?? defaults.vaultRuntimeGrants,
    libraryItems: state.libraryItems ?? defaults.libraryItems,
    marketplaceOwnership: state.marketplaceOwnership ?? defaults.marketplaceOwnership,
    workspaceAssetRegistry: state.workspaceAssetRegistry ?? defaults.workspaceAssetRegistry,
    capabilityRegistry: state.capabilityRegistry ?? defaults.capabilityRegistry,
    agentTasks: state.agentTasks ?? defaults.agentTasks,
    agentTaskSteps: state.agentTaskSteps ?? defaults.agentTaskSteps,
    agentConfirmations: state.agentConfirmations ?? defaults.agentConfirmations,
    superAgentAuditLogs: state.superAgentAuditLogs ?? defaults.superAgentAuditLogs,
  };
}

async function ensureStateDirectory(): Promise<void> {
  await mkdir(dirname(getStateFilePath()), { recursive: true });
}

export async function readLocalRuntimeState(): Promise<LocalRuntimeState> {
  if (process.env.NODE_ENV === 'production' && process.env.AGENTOS_ALLOW_LOCAL_STATE !== '1') {
    return createDefaultState();
  }
  try {
    const raw = await readFile(getStateFilePath(), 'utf8');
    return normalizeState(JSON.parse(raw) as unknown);
  } catch {
    return createDefaultState();
  }
}

let writeQueue: Promise<void> = Promise.resolve();

export async function updateLocalRuntimeState<T>(
  updater: (state: LocalRuntimeState) => Promise<T> | T,
): Promise<T> {
  assertLocalRuntimeStateEnabled();
  let result!: T;

  const next = writeQueue.then(async () => {
    const state = await readLocalRuntimeState();
    result = await updater(state);
    await ensureStateDirectory();
    await writeFile(getStateFilePath(), JSON.stringify(state, null, 2), 'utf8');
  });

  writeQueue = next.catch(() => undefined);
  await next;
  return result;
}
