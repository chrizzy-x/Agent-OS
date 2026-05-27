import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { readLocalRuntimeState, updateLocalRuntimeState } from '../storage/local-state.js';
import { ValidationError } from '../utils/errors.js';
import {
  AGENT_APP_CATEGORIES,
  AGENT_APP_DEVICE_TARGETS,
  type AgentAppListing,
  type AgentAppManifest,
} from './catalog.js';

export type AgentAppSort = 'popular' | 'recent' | 'name';

export type ListAgentAppsOptions = {
  category?: string | null;
  search?: string | null;
  sort?: string | null;
  publisherId?: string | null;
  includePrivate?: boolean;
};

export type PublishAgentAppInput = {
  name?: string;
  slug?: string;
  category?: string;
  description?: string;
  longDescription?: string;
  publisherId: string;
  publisherName?: string;
  appUrl?: string | null;
  repositoryUrl?: string | null;
  deviceTargets?: unknown;
  manifest?: unknown;
  defaultConfig?: unknown;
  published?: unknown;
};

export type AgentAppPackage = {
  schema: 'agentos.app.v1';
  packagedAt: string;
  app: {
    id: string;
    name: string;
    slug: string;
    version: string;
    category: string;
    publisherId: string;
    publisherName: string;
  };
  distribution: {
    source: 'agentos-app-store';
    appUrl: string | null;
    repositoryUrl: string | null;
    deviceTargets: string[];
  };
  manifest: AgentAppManifest;
  defaultConfig: Record<string, unknown>;
};

