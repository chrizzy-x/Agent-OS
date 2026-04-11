import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { OFFICIAL_VERIFIED_SKILLS } from '../skills/official-catalog.js';

export type LocalAccountRecord = {
  agentId: string;
  email: string;
  agentName: string;
  passwordHash: string;
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
};

const DEFAULT_STATE_FILE = join(tmpdir(), 'agentos-runtime-state.json');
const defaultSkillCapabilities: LocalSkillCapability[] = [
  { name: 'run', description: 'Execute the skill with the supplied params.' },
];
const defaultSkillIcon = '[skill]';

function getStateFilePath(): string {
  return process.env.AGENTOS_STATE_FILE?.trim() || DEFAULT_STATE_FILE;
}

function defaultSkillCatalog(): LocalSkillRecord[] {
  const now = new Date().toISOString();
  return OFFICIAL_VERIFIED_SKILLS.map(skill => ({
    id: `official-${skill.slug}`,
    name: skill.name,
    slug: skill.slug,
    version: '1.0.0',
    author_id: 'agentos',
    author_name: 'AgentOS',
    category: skill.category,
    description: skill.summary,
    icon: defaultSkillIcon,
    pricing_model: 'free',
    price_per_call: 0,
    free_tier_calls: 1000,
    total_installs: 0,
    total_calls: 0,
    rating: 5,
    review_count: 1,
    primitives_required: [],
    capabilities: [...defaultSkillCapabilities],
    tags: [skill.pack, skill.category],
    published: true,
    verified: true,
    created_at: now,
    source_code: null,
  }));
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
  };
}

async function ensureStateDirectory(): Promise<void> {
  await mkdir(dirname(getStateFilePath()), { recursive: true });
}

export async function readLocalRuntimeState(): Promise<LocalRuntimeState> {
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