import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { readLocalRuntimeState, updateLocalRuntimeState } from '../storage/local-state.js';
import { ValidationError } from '../utils/errors.js';
import {
  AGENT_APP_CATEGORIES,
  AGENT_APP_DEVICE_TARGETS,
  type AgentAppListing,
  type AgentAppManifest,
  type AgentAppRuntimeType,
  type AgentAppSource,
  type AgentAppVisibility,
} from './catalog.js';

export type AgentAppSort = 'popular' | 'recent' | 'name';

export type AgentAppAccessOptions = {
  viewerAgentId?: string | null;
  viewerWorkspaceIds?: string[] | null;
  canManageAll?: boolean;
};

export type ListAgentAppsOptions = AgentAppAccessOptions & {
  category?: string | null;
  search?: string | null;
  sort?: string | null;
  publisherId?: string | null;
  includeHidden?: boolean;
  source?: string | null;
  runtimeType?: string | null;
  visibility?: string | null;
};

export type PublishAgentAppInput = {
  name?: string;
  slug?: string;
  category?: string;
  description?: string;
  longDescription?: string;
  publisherId: string;
  publisherName?: string;
  workspaceId?: string | null;
  appUrl?: string | null;
  repositoryUrl?: string | null;
  deviceTargets?: unknown;
  manifest?: unknown;
  defaultConfig?: unknown;
  published?: unknown;
  visibility?: unknown;
  source?: unknown;
  runtimeType?: unknown;
  kernelProduct?: unknown;
  kernelCommandTopic?: unknown;
  kernelStatusTopic?: unknown;
  lastHeartbeatAt?: unknown;
  permissionsRequired?: unknown;
  requiredSecrets?: unknown;
  screenshots?: unknown;
  publishState?: string;
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
  workspace_id?: unknown;
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
  permissions_required?: unknown;
  required_secrets?: unknown;
  screenshots?: unknown;
  publish_state?: unknown;
  source?: unknown;
  visibility?: unknown;
  runtime_type?: unknown;
  kernel_product?: unknown;
  kernel_command_topic?: unknown;
  kernel_status_topic?: unknown;
  last_heartbeat_at?: unknown;
  install_count?: unknown;
  verified?: unknown;
  published?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

type SaveAgentAppInput = PublishAgentAppInput & {
  slugFallback?: string;
};

const APP_SELECT = 'id,workspace_id,name,slug,category,description,long_description,publisher_id,publisher_name,app_url,repository_url,device_targets,manifest,default_config,permissions_required,required_secrets,screenshots,publish_state,source,visibility,runtime_type,kernel_product,kernel_command_topic,kernel_status_topic,last_heartbeat_at,install_count,verified,published,created_at,updated_at';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return items.length > 0 ? items.map(item => item.trim()) : [...fallback];
}

export function normalizeAgentAppSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeVisibility(value: unknown, published?: unknown): AgentAppVisibility {
  if (value === 'public' || value === 'private' || value === 'unlisted') return value;
  if (published === false) return 'private';
  return 'public';
}

function normalizeSource(value: unknown): AgentAppSource {
  return value === 'external_sdk' ? 'external_sdk' : 'internal';
}

function normalizeRuntimeType(value: unknown, manifestRuntime?: unknown): AgentAppRuntimeType {
  if (value === 'external-app' || value === 'workspace-app' || value === 'agentos-app') return value;
  if (manifestRuntime === 'external-app' || manifestRuntime === 'workspace-app') return manifestRuntime;
  return 'agentos-app';
}

function publishedFromVisibility(visibility: AgentAppVisibility): boolean {
  return visibility === 'public';
}

function normalizeManifest(
  value: unknown,
  slug: string,
  defaults: { runtime: AgentAppRuntimeType; entrypoint: string; commands?: Array<{ name: string; description: string }> },
): AgentAppManifest {
  const input = isRecord(value) ? value : {};
  return {
    schemaVersion: 'agentos.app.v1',
    version: stringValue(input.version, '1.0.0'),
    runtime: normalizeRuntimeType(input.runtime, defaults.runtime),
    entrypoint: stringValue(input.entrypoint, defaults.entrypoint),
    primitives: stringArray(input.primitives, []),
    skills: stringArray(input.skills, []),
    permissions: stringArray(input.permissions, []),
    requiredSecrets: stringArray(input.requiredSecrets ?? input.required_secrets, []),
    commands: Array.isArray(input.commands)
      ? input.commands
          .filter(isRecord)
          .map(command => ({
            name: stringValue(command.name, 'run'),
            description: stringValue(command.description, 'Run the app command.'),
          }))
      : defaults.commands ?? [],
  };
}