type DbAgentAppRow = {
  id?: unknown;
  name?: unknown;
  slug?: unknown;
  category?: unknown;
  description?: unknown;
  long_description?: unknown;
  publisher_id?: unknown;
  publisher_name?: unknown;
  app_url?: unknown;
  repository_url?: unknown;
  device_targets?: unknown;
  manifest?: unknown;
  default_config?: unknown;
  install_count?: unknown;
  verified?: unknown;
  published?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return items.length > 0 ? items.map(item => item.trim()) : fallback;
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeManifest(value: unknown, slug: string): AgentAppManifest {
  const input = isRecord(value) ? value : {};
  return {
    schemaVersion: 'agentos.app.v1',
    version: stringValue(input.version, '1.0.0'),
    runtime: input.runtime === 'external-app' || input.runtime === 'workspace-app' ? input.runtime : 'agentos-app',
    entrypoint: stringValue(input.entrypoint, `agentos://apps/${slug}`),
    primitives: stringArray(input.primitives, []),
    skills: stringArray(input.skills, []),
    permissions: stringArray(input.permissions, []),
    requiredSecrets: stringArray(input.requiredSecrets ?? input.required_secrets, []),
    commands: Array.isArray(input.commands)
      ? input.commands.filter(isRecord).map(command => ({
          name: stringValue(command.name, 'run'),
          description: stringValue(command.description, 'Run the app command.'),
        }))
      : [],
  };
}

function normalizeDefaultConfig(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function fromDbRow(row: DbAgentAppRow): AgentAppListing {
  const slug = stringValue(row.slug);
  const manifest = normalizeManifest(row.manifest, slug);
  const description = stringValue(row.description);
  const createdAt = stringValue(row.created_at, new Date().toISOString());
  return {
    id: stringValue(row.id),
    name: stringValue(row.name),
    slug,
    category: stringValue(row.category, 'Operations'),
    description,
    longDescription: stringValue(row.long_description, description),
    publisherId: stringValue(row.publisher_id),
    publisherName: stringValue(row.publisher_name, stringValue(row.publisher_id, 'Unknown')),
    appUrl: nullableString(row.app_url),
    repositoryUrl: nullableString(row.repository_url),
    deviceTargets: stringArray(row.device_targets, ['AgentOS Cloud']),
    manifest,
    defaultConfig: normalizeDefaultConfig(row.default_config),
    installCount: Number(row.install_count ?? 0),
    verified: row.verified === true,
    published: row.published !== false,
    createdAt,
    updatedAt: stringValue(row.updated_at, createdAt),
  };
}

function toDbPayload(app: AgentAppListing): Record<string, unknown> {
  return {
    id: app.id,
    name: app.name,
    slug: app.slug,
    category: app.category,
    description: app.description,
    long_description: app.longDescription,
    publisher_id: app.publisherId,
    publisher_name: app.publisherName,
    app_url: app.appUrl,
    repository_url: app.repositoryUrl,
    device_targets: app.deviceTargets,
    manifest: app.manifest,
    default_config: app.defaultConfig,
    install_count: app.installCount,
    verified: app.verified,
    published: app.published,
    created_at: app.createdAt,
    updated_at: app.updatedAt,
  };
}

async function loadStoredApps(): Promise<AgentAppListing[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('agent_apps')
      .select('id,name,slug,category,description,long_description,publisher_id,publisher_name,app_url,repository_url,device_targets,manifest,default_config,install_count,verified,published,created_at,updated_at');

    if (!error) {
      return ((data ?? []) as DbAgentAppRow[]).map(fromDbRow);
    }
  } catch {
    // Local fallback below.
  }

  const state = await readLocalRuntimeState();
  return state.agentApps.catalog;
}

function appMatchesSearch(app: AgentAppListing, search: string): boolean {
  const haystack = [
    app.name,
    app.description,
    app.longDescription,
    app.category,
    app.publisherName,
    ...app.deviceTargets,
    ...app.manifest.primitives,
    ...app.manifest.skills,
  ].join(' ').toLowerCase();
  return haystack.includes(search);
}

function compareApps(sort: string, left: AgentAppListing, right: AgentAppListing): number {
  if (sort === 'recent') return right.createdAt.localeCompare(left.createdAt);
  if (sort === 'name') return left.name.localeCompare(right.name);
  return right.installCount - left.installCount;
}

export async function listAgentApps(options: ListAgentAppsOptions = {}): Promise<AgentAppListing[]> {
  const category = options.category?.trim();
  const search = options.search?.trim().toLowerCase() ?? '';
  const sort = options.sort?.trim() || 'popular';
  const publisherId = options.publisherId?.trim();
  let apps = await loadStoredApps();

  if (publisherId) {
    apps = apps.filter(app => app.publisherId === publisherId);
  }

  if (!options.includePrivate) {
    apps = apps.filter(app => app.published);
  }

  if (category && category !== 'All' && category.toLowerCase() !== 'all') {
    apps = apps.filter(app => app.category.toLowerCase() === category.toLowerCase());
  }

  if (search) {
    apps = apps.filter(app => appMatchesSearch(app, search));
  }

  return apps.sort((left, right) => compareApps(sort, left, right));
}

export async function getAgentAppBySlug(slug: string, options: { includePrivate?: boolean } = {}): Promise<AgentAppListing | null> {
  const normalizedSlug = normalizeSlug(slug);
  const apps = await listAgentApps({ includePrivate: options.includePrivate });
  return apps.find(app => app.slug === normalizedSlug) ?? null;
}

export async function publishAgentApp(input: PublishAgentAppInput): Promise<AgentAppListing> {
  const name = input.name?.trim() ?? '';
  const slug = normalizeSlug(input.slug?.trim() || name);
  const category = input.category?.trim() || 'Operations';
  const description = input.description?.trim() ?? '';
  const publisherId = input.publisherId.trim();

  if (!name || !slug || !category || !description || !publisherId) {
    throw new ValidationError('Missing required fields: name, category, description');
  }

  const now = new Date().toISOString();
  const app: AgentAppListing = {
    id: randomUUID(),
    name,
    slug,
    category: AGENT_APP_CATEGORIES.includes(category) && category !== 'All' ? category : category,
    description,
    longDescription: input.longDescription?.trim() || description,
    publisherId,
    publisherName: input.publisherName?.trim() || publisherId,
    appUrl: nullableString(input.appUrl),
    repositoryUrl: nullableString(input.repositoryUrl),
    deviceTargets: stringArray(input.deviceTargets, AGENT_APP_DEVICE_TARGETS.slice(0, 2)),
    manifest: normalizeManifest(input.manifest, slug),
    defaultConfig: normalizeDefaultConfig(input.defaultConfig),
    installCount: 0,
    verified: false,
    published: input.published !== false,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('agent_apps')
      .insert(toDbPayload(app))
      .select()
      .single();

    if (!error && data) return fromDbRow(data as DbAgentAppRow);
    if (error?.code === '23505' || error?.message?.toLowerCase().includes('duplicate')) {
      throw new ValidationError('App slug already exists');
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
  }

  return updateLocalRuntimeState(state => {
    const existing = state.agentApps.catalog.find(item => item.slug === slug);
    if (existing && existing.publisherId !== publisherId) {
      throw new ValidationError('App slug already exists');
    }
    if (existing) {
      Object.assign(existing, { ...app, id: existing.id, createdAt: existing.createdAt });
      return existing;
    }
    state.agentApps.catalog.unshift(app);
    return app;
  });
}

export async function updateAgentAppVisibility(params: {
  slug: string;
  publisherId?: string;
  published: boolean;
  canManageAll?: boolean;
}): Promise<AgentAppListing> {
  const normalizedSlug = normalizeSlug(params.slug);
  const now = new Date().toISOString();

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('agent_apps')
      .update({ published: params.published, updated_at: now })
      .eq('slug', normalizedSlug);

    if (!params.canManageAll) {
      query = query.eq('publisher_id', params.publisherId ?? '');
    }

    const { data, error } = await query.select().maybeSingle();
    if (!error && data) return fromDbRow(data as DbAgentAppRow);
  } catch {
    // Local fallback below.
  }

  return updateLocalRuntimeState(state => {
    const app = state.agentApps.catalog.find(item => item.slug === normalizedSlug);
    if (!app || (!params.canManageAll && app.publisherId !== params.publisherId)) {
      throw new ValidationError('App not found');
    }

    app.published = params.published;
    app.updatedAt = now;
    return app;
  });
}

export async function recordAgentAppDownload(slug: string): Promise<void> {
  const normalizedSlug = normalizeSlug(slug);
  try {
    const supabase = getSupabaseAdmin();
    await supabase.rpc('increment_agent_app_installs', { p_slug: normalizedSlug });
    return;
  } catch {
    // Local fallback below.
  }

  await updateLocalRuntimeState(state => {
    const app = state.agentApps.catalog.find(item => item.slug === normalizedSlug);
    if (app) app.installCount += 1;
  });
}

export function buildAgentAppPackage(app: AgentAppListing): AgentAppPackage {
  return {
    schema: 'agentos.app.v1',
    packagedAt: new Date().toISOString(),
    app: {
      id: app.id,
      name: app.name,
      slug: app.slug,
      version: app.manifest.version,
      category: app.category,
      publisherId: app.publisherId,
      publisherName: app.publisherName,
    },
    distribution: {
      source: 'agentos-app-store',
      appUrl: app.appUrl,
      repositoryUrl: app.repositoryUrl,
      deviceTargets: app.deviceTargets,
    },
    manifest: app.manifest,
    defaultConfig: app.defaultConfig,
  };
}
