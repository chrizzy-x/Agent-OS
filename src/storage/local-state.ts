import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import type { AgentAppListing } from '../appstore/catalog.js';

export type LocalAccountRecord = {
  agentId: string;
  email: string;
  agentName: string;
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
  created_at: string;
  source_code: string | null;
};

export type LocalSkillInstallationRecord = {
  id: string;
  skill_id: string;
  installed_at: string;
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
  projects: Record<string, LocalProjectRecord[]>;
  trustedDevices: Record<string, LocalTrustedDeviceRecord[]>;
  authRefreshSessions: Record<string, LocalAuthRefreshSessionRecord[]>;
  sessionAuditLogs: Record<string, LocalSessionAuditLogRecord[]>;
  vaultRuntimeGrants: LocalVaultRuntimeGrantRecord[];
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
    projects: {},
    trustedDevices: {},
    authRefreshSessions: {},
    sessionAuditLogs: {},
    vaultRuntimeGrants: [],
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
    projects: state.projects ?? defaults.projects,
    trustedDevices: state.trustedDevices ?? defaults.trustedDevices,
    authRefreshSessions: state.authRefreshSessions ?? defaults.authRefreshSessions,
    sessionAuditLogs: state.sessionAuditLogs ?? defaults.sessionAuditLogs,
    vaultRuntimeGrants: state.vaultRuntimeGrants ?? defaults.vaultRuntimeGrants,
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