function normalizeDefaultConfig(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function normalizeLocalApp(row: Partial<AgentAppListing>): AgentAppListing {
  const slug = normalizeAgentAppSlug(String(row.slug ?? ''));
  const runtimeType = normalizeRuntimeType(row.runtimeType, row.manifest?.runtime);
  const visibility = normalizeVisibility(row.visibility, row.published);
  const manifest = normalizeManifest(row.manifest, slug, {
    runtime: runtimeType,
    entrypoint: row.manifest?.entrypoint ?? `agentos://apps/${slug}`,
    commands: row.manifest?.commands ?? [],
  });

  return {
    id: String(row.id ?? randomUUID()),
    workspaceId: row.workspaceId ?? null,
    name: String(row.name ?? slug),
    slug,
    category: String(row.category ?? 'Operations'),
    description: String(row.description ?? ''),
    longDescription: String(row.longDescription ?? row.description ?? ''),
    publisherId: String(row.publisherId ?? ''),
    publisherName: String(row.publisherName ?? row.publisherId ?? 'Unknown'),
    appUrl: row.appUrl ?? null,
    repositoryUrl: row.repositoryUrl ?? null,
    deviceTargets: Array.isArray(row.deviceTargets) ? row.deviceTargets : ['AgentOS Cloud'],
    manifest,
    defaultConfig: normalizeDefaultConfig(row.defaultConfig),
    permissionsRequired: Array.isArray(row.permissionsRequired) ? row.permissionsRequired : [],
    requiredSecrets: Array.isArray(row.requiredSecrets) ? row.requiredSecrets : manifest.requiredSecrets,
    screenshots: Array.isArray(row.screenshots) ? row.screenshots : [],
    source: normalizeSource(row.source),
    visibility,
    runtimeType,
    kernelProduct: row.kernelProduct ?? null,
    kernelCommandTopic: row.kernelCommandTopic ?? null,
    kernelStatusTopic: row.kernelStatusTopic ?? null,
    lastHeartbeatAt: row.lastHeartbeatAt ?? null,
    installCount: Number(row.installCount ?? 0),
    verified: row.verified === true,
    published: publishedFromVisibility(visibility),
    createdAt: String(row.createdAt ?? new Date().toISOString()),
    updatedAt: String(row.updatedAt ?? row.createdAt ?? new Date().toISOString()),
  };
}

function fromDbRow(row: DbAgentAppRow): AgentAppListing {
  const slug = stringValue(row.slug);
  const visibility = normalizeVisibility(row.visibility, row.published);
  const source = normalizeSource(row.source);
  const runtimeType = normalizeRuntimeType(row.runtime_type, isRecord(row.manifest) ? row.manifest.runtime : undefined);
  const description = stringValue(row.description);
  const createdAt = stringValue(row.created_at, new Date().toISOString());
  const manifest = normalizeManifest(row.manifest, slug, {
    runtime: runtimeType,
    entrypoint: runtimeType === 'external-app' ? `agentos://kernel/${stringValue(row.kernel_product, slug)}` : `agentos://apps/${slug}`,
  });

  return {
    id: stringValue(row.id),
    workspaceId: nullableString(row.workspace_id),
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
    permissionsRequired: stringArray(row.permissions_required, []),
    requiredSecrets: stringArray(row.required_secrets, manifest.requiredSecrets),
    screenshots: stringArray(row.screenshots, []),
    source,
    visibility,
    runtimeType,
    kernelProduct: nullableString(row.kernel_product),
    kernelCommandTopic: nullableString(row.kernel_command_topic),
    kernelStatusTopic: nullableString(row.kernel_status_topic),
    lastHeartbeatAt: nullableString(row.last_heartbeat_at),
    installCount: Number(row.install_count ?? 0),
    verified: row.verified === true,
    published: publishedFromVisibility(visibility),
    createdAt,
    updatedAt: stringValue(row.updated_at, createdAt),
  };
}

function toDbPayload(app: AgentAppListing, publishState = 'draft'): Record<string, unknown> {
  return {
    id: app.id,
    workspace_id: app.workspaceId,
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
    permissions_required: app.permissionsRequired,
    required_secrets: app.requiredSecrets,
    screenshots: app.screenshots,
    publish_state: publishState,
    source: app.source,
    visibility: app.visibility,
    runtime_type: app.runtimeType,
    kernel_product: app.kernelProduct,
    kernel_command_topic: app.kernelCommandTopic,
    kernel_status_topic: app.kernelStatusTopic,
    last_heartbeat_at: app.lastHeartbeatAt,
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
    const { data, error } = await supabase.from('agent_apps').select(APP_SELECT);
    if (!error) {
      return ((data ?? []) as DbAgentAppRow[]).map(fromDbRow);
    }
  } catch {
    // Local fallback below.
  }

  const state = await readLocalRuntimeState();
  return (state.agentApps.catalog ?? []).map(normalizeLocalApp);
}

function appMatchesSearch(app: AgentAppListing, search: string): boolean {
  const haystack = [
    app.name,
    app.description,
    app.longDescription,
    app.category,
    app.publisherName,
    app.source,
    app.visibility,
    app.runtimeType,
    app.kernelProduct ?? '',
    ...app.deviceTargets,
    ...app.manifest.primitives,
    ...app.manifest.skills,
    ...app.requiredSecrets,
  ].join(' ').toLowerCase();
  return haystack.includes(search);
}

function compareApps(sort: string, left: AgentAppListing, right: AgentAppListing): number {
  if (sort === 'recent') return right.createdAt.localeCompare(left.createdAt);
  if (sort === 'name') return left.name.localeCompare(right.name);
  return right.installCount - left.installCount;
}

function canAccessHiddenApp(app: AgentAppListing, options: AgentAppAccessOptions): boolean {
  if (options.canManageAll) return true;
  if (options.viewerAgentId && app.publisherId === options.viewerAgentId) return true;
  if (app.workspaceId && Array.isArray(options.viewerWorkspaceIds) && options.viewerWorkspaceIds.includes(app.workspaceId)) return true;
  return false;
}

function canAccessAppBySlug(app: AgentAppListing, options: AgentAppAccessOptions): boolean {
  if (app.visibility === 'public' || app.visibility === 'unlisted') return true;
  return canAccessHiddenApp(app, options);
}

async function saveAgentApp(input: SaveAgentAppInput): Promise<AgentAppListing> {
  const name = input.name?.trim() ?? '';
  const slug = normalizeAgentAppSlug(input.slug?.trim() || input.slugFallback || name);
  const category = input.category?.trim() || 'Operations';
  const description = input.description?.trim() ?? '';
  const publisherId = input.publisherId.trim();
  const source = normalizeSource(input.source);
  const visibility = normalizeVisibility(input.visibility, input.published);
  const runtimeType = normalizeRuntimeType(input.runtimeType, isRecord(input.manifest) ? input.manifest.runtime : undefined);

  if (!name || !slug || !category || !description || !publisherId) {
    throw new ValidationError('Missing required fields: name, category, description');
  }

  const now = new Date().toISOString();
  const apps = await loadStoredApps();
  const existing = apps.find(app =>
    app.slug === slug
    || (input.kernelProduct && app.kernelProduct === String(input.kernelProduct))
  );

  const entrypoint = source === 'external_sdk'
    ? `agentos://kernel/${String(input.kernelProduct ?? slug)}`
    : runtimeType === 'workspace-app'
      ? `agentos://workspace/${slug}`
      : `agentos://apps/${slug}`;
  const manifest = normalizeManifest(input.manifest, slug, {
    runtime: runtimeType,
    entrypoint,
  });

  const app: AgentAppListing = {
    id: existing?.id ?? randomUUID(),
    workspaceId: input.workspaceId ?? existing?.workspaceId ?? null,
    name,
    slug,
    category: AGENT_APP_CATEGORIES.includes(category) && category !== 'All' ? category : category,
    description,
    longDescription: input.longDescription?.trim() || existing?.longDescription || description,
    publisherId,
    publisherName: input.publisherName?.trim() || existing?.publisherName || publisherId,
    appUrl: nullableString(input.appUrl) ?? existing?.appUrl ?? null,
    repositoryUrl: nullableString(input.repositoryUrl) ?? existing?.repositoryUrl ?? null,
    deviceTargets: stringArray(input.deviceTargets, existing?.deviceTargets ?? AGENT_APP_DEVICE_TARGETS.slice(0, 2)),
    manifest: {
      ...manifest,
      commands: manifest.commands.length > 0 ? manifest.commands : existing?.manifest.commands ?? [],
    },
    defaultConfig: normalizeDefaultConfig(input.defaultConfig),
    permissionsRequired: stringArray(input.permissionsRequired, existing?.permissionsRequired ?? []),
    requiredSecrets: stringArray(input.requiredSecrets, manifest.requiredSecrets),
    screenshots: stringArray(input.screenshots, existing?.screenshots ?? []),
    source,
    visibility,
    runtimeType,
    kernelProduct: nullableString(input.kernelProduct) ?? existing?.kernelProduct ?? null,
    kernelCommandTopic: nullableString(input.kernelCommandTopic) ?? existing?.kernelCommandTopic ?? null,
    kernelStatusTopic: nullableString(input.kernelStatusTopic) ?? existing?.kernelStatusTopic ?? null,
    lastHeartbeatAt: nullableString(input.lastHeartbeatAt) ?? existing?.lastHeartbeatAt ?? null,
    installCount: existing?.installCount ?? 0,
    verified: existing?.verified ?? false,
    published: publishedFromVisibility(visibility),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const publishState = input.publishState && ['draft', 'submitted', 'published', 'rejected'].includes(input.publishState)
    ? input.publishState
    : app.published
      ? 'published'
      : 'draft';

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('agent_apps')
      .upsert(toDbPayload(app, publishState), { onConflict: 'slug' })
      .select(APP_SELECT)
      .single();

    if (!error && data) return fromDbRow(data as DbAgentAppRow);
    if (error?.code === '23505' || error?.message?.toLowerCase().includes('duplicate')) {
      throw new ValidationError('App slug already exists');
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
  }

  return updateLocalRuntimeState(state => {
    const index = state.agentApps.catalog.findIndex(item =>
      item.slug === slug
      || (app.kernelProduct && item.kernelProduct === app.kernelProduct)
    );
    if (index >= 0) {
      state.agentApps.catalog[index] = app;
      return app;
    }
    state.agentApps.catalog.unshift(app);
    return app;
  });
}

export async function listAgentApps(options: ListAgentAppsOptions = {}): Promise<AgentAppListing[]> {
  const category = options.category?.trim();
  const search = options.search?.trim().toLowerCase() ?? '';
  const sort = options.sort?.trim() || 'popular';
  const publisherId = options.publisherId?.trim();
  const source = options.source?.trim();
  const runtimeType = options.runtimeType?.trim();
  const visibility = options.visibility?.trim();
  let apps = await loadStoredApps();

  if (publisherId) {
    apps = apps.filter(app => app.publisherId === publisherId);
  }

  apps = apps.filter(app => {
    if (source && source !== 'all' && app.source !== source) return false;
    if (runtimeType && runtimeType !== 'all' && app.runtimeType !== runtimeType) return false;
    if (visibility && visibility !== 'all' && app.visibility !== visibility) return false;
    if (!options.includeHidden) return app.visibility === 'public';
    return app.visibility === 'public' || canAccessHiddenApp(app, options);
  });

  if (category && category !== 'All' && category.toLowerCase() !== 'all') {
    apps = apps.filter(app => app.category.toLowerCase() === category.toLowerCase());
  }

  if (search) {
    apps = apps.filter(app => appMatchesSearch(app, search));
  }

  return apps.sort((left, right) => compareApps(sort, left, right));
}

export async function getAgentAppBySlug(slug: string, options: AgentAppAccessOptions = {}): Promise<AgentAppListing | null> {
  const normalizedSlug = normalizeAgentAppSlug(slug);
  const apps = await loadStoredApps();
  const app = apps.find(item => item.slug === normalizedSlug) ?? null;
  if (!app) return null;
  return canAccessAppBySlug(app, options) ? app : null;
}

export async function publishAgentApp(input: PublishAgentAppInput): Promise<AgentAppListing> {
  return saveAgentApp({
    ...input,
    source: input.source ?? 'internal',
    runtimeType: input.runtimeType ?? (isRecord(input.manifest) ? input.manifest.runtime : 'agentos-app'),
    visibility: input.visibility ?? (input.published === false ? 'private' : 'public'),
  });
}

export async function upsertExternalSdkAgentApp(input: {
  workspaceId: string | null;
  publisherId: string;
  publisherName?: string;
  product: string;
  commandTopic: string;
  statusTopic: string;
  availableCommands: Array<{ name: string; description?: string }>;
  app?: {
    name?: string;
    slug?: string;
    category?: string;
    description?: string;
    longDescription?: string;
    appUrl?: string;
    repositoryUrl?: string;
    deviceTargets?: string[];
    manifest?: Record<string, unknown>;
    defaultConfig?: Record<string, unknown>;
    visibility?: AgentAppVisibility;
  };
}): Promise<AgentAppListing> {
  const product = input.product.trim();
  const defaultName = input.app?.name?.trim() || product;
  const slug = normalizeAgentAppSlug(input.app?.slug?.trim() || product);
  const commands = input.availableCommands.map(command => ({
    name: command.name,
    description: command.description?.trim() || `Run ${command.name}`,
  }));

  return saveAgentApp({
    workspaceId: input.workspaceId,
    publisherId: input.publisherId,
    publisherName: input.publisherName,
    name: defaultName,
    slug,
    slugFallback: product,
    category: input.app?.category ?? 'Operations',
    description: input.app?.description ?? `External SDK app for ${product}.`,
    longDescription: input.app?.longDescription ?? input.app?.description ?? `External SDK app for ${product}.`,
    appUrl: input.app?.appUrl ?? null,
    repositoryUrl: input.app?.repositoryUrl ?? null,
    deviceTargets: input.app?.deviceTargets ?? ['AgentOS Cloud'],
    manifest: {
      ...input.app?.manifest,
      runtime: input.app?.manifest?.runtime ?? 'external-app',
      entrypoint: input.app?.manifest?.entrypoint ?? `agentos://kernel/${product}`,
      commands: Array.isArray(input.app?.manifest?.commands) && input.app?.manifest?.commands.length > 0
        ? input.app?.manifest?.commands
        : commands,
    },
    defaultConfig: input.app?.defaultConfig ?? {},
    visibility: input.app?.visibility ?? 'public',
    source: 'external_sdk',
    runtimeType: 'external-app',
    kernelProduct: product,
    kernelCommandTopic: input.commandTopic,
    kernelStatusTopic: input.statusTopic,
    lastHeartbeatAt: new Date().toISOString(),
    requiredSecrets: input.app?.manifest?.requiredSecrets,
  });
}

export async function updateAgentAppVisibility(params: {
  slug: string;
  publisherId?: string;
  visibility: AgentAppVisibility;
  canManageAll?: boolean;
}): Promise<AgentAppListing> {
  const normalizedSlug = normalizeAgentAppSlug(params.slug);
  const now = new Date().toISOString();

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('agent_apps')
      .update({
        visibility: params.visibility,
        published: publishedFromVisibility(params.visibility),
        updated_at: now,
      })
      .eq('slug', normalizedSlug);

    if (!params.canManageAll) {
      query = query.eq('publisher_id', params.publisherId ?? '');
    }

    const { data, error } = await query.select(APP_SELECT).maybeSingle();
    if (!error && data) return fromDbRow(data as DbAgentAppRow);
  } catch {
    // Local fallback below.
  }

  return updateLocalRuntimeState(state => {
    const app = state.agentApps.catalog.find(item => item.slug === normalizedSlug);
    if (!app || (!params.canManageAll && app.publisherId !== params.publisherId)) {
      throw new ValidationError('App not found');
    }
    app.visibility = params.visibility;
    app.published = publishedFromVisibility(params.visibility);
    app.updatedAt = now;
    return app;
  });
}

export async function recordAgentAppDownload(slug: string): Promise<void> {
  const normalizedSlug = normalizeAgentAppSlug(slug);
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

export async function installAgentApp(params: {
  agentId: string;
  slug: string;
  workspaceId?: string | null;
  viewerWorkspaceIds?: string[];
  canManageAll?: boolean;
}): Promise<{ app: AgentAppListing; installation: Record<string, unknown> }> {
  const app = await getAgentAppBySlug(params.slug, {
    viewerAgentId: params.agentId,
    viewerWorkspaceIds: params.viewerWorkspaceIds,
    canManageAll: params.canManageAll,
  });
  if (!app) throw new ValidationError('App not found');
  if (app.visibility === 'private' && !canAccessHiddenApp(app, {
    viewerAgentId: params.agentId,
    viewerWorkspaceIds: params.viewerWorkspaceIds,
    canManageAll: params.canManageAll,
  })) {
    throw new ValidationError('App not found');
  }

  const now = new Date().toISOString();
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('app_installations')
      .upsert({
        id: randomUUID(),
        app_id: app.id,
        agent_id: params.agentId,
        workspace_id: params.workspaceId ?? app.workspaceId ?? null,
        status: 'active',
        installed_at: now,
        updated_at: now,
      }, { onConflict: 'app_id,agent_id' })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    await recordAgentAppDownload(app.slug);
    return {
      app,
      installation: (data as Record<string, unknown>) ?? {},
    };
  } catch {
    await recordAgentAppDownload(app.slug);
    return {
      app,
      installation: {
        id: randomUUID(),
        app_id: app.id,
        agent_id: params.agentId,
        workspace_id: params.workspaceId ?? app.workspaceId ?? null,
        status: 'active',
        installed_at: now,
        updated_at: now,
      },
    };
  }
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
