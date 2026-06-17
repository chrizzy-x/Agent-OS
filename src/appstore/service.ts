import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { getPlanDescriptor } from '../auth/capabilities.js';
import { isValidPlan, normalizePersistedPlan, normalizePlan } from '../auth/tiers.js';
import { readLocalRuntimeState, updateLocalRuntimeState } from '../storage/local-state.js';
import { AppUnavailableError, PermissionError, ValidationError } from '../utils/errors.js';
import { validateRequiredSecrets } from '../vault/service.js';
import {
  AGENT_APP_CATEGORIES,
  AGENT_APP_DEVICE_TARGETS,
  type AgentAppHealthStatus,
  type AgentAppInstallation,
  type AgentAppListing,
  type AgentAppManifest,
  type AgentAppEndpointStatus,
  type AgentAppRuntimeType,
  type AgentAppSource,
  type AgentAppVersionEntry,
  type AgentAppVisibility,
} from './catalog.js';

export type AgentAppSort = 'popular' | 'recent' | 'name';
export type AgentAppOpenTarget = 'web' | 'android' | 'ios';
export type AgentAppDeviceInstallTarget = 'android' | 'ios' | 'desktop' | 'pwa';

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
  lastCommandAt?: unknown;
  lastError?: unknown;
  healthStatus?: unknown;
  endpointStatus?: unknown;
  disabled?: unknown;
  heartbeatCount?: unknown;
  openCount?: unknown;
  webOpenCount?: unknown;
  androidDownloadCount?: unknown;
  iosDownloadCount?: unknown;
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

export type AgentAppDeviceInstallResult = {
  workspaceInstalled: true;
  deviceInstalled: true;
  target: AgentAppDeviceInstallTarget;
  supportedDeviceTargets: AgentAppDeviceInstallTarget[];
  packageCachedForOfflineInstall: boolean;
  packageRef: string;
  app: AgentAppListing;
  installation: AgentAppInstallation;
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
  last_command_at?: unknown;
  last_error?: unknown;
  health_status?: unknown;
  endpoint_status?: unknown;
  disabled?: unknown;
  heartbeat_count?: unknown;
  open_count?: unknown;
  web_open_count?: unknown;
  android_download_count?: unknown;
  ios_download_count?: unknown;
  install_count?: unknown;
  verified?: unknown;
  published?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

type DbAppInstallationRow = {
  id?: unknown;
  app_id?: unknown;
  agent_id?: unknown;
  workspace_id?: unknown;
  status?: unknown;
  favorite?: unknown;
  permissions_approved?: unknown;
  open_count?: unknown;
  last_opened_at?: unknown;
  installed_at?: unknown;
  updated_at?: unknown;
  installed_version?: unknown;
};

type DbAgentAppVersionRow = {
  id?: unknown;
  app_id?: unknown;
  version?: unknown;
  change_summary?: unknown;
  created_at?: unknown;
};

type DbKernelRegistryRow = {
  agent_id?: unknown;
  workspace_id?: unknown;
  product?: unknown;
  command_topic?: unknown;
  status_topic?: unknown;
  available_commands?: unknown;
  status?: unknown;
  health_status?: unknown;
  endpoint_status?: unknown;
  version?: unknown;
  registered_at?: unknown;
  last_heartbeat_at?: unknown;
  last_status_payload?: unknown;
  last_error?: unknown;
  disabled?: unknown;
  heartbeat_count?: unknown;
};

type SaveAgentAppInput = PublishAgentAppInput & {
  slugFallback?: string;
};

const APP_SELECT = 'id,workspace_id,name,slug,category,description,long_description,publisher_id,publisher_name,app_url,repository_url,device_targets,manifest,default_config,permissions_required,required_secrets,screenshots,publish_state,source,visibility,runtime_type,kernel_product,kernel_command_topic,kernel_status_topic,last_heartbeat_at,last_command_at,last_error,health_status,endpoint_status,disabled,heartbeat_count,open_count,web_open_count,android_download_count,ios_download_count,install_count,verified,published,created_at,updated_at';
const APP_SELECT_LEGACY = 'id,workspace_id,name,slug,category,description,long_description,publisher_id,publisher_name,app_url,repository_url,device_targets,manifest,default_config,permissions_required,required_secrets,screenshots,publish_state,source,visibility,runtime_type,kernel_product,kernel_command_topic,kernel_status_topic,last_heartbeat_at,install_count,verified,published,created_at,updated_at';
const APP_SELECT_PRE_019 = 'id,name,slug,category,description,long_description,publisher_id,publisher_name,app_url,repository_url,device_targets,manifest,default_config,publish_state,permissions_required,required_secrets,install_count,verified,published,created_at,updated_at';
const APP_INSTALLATION_SELECT = 'id,app_id,agent_id,workspace_id,status,favorite,permissions_approved,open_count,last_opened_at,installed_at,updated_at,installed_version';
const APP_INSTALLATION_SELECT_LEGACY = 'id,app_id,agent_id,workspace_id,status,installed_at,updated_at,installed_version';
const APP_VERSION_SELECT = 'id,app_id,version,change_summary,created_at';
const KERNEL_REGISTRY_DISCOVERY_SELECT = 'agent_id,workspace_id,product,command_topic,status_topic,available_commands,status,health_status,endpoint_status,version,registered_at,last_heartbeat_at,last_error,disabled,heartbeat_count';
const KERNEL_REGISTRY_DISCOVERY_SELECT_LEGACY = 'agent_id,workspace_id,product,command_topic,status_topic,available_commands,status,registered_at,last_heartbeat_at,last_status_payload';
const KERNEL_REGISTRY_DISCOVERY_SELECT_PRE_WORKSPACE = 'agent_id,product,command_topic,status_topic,available_commands,status,registered_at,last_heartbeat_at,last_status_payload';

function allowLocalAppstoreFallback(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.AGENTOS_ALLOW_LOCAL_APPSTORE_FALLBACK === '1';
}

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

function titleCaseSlug(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildSdkFallbackDescription(product: string): string {
  return `External SDK runtime for ${titleCaseSlug(product)}.`;
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
  if (value === 'public' || value === 'private' || value === 'workspace') return value;
  if (value === 'unlisted') return 'workspace';
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

function normalizeHealthStatus(value: unknown): AgentAppHealthStatus {
  if (value === 'online' || value === 'offline' || value === 'degraded' || value === 'disabled' || value === 'unknown') return value;
  return 'unknown';
}

function normalizeEndpointStatus(value: unknown): AgentAppEndpointStatus {
  if (value === 'healthy' || value === 'offline' || value === 'degraded' || value === 'disabled' || value === 'unknown') return value;
  return 'unknown';
}

function normalizeDistribution(value: unknown, appUrl: string | null): { webUrl: string | null; androidUrl: string | null; iosUrl: string | null } {
  const input = isRecord(value) ? value : {};
  return {
    webUrl: nullableString(input.webUrl ?? input.web_url) ?? appUrl,
    androidUrl: nullableString(input.androidUrl ?? input.android_url),
    iosUrl: nullableString(input.iosUrl ?? input.ios_url),
  };
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
    requiredSkills: stringArray(input.requiredSkills ?? input.required_skills, []),
    bundledSkills: stringArray(input.bundledSkills ?? input.bundled_skills, []),
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
    distribution: normalizeDistribution(input.distribution, null),
  };
}

function normalizeDefaultConfig(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function normalizePermissionName(permission: string): string {
  return permission.trim().toLowerCase().replace(/^access[_:-]?/, '');
}

function resolveTargetUrl(app: AgentAppListing, target: AgentAppOpenTarget): string | null {
  if (target === 'android') return app.distribution.androidUrl;
  if (target === 'ios') return app.distribution.iosUrl;
  return app.distribution.webUrl ?? app.appUrl;
}

function resolveAvailableTargets(app: AgentAppListing): Array<{ target: AgentAppOpenTarget; url: string }> {
  const targets: Array<{ target: AgentAppOpenTarget; url: string }> = [];
  const webUrl = resolveTargetUrl(app, 'web');
  const androidUrl = resolveTargetUrl(app, 'android');
  const iosUrl = resolveTargetUrl(app, 'ios');
  if (webUrl) targets.push({ target: 'web', url: webUrl });
  if (androidUrl) targets.push({ target: 'android', url: androidUrl });
  if (iosUrl) targets.push({ target: 'ios', url: iosUrl });
  return targets;
}

function mapVersionRow(row: DbAgentAppVersionRow): AgentAppVersionEntry {
  return {
    id: stringValue(row.id),
    version: stringValue(row.version, '1.0.0'),
    changeSummary: nullableString(row.change_summary),
    createdAt: stringValue(row.created_at, new Date().toISOString()),
  };
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
  const appUrl = row.appUrl ?? null;
  const distribution = normalizeDistribution(row.manifest?.distribution, typeof appUrl === 'string' ? appUrl : null);

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
    appUrl,
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
    distribution,
    healthStatus: normalizeHealthStatus(row.healthStatus),
    endpointStatus: normalizeEndpointStatus(row.endpointStatus),
    lastHeartbeatAt: row.lastHeartbeatAt ?? null,
    lastCommandAt: row.lastCommandAt ?? null,
    lastError: row.lastError ?? null,
    disabled: row.disabled === true,
    heartbeatCount: Number(row.heartbeatCount ?? 0),
    openCount: Number(row.openCount ?? 0),
    webOpenCount: Number(row.webOpenCount ?? 0),
    androidDownloadCount: Number(row.androidDownloadCount ?? 0),
    iosDownloadCount: Number(row.iosDownloadCount ?? 0),
    installCount: Number(row.installCount ?? 0),
    verified: row.verified === true,
    published: publishedFromVisibility(visibility),
    createdAt: String(row.createdAt ?? new Date().toISOString()),
    updatedAt: String(row.updatedAt ?? row.createdAt ?? new Date().toISOString()),
    versionHistory: Array.isArray(row.versionHistory) ? row.versionHistory : [],
  };
}

function fromDbRow(row: DbAgentAppRow): AgentAppListing {
  const slug = stringValue(row.slug);
  const visibility = normalizeVisibility(row.visibility, row.published);
  const runtimeType = normalizeRuntimeType(row.runtime_type, isRecord(row.manifest) ? row.manifest.runtime : undefined);
  const source = normalizeSource(row.source ?? (runtimeType === 'external-app' ? 'external_sdk' : 'internal'));
  const description = stringValue(row.description);
  const createdAt = stringValue(row.created_at, new Date().toISOString());
  const manifest = normalizeManifest(row.manifest, slug, {
    runtime: runtimeType,
    entrypoint: runtimeType === 'external-app' ? `agentos://kernel/${stringValue(row.kernel_product, slug)}` : `agentos://apps/${slug}`,
  });
  const appUrl = nullableString(row.app_url);
  const distribution = normalizeDistribution(manifest.distribution, appUrl);
  const inferredKernelProduct = source === 'external_sdk' && manifest.entrypoint.startsWith('agentos://kernel/')
    ? manifest.entrypoint.slice('agentos://kernel/'.length)
    : null;

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
    appUrl,
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
    kernelProduct: nullableString(row.kernel_product) ?? inferredKernelProduct,
    kernelCommandTopic: nullableString(row.kernel_command_topic),
    kernelStatusTopic: nullableString(row.kernel_status_topic),
    distribution,
    healthStatus: normalizeHealthStatus(row.health_status),
    endpointStatus: normalizeEndpointStatus(row.endpoint_status),
    lastHeartbeatAt: nullableString(row.last_heartbeat_at),
    lastCommandAt: nullableString(row.last_command_at),
    lastError: nullableString(row.last_error),
    disabled: row.disabled === true,
    heartbeatCount: Number(row.heartbeat_count ?? 0),
    openCount: Number(row.open_count ?? 0),
    webOpenCount: Number(row.web_open_count ?? 0),
    androidDownloadCount: Number(row.android_download_count ?? 0),
    iosDownloadCount: Number(row.ios_download_count ?? 0),
    installCount: Number(row.install_count ?? 0),
    verified: row.verified === true,
    published: publishedFromVisibility(visibility),
    createdAt,
    updatedAt: stringValue(row.updated_at, createdAt),
    versionHistory: [],
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
    last_command_at: app.lastCommandAt,
    last_error: app.lastError,
    health_status: app.healthStatus,
    endpoint_status: app.endpointStatus,
    disabled: app.disabled,
    heartbeat_count: app.heartbeatCount,
    open_count: app.openCount,
    web_open_count: app.webOpenCount,
    android_download_count: app.androidDownloadCount,
    ios_download_count: app.iosDownloadCount,
    install_count: app.installCount,
    verified: app.verified,
    published: app.published,
    created_at: app.createdAt,
    updated_at: app.updatedAt,
  };
}

function toLegacyDbPayload(app: AgentAppListing, publishState = 'draft'): Record<string, unknown> {
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

function toPre019DbPayload(app: AgentAppListing, publishState = 'draft'): Record<string, unknown> {
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
    publish_state: publishState,
    permissions_required: app.permissionsRequired,
    required_secrets: app.requiredSecrets,
    install_count: app.installCount,
    verified: app.verified,
    published: app.published,
    created_at: app.createdAt,
    updated_at: app.updatedAt,
  };
}

async function loadAppVersionHistory(appIds: string[]): Promise<Map<string, AgentAppVersionEntry[]>> {
  const history = new Map<string, AgentAppVersionEntry[]>();
  const normalizedIds = [...new Set(appIds.filter(Boolean))];
  if (normalizedIds.length === 0) return history;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('agent_app_versions')
      .select(APP_VERSION_SELECT)
      .in('app_id', normalizedIds)
      .order('created_at', { ascending: false });
    if (!error) {
      for (const row of (data ?? []) as DbAgentAppVersionRow[]) {
        const appId = stringValue(row.app_id);
        const entry = mapVersionRow(row);
        const existing = history.get(appId) ?? [];
        existing.push(entry);
        history.set(appId, existing);
      }
      return history;
    }
  } catch {
    // Fall back to local state below.
  }

  const state = await readLocalRuntimeState();
  for (const app of state.agentApps.catalog) {
    if (!normalizedIds.includes(app.id)) continue;
    history.set(app.id, Array.isArray(app.versionHistory) ? [...app.versionHistory] : []);
  }
  return history;
}

async function attachAppVersionHistory(apps: AgentAppListing[]): Promise<AgentAppListing[]> {
  const history = await loadAppVersionHistory(apps.map(app => app.id));
  return apps.map(app => ({
    ...app,
    versionHistory: history.get(app.id) ?? [],
  }));
}

async function loadStoredApps(): Promise<AgentAppListing[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('agent_apps').select(APP_SELECT);
    if (!error) {
      return attachAppVersionHistory(((data ?? []) as DbAgentAppRow[]).map(fromDbRow));
    }
    const legacy = await supabase.from('agent_apps').select(APP_SELECT_LEGACY);
    if (!legacy.error) {
      return attachAppVersionHistory(((legacy.data ?? []) as DbAgentAppRow[]).map(fromDbRow));
    }
    const pre019 = await supabase.from('agent_apps').select(APP_SELECT_PRE_019);
    if (!pre019.error) {
      return attachAppVersionHistory(((pre019.data ?? []) as DbAgentAppRow[]).map(fromDbRow));
    }
  } catch {
    // Local fallback below.
  }

  if (!allowLocalAppstoreFallback()) return [];
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
    ...app.manifest.requiredSkills,
    ...app.manifest.bundledSkills,
    ...app.requiredSecrets,
  ].join(' ').toLowerCase();
  return haystack.includes(search);
}

function compareApps(sort: string, left: AgentAppListing, right: AgentAppListing): number {
  if (sort === 'recent') return right.createdAt.localeCompare(left.createdAt);
  if (sort === 'name') return left.name.localeCompare(right.name);
  return right.installCount - left.installCount;
}

function mapInstallationRow(row: DbAppInstallationRow): AgentAppInstallation {
  return {
    id: stringValue(row.id),
    appId: stringValue(row.app_id),
    agentId: stringValue(row.agent_id),
    workspaceId: nullableString(row.workspace_id),
    status: row.status === 'disabled' || row.status === 'removed' ? row.status : 'active',
    favorite: row.favorite === true,
    permissionsApproved: stringArray(row.permissions_approved, []),
    openCount: Number(row.open_count ?? 0),
    lastOpenedAt: nullableString(row.last_opened_at),
    installedAt: stringValue(row.installed_at, new Date().toISOString()),
    updatedAt: stringValue(row.updated_at, new Date().toISOString()),
    installedVersion: nullableString(row.installed_version),
    updateAvailable: false,
  };
}

function collectRequiredSkills(app: AgentAppListing): string[] {
  return [...new Set([...app.manifest.requiredSkills, ...app.manifest.skills].filter(Boolean))];
}

async function listInstalledSkillSlugs(agentId: string): Promise<string[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('skill_installations')
      .select('skill:skills(slug)')
      .eq('agent_id', agentId);
    if (!error) {
      return ((data ?? []) as Array<{ skill?: { slug?: string } | null }>)
        .map(row => row.skill?.slug)
        .filter((slug): slug is string => typeof slug === 'string' && slug.trim().length > 0);
    }
  } catch {
    // Local fallback below.
  }

  const state = await readLocalRuntimeState();
  return (state.skills.installations[agentId] ?? [])
    .map(installation => state.skills.catalog.find(skill => skill.id === installation.skill_id)?.slug ?? '')
    .filter(Boolean);
}

function canAccessPrivateApp(app: AgentAppListing, options: AgentAppAccessOptions): boolean {
  if (options.canManageAll) return true;
  if (options.viewerAgentId && app.publisherId === options.viewerAgentId) return true;
  return false;
}

function canAccessWorkspaceApp(app: AgentAppListing, options: AgentAppAccessOptions): boolean {
  if (canAccessPrivateApp(app, options)) return true;
  if (app.workspaceId && Array.isArray(options.viewerWorkspaceIds) && options.viewerWorkspaceIds.includes(app.workspaceId)) return true;
  return false;
}

function canManageDisabledApp(app: AgentAppListing, options: AgentAppAccessOptions): boolean {
  if (options.canManageAll) return true;
  return Boolean(options.viewerAgentId && app.publisherId === options.viewerAgentId);
}

function isInternalVerificationSdkIdentity(value: string | null | undefined): boolean {
  const normalized = normalizeAgentAppSlug(String(value ?? ''));
  return normalized.startsWith('direct-debug-sdk-')
    || normalized.startsWith('prod-verification-sdk-')
    || normalized.startsWith('qa-verification-sdk-');
}

function isInternalVerificationSdkListing(app: AgentAppListing): boolean {
  return app.source === 'external_sdk'
    && (
      isInternalVerificationSdkIdentity(app.slug)
      || isInternalVerificationSdkIdentity(app.kernelProduct)
      || isInternalVerificationSdkIdentity(app.name)
    );
}

function isPublicMarketplaceApp(app: AgentAppListing): boolean {
  return app.visibility === 'public'
    && app.published
    && !app.disabled
    && !isInternalVerificationSdkListing(app);
}

function canAccessAppByVisibility(app: AgentAppListing, options: AgentAppAccessOptions): boolean {
  if (app.visibility === 'public') return true;
  if (app.visibility === 'workspace') return canAccessWorkspaceApp(app, options);
  return canAccessPrivateApp(app, options);
}

function canAccessAppBySlug(app: AgentAppListing, options: AgentAppAccessOptions): boolean {
  if (isInternalVerificationSdkListing(app) && !canManageDisabledApp(app, options)) return false;
  if (app.disabled && !canManageDisabledApp(app, options)) return false;
  return canAccessAppByVisibility(app, options);
}

function getAppUnavailableReason(app: AgentAppListing): string | null {
  return app.disabled ? 'App is disabled and unavailable.' : null;
}

function ensureSdkDiscoveryMetadata(input: SaveAgentAppInput, manifest: AgentAppManifest): void {
  const manifestInput = isRecord(input.manifest) ? input.manifest : {};
  const distribution = isRecord(manifestInput.distribution) ? manifestInput.distribution : {};
  const launchTargets = [
    nullableString(input.appUrl),
    nullableString(distribution.webUrl),
    nullableString(distribution.androidUrl),
    nullableString(distribution.iosUrl),
    nullableString(manifest.entrypoint),
  ].filter(Boolean);
  if (!input.name?.trim()) throw new ValidationError('SDK app name is required');
  if (!input.description?.trim()) throw new ValidationError('SDK app description is required');
  if (!input.kernelProduct || !String(input.kernelProduct).trim()) throw new ValidationError('SDK product is required');
  if (!input.kernelCommandTopic || !String(input.kernelCommandTopic).trim()) throw new ValidationError('SDK command topic is required');
  if (!input.kernelStatusTopic || !String(input.kernelStatusTopic).trim()) throw new ValidationError('SDK status topic is required');
  if (!manifest.version.trim()) throw new ValidationError('SDK app version is required');
  if (stringArray(input.deviceTargets, []).length === 0) throw new ValidationError('SDK device targets are required');
  if (launchTargets.length === 0) throw new ValidationError('SDK apps need at least one web, Android, or iOS target');
}

async function persistAgentAppVersion(app: AgentAppListing, changeSummary: string | null = null): Promise<void> {
  const entry: AgentAppVersionEntry = {
    id: randomUUID(),
    version: app.manifest.version,
    changeSummary,
    createdAt: new Date().toISOString(),
  };

  try {
    const supabase = getSupabaseAdmin();
    await supabase
      .from('agent_app_versions')
      .upsert({
        id: entry.id,
        app_id: app.id,
        version: entry.version,
        change_summary: entry.changeSummary,
        manifest: app.manifest,
        created_at: entry.createdAt,
      }, { onConflict: 'app_id,version' });
    return;
  } catch {
    // Local fallback below.
  }

  await updateLocalRuntimeState(state => {
    const target = state.agentApps.catalog.find(item => item.id === app.id);
    if (!target) return;
    target.versionHistory ??= [];
    if (!target.versionHistory.some(item => item.version === entry.version)) {
      target.versionHistory.unshift(entry);
    }
  });
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
  if (source === 'external_sdk') {
    ensureSdkDiscoveryMetadata(input, manifest);
  }
  const appUrl = nullableString(input.appUrl) ?? existing?.appUrl ?? null;
  const distribution = normalizeDistribution(manifest.distribution, appUrl);
  const versionChanged = !existing || existing.manifest.version !== manifest.version;

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
    appUrl,
    repositoryUrl: nullableString(input.repositoryUrl) ?? existing?.repositoryUrl ?? null,
    deviceTargets: stringArray(input.deviceTargets, existing?.deviceTargets ?? AGENT_APP_DEVICE_TARGETS.slice(0, 2)),
    manifest: {
      ...manifest,
      commands: manifest.commands.length > 0 ? manifest.commands : existing?.manifest.commands ?? [],
      distribution,
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
    distribution,
    healthStatus: normalizeHealthStatus(input.healthStatus ?? existing?.healthStatus ?? (source === 'external_sdk' ? 'online' : 'unknown')),
    endpointStatus: normalizeEndpointStatus(input.endpointStatus ?? existing?.endpointStatus ?? (source === 'external_sdk' ? 'healthy' : 'unknown')),
    lastHeartbeatAt: nullableString(input.lastHeartbeatAt) ?? existing?.lastHeartbeatAt ?? null,
    lastCommandAt: nullableString(input.lastCommandAt) ?? existing?.lastCommandAt ?? null,
    lastError: nullableString(input.lastError) ?? existing?.lastError ?? null,
    disabled: typeof input.disabled === 'boolean' ? input.disabled : existing?.disabled ?? false,
    heartbeatCount: Number(input.heartbeatCount ?? existing?.heartbeatCount ?? 0),
    openCount: Number(input.openCount ?? existing?.openCount ?? 0),
    webOpenCount: Number(input.webOpenCount ?? existing?.webOpenCount ?? 0),
    androidDownloadCount: Number(input.androidDownloadCount ?? existing?.androidDownloadCount ?? 0),
    iosDownloadCount: Number(input.iosDownloadCount ?? existing?.iosDownloadCount ?? 0),
    installCount: existing?.installCount ?? 0,
    verified: existing?.verified ?? false,
    published: publishedFromVisibility(visibility),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    versionHistory: existing?.versionHistory ?? [],
  };

  const publishState = input.publishState && ['draft', 'submitted', 'published', 'rejected'].includes(input.publishState)
    ? input.publishState
    : app.published
      ? 'published'
      : 'draft';

  try {
    const supabase = getSupabaseAdmin();
    const primary = await supabase
      .from('agent_apps')
      .upsert(toDbPayload(app, publishState), { onConflict: 'slug' })
      .select(APP_SELECT)
      .single();

    if (!primary.error && primary.data) {
      const stored = fromDbRow(primary.data as DbAgentAppRow);
      if (versionChanged) await persistAgentAppVersion(stored);
      const [hydrated] = await attachAppVersionHistory([stored]);
      return hydrated;
    }
    const legacy = await supabase
      .from('agent_apps')
      .upsert(toLegacyDbPayload(app, publishState), { onConflict: 'slug' })
      .select(APP_SELECT_LEGACY)
      .single();

    if (!legacy.error && legacy.data) {
      const stored = fromDbRow(legacy.data as DbAgentAppRow);
      if (versionChanged) await persistAgentAppVersion(stored);
      const [hydrated] = await attachAppVersionHistory([stored]);
      return hydrated;
    }
    const pre019 = await supabase
      .from('agent_apps')
      .upsert(toPre019DbPayload(app, publishState), { onConflict: 'slug' })
      .select(APP_SELECT_PRE_019)
      .single();

    if (!pre019.error && pre019.data) {
      const stored = fromDbRow(pre019.data as DbAgentAppRow);
      if (versionChanged) await persistAgentAppVersion(stored);
      const [hydrated] = await attachAppVersionHistory([stored]);
      return hydrated;
    }
    const upsertError = primary.error ?? legacy.error ?? pre019.error;
    if (upsertError?.code === '23505' || upsertError?.message?.toLowerCase().includes('duplicate')) {
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
    const versionEntry: AgentAppVersionEntry = {
      id: randomUUID(),
      version: app.manifest.version,
      changeSummary: null,
      createdAt: now,
    };
    app.versionHistory = existing?.versionHistory ?? [];
    if (versionChanged && !app.versionHistory.some(item => item.version === versionEntry.version)) {
      app.versionHistory = [versionEntry, ...app.versionHistory];
    }
    if (index >= 0) {
      state.agentApps.catalog[index] = app;
      return app;
    }
    state.agentApps.catalog.unshift(app);
    return app;
  });
}

async function reconcileLegacySdkApps(existingApps: AgentAppListing[]): Promise<AgentAppListing[]> {
  try {
    const supabase = getSupabaseAdmin();
    const primary = await supabase
      .from('kernel_registry')
      .select(KERNEL_REGISTRY_DISCOVERY_SELECT)
      .order('registered_at', { ascending: false });
    const legacy = primary.error
      ? await supabase
        .from('kernel_registry')
        .select(KERNEL_REGISTRY_DISCOVERY_SELECT_LEGACY)
        .order('registered_at', { ascending: false })
      : { data: primary.data, error: primary.error };
    const preWorkspace = legacy.error
      ? await supabase
        .from('kernel_registry')
        .select(KERNEL_REGISTRY_DISCOVERY_SELECT_PRE_WORKSPACE)
        .order('registered_at', { ascending: false })
      : { data: legacy.data ?? primary.data, error: legacy.error };
    const registryRows = (preWorkspace.data ?? legacy.data ?? primary.data) as DbKernelRegistryRow[] | null;

    if (preWorkspace.error || !registryRows || registryRows.length === 0) {
      return existingApps;
    }

    const ownerIds = [...new Set(
      (registryRows as DbKernelRegistryRow[])
        .map(row => stringValue(row.agent_id).trim())
        .filter(Boolean),
    )];
    const { data: ownerRows } = ownerIds.length === 0
      ? { data: [] }
      : await supabase
        .from('agents')
        .select('id,name,tier,metadata')
        .in('id', ownerIds);

    const owners = new Map<string, { name: string; enterprise: boolean }>();
    for (const row of (ownerRows ?? []) as Array<Record<string, unknown>>) {
      const metadata = isRecord(row.metadata) ? row.metadata : {};
      const tier = isValidPlan(metadata.plan) ? normalizePlan(metadata.plan) : normalizePersistedPlan(row.tier);
      owners.set(String(row.id), {
        name: stringValue(row.name, String(row.id)),
        enterprise: getPlanDescriptor(tier).enterprise,
      });
    }

    let changed = false;
    for (const row of registryRows) {
      const product = stringValue(row.product).trim();
      const publisherId = stringValue(row.agent_id).trim();
      const commandTopic = stringValue(row.command_topic).trim();
      const statusTopic = stringValue(row.status_topic).trim();
      if (!product || !publisherId || !commandTopic || !statusTopic) continue;
      if (isInternalVerificationSdkIdentity(product)) continue;

      const owner = owners.get(publisherId);
      if (!owner?.enterprise) continue;

      const slug = normalizeAgentAppSlug(product);
      const existingApp = existingApps.find(app => app.slug === slug || app.kernelProduct === product);
      if (
        existingApp
        && existingApp.source === 'external_sdk'
        && existingApp.kernelCommandTopic
        && existingApp.kernelStatusTopic
      ) {
        continue;
      }

      const commands = Array.isArray(row.available_commands)
        ? row.available_commands
          .filter(isRecord)
          .map(command => ({
            name: stringValue(command.name, 'run'),
            description: nullableString(command.description) ?? `Run ${stringValue(command.name, 'run')}`,
          }))
        : [];

      const statusPayload = isRecord((row as Record<string, unknown>).last_status_payload) ? (row as Record<string, unknown>).last_status_payload as Record<string, unknown> : {};
      const healthStatus = normalizeHealthStatus(row.health_status ?? row.status ?? 'unknown');
      const endpointStatus = normalizeEndpointStatus(row.endpoint_status ?? statusPayload.endpointStatus ?? (healthStatus === 'online' ? 'healthy' : 'unknown'));

      await saveAgentApp({
        workspaceId: nullableString(row.workspace_id),
        publisherId,
        publisherName: owner.name,
        name: existingApp?.name ?? titleCaseSlug(product),
        slug: existingApp?.slug ?? slug,
        category: existingApp?.category ?? 'Operations',
        description: existingApp?.description ?? buildSdkFallbackDescription(product),
        longDescription: existingApp?.longDescription ?? buildSdkFallbackDescription(product),
        appUrl: existingApp?.appUrl,
        repositoryUrl: existingApp?.repositoryUrl,
        deviceTargets: existingApp?.deviceTargets ?? ['AgentOS Cloud'],
        manifest: {
          ...existingApp?.manifest,
          schemaVersion: 'agentos.app.v1',
          version: stringValue(row.version, existingApp?.manifest.version ?? '1.0.0'),
          runtime: 'external-app',
          entrypoint: `agentos://kernel/${product}`,
          commands: commands.length > 0 ? commands : existingApp?.manifest.commands ?? [],
        },
        defaultConfig: existingApp?.defaultConfig,
        visibility: existingApp?.visibility ?? 'public',
        source: 'external_sdk',
        runtimeType: 'external-app',
        kernelProduct: product,
        kernelCommandTopic: commandTopic,
        kernelStatusTopic: statusTopic,
        healthStatus,
        endpointStatus,
        lastHeartbeatAt: nullableString(row.last_heartbeat_at) ?? nullableString(row.registered_at),
        lastError: nullableString(row.last_error) ?? nullableString(statusPayload.lastError),
        disabled: row.disabled === true || row.status === 'disabled',
        heartbeatCount: Number(row.heartbeat_count ?? 0),
        permissionsRequired: existingApp?.permissionsRequired,
        requiredSecrets: existingApp?.requiredSecrets,
        screenshots: existingApp?.screenshots,
      });
      changed = true;
    }

    return changed ? await loadStoredApps() : existingApps;
  } catch {
    return existingApps;
  }
}

export async function listAgentApps(options: ListAgentAppsOptions = {}): Promise<AgentAppListing[]> {
  const category = options.category?.trim();
  const search = options.search?.trim().toLowerCase() ?? '';
  const sort = options.sort?.trim() || 'popular';
  const publisherId = options.publisherId?.trim();
  const source = options.source?.trim();
  const runtimeType = options.runtimeType?.trim();
  const visibility = options.visibility?.trim();
  let apps = await reconcileLegacySdkApps(await loadStoredApps());

  if (publisherId) {
    apps = apps.filter(app => app.publisherId === publisherId);
  }

  const requestedVisibility = options.visibility === 'unlisted'
    ? 'workspace'
    : options.visibility === 'public' || options.visibility === 'private' || options.visibility === 'workspace'
      ? options.visibility
      : null;

  apps = apps.filter(app => {
    if (source && source !== 'all' && app.source !== source) return false;
    if (runtimeType && runtimeType !== 'all' && app.runtimeType !== runtimeType) return false;
    if (requestedVisibility && app.visibility !== requestedVisibility) return false;
    if (!options.includeHidden) return isPublicMarketplaceApp(app);
    return canAccessAppBySlug(app, options);
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
  const apps = await reconcileLegacySdkApps(await loadStoredApps());
  const app = apps.find(item => item.slug === normalizedSlug) ?? null;
  if (!app) return null;
  return canAccessAppBySlug(app, options) ? app : null;
}

export async function getAgentAppByKernelProduct(product: string, options: AgentAppAccessOptions = {}): Promise<AgentAppListing | null> {
  const normalizedProduct = product.trim();
  if (!normalizedProduct) return null;
  const apps = await reconcileLegacySdkApps(await loadStoredApps());
  const app = apps.find(item => item.kernelProduct === normalizedProduct) ?? null;
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
  healthStatus?: AgentAppHealthStatus;
  endpointStatus?: AgentAppEndpointStatus;
  lastCommandAt?: string | null;
  lastError?: string | null;
  disabled?: boolean;
  heartbeatCount?: number;
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
    visibility?: AgentAppVisibility | 'unlisted';
  };
}): Promise<AgentAppListing> {
  const product = input.product.trim();
  const slug = normalizeAgentAppSlug(input.app?.slug?.trim() || product);
  const existing = await getAgentAppByKernelProduct(product)
    ?? await getAgentAppBySlug(slug, { canManageAll: true });
  const defaultName = input.app?.name?.trim() || existing?.name || titleCaseSlug(product);
  const description = input.app?.description?.trim() ?? existing?.description ?? buildSdkFallbackDescription(product);
  const longDescription = input.app?.longDescription?.trim() || description;
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
    category: input.app?.category ?? existing?.category ?? 'Operations',
    description,
    longDescription,
    appUrl: input.app?.appUrl ?? existing?.appUrl ?? null,
    repositoryUrl: input.app?.repositoryUrl ?? existing?.repositoryUrl ?? null,
    deviceTargets: input.app?.deviceTargets ?? existing?.deviceTargets ?? ['AgentOS Cloud'],
    manifest: {
      ...existing?.manifest,
      ...input.app?.manifest,
      runtime: input.app?.manifest?.runtime ?? 'external-app',
      entrypoint: input.app?.manifest?.entrypoint ?? `agentos://kernel/${product}`,
      commands: Array.isArray(input.app?.manifest?.commands) && input.app?.manifest?.commands.length > 0
        ? input.app?.manifest?.commands
        : commands,
    },
    defaultConfig: input.app?.defaultConfig ?? existing?.defaultConfig ?? {},
    visibility: input.app?.visibility ?? existing?.visibility ?? 'public',
    source: 'external_sdk',
    runtimeType: 'external-app',
    kernelProduct: product,
    kernelCommandTopic: input.commandTopic,
    kernelStatusTopic: input.statusTopic,
    healthStatus: input.healthStatus ?? 'online',
    endpointStatus: input.endpointStatus ?? 'healthy',
    lastHeartbeatAt: new Date().toISOString(),
    lastCommandAt: input.lastCommandAt ?? null,
    lastError: input.lastError ?? null,
    disabled: input.disabled ?? false,
    heartbeatCount: input.heartbeatCount ?? 0,
    requiredSecrets: input.app?.manifest?.requiredSecrets ?? existing?.requiredSecrets,
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

export async function recordAgentAppInstall(slug: string): Promise<void> {
  const normalizedSlug = normalizeAgentAppSlug(slug);
  try {
    const supabase = getSupabaseAdmin();
    const primary = await supabase
      .from('agent_apps')
      .select(APP_SELECT)
      .eq('slug', normalizedSlug)
      .maybeSingle();
    const legacy = primary.error
      ? await supabase
        .from('agent_apps')
        .select(APP_SELECT_LEGACY)
        .eq('slug', normalizedSlug)
        .maybeSingle()
      : { data: primary.data, error: primary.error };
    if (!legacy.error && legacy.data) {
      const app = fromDbRow(legacy.data as DbAgentAppRow);
      const patch: Record<string, unknown> = {
        install_count: app.installCount + 1,
        updated_at: new Date().toISOString(),
      };
      const update = await supabase.from('agent_apps').update(patch).eq('slug', normalizedSlug);
      if (update.error) {
        await supabase.from('agent_apps').update({
          install_count: app.installCount + 1,
          updated_at: new Date().toISOString(),
        }).eq('slug', normalizedSlug);
      }
      return;
    }
  } catch {
    // Local fallback below.
  }

  await updateLocalRuntimeState(state => {
    const app = state.agentApps.catalog.find(item => item.slug === normalizedSlug);
    if (!app) return;
    app.installCount += 1;
  });
}

export async function recordAgentAppDownload(slug: string, target: 'web' | 'android' | 'ios' = 'web'): Promise<void> {
  if (target === 'web') return;

  const normalizedSlug = normalizeAgentAppSlug(slug);
  try {
    const supabase = getSupabaseAdmin();
    const primary = await supabase
      .from('agent_apps')
      .select(APP_SELECT)
      .eq('slug', normalizedSlug)
      .maybeSingle();
    const legacy = primary.error
      ? await supabase
        .from('agent_apps')
        .select(APP_SELECT_LEGACY)
        .eq('slug', normalizedSlug)
        .maybeSingle()
      : { data: primary.data, error: primary.error };
    if (!legacy.error && legacy.data) {
      const app = fromDbRow(legacy.data as DbAgentAppRow);
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (target === 'android') patch.android_download_count = app.androidDownloadCount + 1;
      if (target === 'ios') patch.ios_download_count = app.iosDownloadCount + 1;
      await supabase.from('agent_apps').update(patch).eq('slug', normalizedSlug);
      return;
    }
  } catch {
    // Local fallback below.
  }

  await updateLocalRuntimeState(state => {
    const app = state.agentApps.catalog.find(item => item.slug === normalizedSlug);
    if (!app) return;
    if (target === 'android') app.androidDownloadCount += 1;
    if (target === 'ios') app.iosDownloadCount += 1;
  });
}

export async function getAgentAppInstallReadiness(params: {
  agentId: string;
  slug: string;
  workspaceId?: string | null;
  viewerWorkspaceIds?: string[];
  canManageAll?: boolean;
  permissionsApproved?: string[];
}): Promise<{
  app: AgentAppListing;
  requiredPermissions: string[];
  missingPermissions: string[];
  missingSecrets: string[];
  missingSkills: string[];
  appUnavailableReason: string | null;
}> {
  const viewer = {
    viewerAgentId: params.agentId,
    viewerWorkspaceIds: params.viewerWorkspaceIds,
    canManageAll: params.canManageAll,
  };
  let app = await getAgentAppBySlug(params.slug, viewer);
  if (!app) {
    const candidate = await getAgentAppBySlug(params.slug, { canManageAll: true });
    if (candidate && candidate.disabled && canAccessAppByVisibility(candidate, viewer)) {
      app = candidate;
    }
  }
  if (!app) throw new ValidationError('App not found');
  if (!canAccessAppByVisibility(app, {
    viewerAgentId: params.agentId,
    viewerWorkspaceIds: params.viewerWorkspaceIds,
    canManageAll: params.canManageAll,
  })) {
    throw new ValidationError('App not found');
  }

  const requiredPermissions = [...new Set((app.permissionsRequired.length > 0 ? app.permissionsRequired : app.manifest.permissions).filter(Boolean))];
  const approvedSet = new Set((params.permissionsApproved ?? []).map(normalizePermissionName).filter(Boolean));
  const missingPermissions = requiredPermissions.filter(permission => !approvedSet.has(normalizePermissionName(permission)));
  const secretValidation = await validateRequiredSecrets({
    ownerAgentId: params.agentId,
    workspaceId: params.workspaceId ?? app.workspaceId ?? undefined,
    names: app.requiredSecrets,
  });
  const installedSkillSlugs = await listInstalledSkillSlugs(params.agentId);
  const missingSkills = collectRequiredSkills(app).filter(skill => !installedSkillSlugs.includes(skill));

  return {
    app,
    requiredPermissions,
    missingPermissions,
    missingSecrets: secretValidation.missing,
    missingSkills,
    appUnavailableReason: getAppUnavailableReason(app),
  };
}

export async function getAgentAppReadiness(params: {
  agentId: string;
  slug: string;
  workspaceId?: string | null;
  viewerWorkspaceIds?: string[];
  canManageAll?: boolean;
  permissionsApproved?: string[];
}): Promise<{
  app: AgentAppListing;
  installation: AgentAppInstallation | null;
  requiredPermissions: string[];
  missingPermissions: string[];
  missingSecrets: string[];
  missingSkills: string[];
  appUnavailableReason: string | null;
  ready: boolean;
  updateAvailable: boolean;
  targets: Array<{ target: AgentAppOpenTarget; url: string }>;
}> {
  const installation = await getInstalledAgentApp(params.agentId, params.slug);
  const readiness = await getAgentAppInstallReadiness({
    ...params,
    permissionsApproved: params.permissionsApproved ?? installation?.installation.permissionsApproved ?? [],
  });
  return {
    app: readiness.app,
    installation: installation?.installation ?? null,
    requiredPermissions: readiness.requiredPermissions,
    missingPermissions: readiness.missingPermissions,
    missingSecrets: readiness.missingSecrets,
    missingSkills: readiness.missingSkills,
    appUnavailableReason: readiness.appUnavailableReason,
    ready: readiness.missingPermissions.length === 0
      && readiness.missingSecrets.length === 0
      && readiness.missingSkills.length === 0
      && readiness.appUnavailableReason === null
      && installation?.installation.status !== 'disabled'
      && installation?.installation.status !== 'removed',
    updateAvailable: installation?.installation.updateAvailable === true,
    targets: resolveAvailableTargets(readiness.app),
  };
}

export async function installAgentApp(params: {
  agentId: string;
  slug: string;
  workspaceId?: string | null;
  viewerWorkspaceIds?: string[];
  canManageAll?: boolean;
  permissionsApproved?: string[];
}): Promise<{ app: AgentAppListing; installation: AgentAppInstallation }> {
  const readiness = await getAgentAppInstallReadiness(params);
  if (readiness.appUnavailableReason) {
    throw new AppUnavailableError(readiness.appUnavailableReason);
  }
  if (readiness.missingPermissions.length > 0) {
    throw new ValidationError(`Missing permission approval: ${readiness.missingPermissions.join(', ')}`);
  }
  if (readiness.missingSecrets.length > 0) {
    throw new ValidationError(`Missing required secrets: ${readiness.missingSecrets.join(', ')}`);
  }
  if (readiness.missingSkills.length > 0) {
    throw new ValidationError(`Missing required skills: ${readiness.missingSkills.join(', ')}`);
  }

  const now = new Date().toISOString();
  try {
    const supabase = getSupabaseAdmin();
    const lookup = await supabase
      .from('app_installations')
      .select(APP_INSTALLATION_SELECT)
      .eq('agent_id', params.agentId)
      .eq('app_id', readiness.app.id)
      .maybeSingle();
    const existingRow = lookup.error
      ? await supabase
        .from('app_installations')
        .select(APP_INSTALLATION_SELECT_LEGACY)
        .eq('agent_id', params.agentId)
        .eq('app_id', readiness.app.id)
        .maybeSingle()
      : { data: lookup.data, error: lookup.error };
    const existingInstallation = existingRow.data ? mapInstallationRow(existingRow.data as DbAppInstallationRow) : null;
    const shouldCountInstall = !existingInstallation || existingInstallation.status === 'removed';
    const primary = await supabase
      .from('app_installations')
      .upsert({
        id: existingInstallation?.id ?? randomUUID(),
        app_id: readiness.app.id,
        agent_id: params.agentId,
        workspace_id: params.workspaceId ?? readiness.app.workspaceId ?? null,
        status: 'active',
        favorite: existingInstallation?.favorite ?? false,
        permissions_approved: readiness.requiredPermissions,
        open_count: existingInstallation?.openCount ?? 0,
        last_opened_at: existingInstallation?.lastOpenedAt ?? null,
        installed_at: existingInstallation?.installedAt ?? now,
        updated_at: now,
        installed_version: readiness.app.manifest.version,
      }, { onConflict: 'app_id,agent_id' })
      .select(APP_INSTALLATION_SELECT)
      .single();

    const legacy = primary.error
      ? await supabase
        .from('app_installations')
        .upsert({
          id: existingInstallation?.id ?? randomUUID(),
          app_id: readiness.app.id,
          agent_id: params.agentId,
          workspace_id: params.workspaceId ?? readiness.app.workspaceId ?? null,
          status: 'active',
          installed_at: existingInstallation?.installedAt ?? now,
          updated_at: now,
          installed_version: readiness.app.manifest.version,
        }, { onConflict: 'app_id,agent_id' })
        .select(APP_INSTALLATION_SELECT_LEGACY)
        .single()
      : { data: primary.data, error: primary.error };
    if (legacy.error) throw new Error(legacy.error.message);
    if (shouldCountInstall) await recordAgentAppInstall(readiness.app.slug);
    const installation = mapInstallationRow((legacy.data as DbAppInstallationRow) ?? {});
    await cacheAgentAppPackage({
      ownerAgentId: params.agentId,
      workspaceId: installation.workspaceId ?? params.workspaceId ?? readiness.app.workspaceId ?? null,
      app: readiness.app,
      appPackage: buildAgentAppPackage(readiness.app),
    }).catch(() => undefined);
    return {
      app: readiness.app,
      installation,
    };
  } catch {
    let shouldCountInstall = false;
    const installation = await updateLocalRuntimeState(state => {
      state.agentApps.installations[params.agentId] ??= [];
      const entries = state.agentApps.installations[params.agentId];
      const existing = entries.findIndex(item => item.app_id === readiness.app.id);
      if (existing >= 0) {
        shouldCountInstall = entries[existing].status === 'removed';
        entries[existing] = {
          id: entries[existing].id,
          app_id: readiness.app.id,
          agent_id: params.agentId,
          workspace_id: params.workspaceId ?? readiness.app.workspaceId ?? null,
          status: 'active',
          favorite: entries[existing].favorite,
          permissions_approved: readiness.requiredPermissions,
          open_count: entries[existing].open_count,
          last_opened_at: entries[existing].last_opened_at,
          installed_at: entries[existing].installed_at,
          updated_at: now,
          installed_version: readiness.app.manifest.version,
        };
        return mapInstallationRow(entries[existing]);
      }

      shouldCountInstall = true;
      const next = {
        id: randomUUID(),
        app_id: readiness.app.id,
        agent_id: params.agentId,
        workspace_id: params.workspaceId ?? readiness.app.workspaceId ?? null,
        status: 'active' as const,
        favorite: false,
        permissions_approved: readiness.requiredPermissions,
        open_count: 0,
        last_opened_at: null,
        installed_at: now,
        updated_at: now,
        installed_version: readiness.app.manifest.version,
      };
      entries.unshift(next);
      return mapInstallationRow(next);
    });
    if (shouldCountInstall) await recordAgentAppInstall(readiness.app.slug);
    await cacheAgentAppPackage({
      ownerAgentId: params.agentId,
      workspaceId: installation.workspaceId ?? params.workspaceId ?? readiness.app.workspaceId ?? null,
      app: readiness.app,
      appPackage: buildAgentAppPackage(readiness.app),
    }).catch(() => undefined);
    return {
      app: readiness.app,
      installation,
    };
  }
}

export async function listInstalledAgentApps(agentId: string): Promise<Array<{ app: AgentAppListing; installation: AgentAppInstallation }>> {
  let installations: AgentAppInstallation[] = [];
  try {
    const supabase = getSupabaseAdmin();
    const primary = await supabase
      .from('app_installations')
      .select(APP_INSTALLATION_SELECT)
      .eq('agent_id', agentId)
      .order('updated_at', { ascending: false });
    const legacy = primary.error
      ? await supabase
        .from('app_installations')
        .select(APP_INSTALLATION_SELECT_LEGACY)
        .eq('agent_id', agentId)
        .order('updated_at', { ascending: false })
      : { data: primary.data, error: primary.error };
    if (!legacy.error) {
      installations = ((legacy.data ?? []) as DbAppInstallationRow[])
        .map(mapInstallationRow)
        .filter(installation => installation.status !== 'removed');
    }
  } catch {
    // Local fallback below.
  }

  if (installations.length === 0 && allowLocalAppstoreFallback()) {
    const state = await readLocalRuntimeState();
    installations = (state.agentApps.installations[agentId] ?? [])
      .map(installation => mapInstallationRow(installation))
      .filter(installation => installation.status !== 'removed');
  }

  const apps = await reconcileLegacySdkApps(await loadStoredApps());
  const entries: Array<{ app: AgentAppListing | null; installation: AgentAppInstallation }> = installations
    .map(installation => {
      const app = apps.find(item => item.id === installation.appId) ?? null;
      return {
        installation: {
          ...installation,
          updateAvailable: Boolean(app?.manifest.version && app.manifest.version !== installation.installedVersion),
        },
        app,
      };
    });

  return entries.filter((entry): entry is { app: AgentAppListing; installation: AgentAppInstallation } => entry.app !== null);
}

export async function getInstalledAgentApp(agentId: string, slug: string): Promise<{ app: AgentAppListing; installation: AgentAppInstallation } | null> {
  const normalizedSlug = normalizeAgentAppSlug(slug);
  const installations = await listInstalledAgentApps(agentId);
  return installations.find(entry => entry.app.slug === normalizedSlug) ?? null;
}

export async function assertAgentAppPermissionAccess(params: {
  agentId: string;
  slug: string;
  permission: string;
}): Promise<{ app: AgentAppListing; installation: AgentAppInstallation }> {
  const entry = await getInstalledAgentApp(params.agentId, params.slug);
  if (!entry) throw new PermissionError('App is not installed');
  if (entry.app.disabled) throw new AppUnavailableError('App is disabled and unavailable.');
  if (entry.installation.status !== 'active') throw new PermissionError('App is not active');

  const normalizedPermission = normalizePermissionName(params.permission);
  const approved = new Set(entry.installation.permissionsApproved.map(normalizePermissionName));
  if (!approved.has(normalizedPermission)) {
    throw new PermissionError(`Permission approval required: ${params.permission}`);
  }

  return entry;
}

export async function updateAgentAppInstallation(params: {
  agentId: string;
  slug: string;
  favorite?: boolean;
  permissionsApproved?: string[];
  status?: 'active' | 'disabled' | 'removed';
  installedVersion?: string | null;
}): Promise<{ app: AgentAppListing; installation: AgentAppInstallation }> {
  const app = await getAgentAppBySlug(params.slug, {
    viewerAgentId: params.agentId,
    viewerWorkspaceIds: [],
  });
  if (!app) throw new ValidationError('App not found');
  const now = new Date().toISOString();

  try {
    const supabase = getSupabaseAdmin();
    const lookup = await supabase
      .from('app_installations')
      .select(APP_INSTALLATION_SELECT)
      .eq('agent_id', params.agentId)
      .eq('app_id', app.id)
      .maybeSingle();
    const legacyLookup = lookup.error
      ? await supabase
        .from('app_installations')
        .select(APP_INSTALLATION_SELECT_LEGACY)
        .eq('agent_id', params.agentId)
        .eq('app_id', app.id)
        .maybeSingle()
      : { data: lookup.data, error: lookup.error };
    if (legacyLookup.error) throw new Error(legacyLookup.error.message);
    if (!legacyLookup.data) throw new ValidationError('App is not installed');
    const current = mapInstallationRow(legacyLookup.data as DbAppInstallationRow);
    const patch = {
      favorite: typeof params.favorite === 'boolean' ? params.favorite : current.favorite,
      permissions_approved: params.permissionsApproved ?? current.permissionsApproved,
      status: params.status ?? current.status,
      updated_at: now,
      installed_version: params.installedVersion ?? current.installedVersion,
    };
    const primary = await supabase
      .from('app_installations')
      .update(patch)
      .eq('agent_id', params.agentId)
      .eq('app_id', app.id)
      .select(APP_INSTALLATION_SELECT)
      .single();
    const legacy = primary.error
      ? await supabase
        .from('app_installations')
        .update({
          status: params.status ?? current.status,
          updated_at: now,
        })
        .eq('agent_id', params.agentId)
        .eq('app_id', app.id)
        .select(APP_INSTALLATION_SELECT_LEGACY)
        .single()
      : { data: primary.data, error: primary.error };
    if (legacy.error) throw new Error(legacy.error.message);
    return { app, installation: mapInstallationRow(legacy.data as DbAppInstallationRow) };
  } catch {
    const installation = await updateLocalRuntimeState(state => {
      state.agentApps.installations[params.agentId] ??= [];
      const entries = state.agentApps.installations[params.agentId];
      const existing = entries.find(item => item.app_id === app.id);
      if (!existing) throw new ValidationError('App is not installed');
      if (typeof params.favorite === 'boolean') existing.favorite = params.favorite;
      if (Array.isArray(params.permissionsApproved)) existing.permissions_approved = [...params.permissionsApproved];
      if (params.status) existing.status = params.status;
      if (params.installedVersion !== undefined) existing.installed_version = params.installedVersion;
      existing.updated_at = now;
      return mapInstallationRow(existing);
    });
    return { app, installation };
  }
}

export async function recordAgentAppOpen(params: {
  agentId: string;
  slug: string;
  target?: AgentAppOpenTarget;
}): Promise<{ app: AgentAppListing; installation: AgentAppInstallation; openUrl: string | null; target: AgentAppOpenTarget }> {
  const target = params.target ?? 'web';
  const { app, installation } = await updateAgentAppInstallation({
    agentId: params.agentId,
    slug: params.slug,
    status: 'active',
  });
  if (app.disabled) {
    throw new AppUnavailableError('App is disabled and unavailable.');
  }
  const requiredPermissions = [...new Set((app.permissionsRequired.length > 0 ? app.permissionsRequired : app.manifest.permissions).filter(Boolean))];
  const approved = new Set(installation.permissionsApproved.map(normalizePermissionName));
  const missing = requiredPermissions.filter(permission => !approved.has(normalizePermissionName(permission)));
  if (missing.length > 0) {
    throw new ValidationError(`Missing permission approval: ${missing.join(', ')}`);
  }
  const openUrl = resolveTargetUrl(app, target);
  if (!openUrl) {
    throw new ValidationError(`No ${target} target is available for this app`);
  }

  const now = new Date().toISOString();
  try {
    const supabase = getSupabaseAdmin();
    const installationUpdate = await supabase
      .from('app_installations')
      .update({
        open_count: installation.openCount + 1,
        last_opened_at: now,
        updated_at: now,
      })
      .eq('agent_id', params.agentId)
      .eq('app_id', app.id);
    const appUpdate = await supabase
      .from('agent_apps')
      .update({
        open_count: app.openCount + 1,
        web_open_count: target === 'web' ? app.webOpenCount + 1 : app.webOpenCount,
        android_download_count: target === 'android' ? app.androidDownloadCount + 1 : app.androidDownloadCount,
        ios_download_count: target === 'ios' ? app.iosDownloadCount + 1 : app.iosDownloadCount,
        last_command_at: now,
        updated_at: now,
      })
      .eq('id', app.id);
    if (installationUpdate.error) {
      await supabase
        .from('app_installations')
        .update({ updated_at: now })
        .eq('agent_id', params.agentId)
        .eq('app_id', app.id);
    }
    if (appUpdate.error) {
      await supabase
        .from('agent_apps')
        .update({
          install_count: app.installCount,
          updated_at: now,
        })
        .eq('id', app.id);
    }
  } catch {
    await updateLocalRuntimeState(state => {
      const entry = state.agentApps.catalog.find(item => item.id === app.id);
      if (entry) {
        entry.openCount += 1;
        if (target === 'web') entry.webOpenCount += 1;
        if (target === 'android') entry.androidDownloadCount += 1;
        if (target === 'ios') entry.iosDownloadCount += 1;
        entry.lastCommandAt = now;
        entry.updatedAt = now;
      }
      const installationEntry = (state.agentApps.installations[params.agentId] ?? []).find(item => item.app_id === app.id);
      if (installationEntry) {
        installationEntry.open_count += 1;
        installationEntry.last_opened_at = now;
        installationEntry.updated_at = now;
      }
    });
  }

  const [fresh] = await listInstalledAgentApps(params.agentId).then(entries => entries.filter(entry => entry.app.slug === params.slug));
  return {
    app: fresh?.app ?? app,
    installation: fresh?.installation ?? { ...installation, openCount: installation.openCount + 1, lastOpenedAt: now, updatedAt: now },
    openUrl,
    target,
  };
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
      appUrl: app.distribution.webUrl ?? app.appUrl,
      repositoryUrl: app.repositoryUrl,
      deviceTargets: app.deviceTargets,
    },
    manifest: app.manifest,
    defaultConfig: app.defaultConfig,
  };
}

export function resolveSupportedDeviceTargets(app: AgentAppListing): AgentAppDeviceInstallTarget[] {
  const raw = [
    ...app.deviceTargets,
    app.distribution.androidUrl ? 'android' : '',
    app.distribution.iosUrl ? 'ios' : '',
    app.distribution.webUrl || app.appUrl ? 'pwa' : '',
  ].join(' ').toLowerCase();
  const targets = new Set<AgentAppDeviceInstallTarget>();
  if (raw.includes('android')) targets.add('android');
  if (raw.includes('ios') || raw.includes('iphone') || raw.includes('ipad')) targets.add('ios');
  if (raw.includes('desktop') || raw.includes('mac') || raw.includes('windows') || raw.includes('linux')) targets.add('desktop');
  if (raw.includes('pwa') || raw.includes('web') || raw.includes('cloud')) targets.add('pwa');
  return [...targets];
}

function normalizeDeviceTarget(value: unknown): AgentAppDeviceInstallTarget {
  if (value === 'android' || value === 'ios' || value === 'desktop' || value === 'pwa') return value;
  throw new ValidationError('Unsupported device target');
}

async function cacheAgentAppPackage(params: {
  ownerAgentId: string;
  workspaceId: string | null;
  app: AgentAppListing;
  appPackage: AgentAppPackage;
}): Promise<{ packageRef: string; cached: boolean }> {
  const now = new Date().toISOString();
  const packageRef = `agentos://workspace/${params.workspaceId ?? params.ownerAgentId}/apps/${params.app.slug}/${params.app.manifest.version}`;
  const payload = {
    id: randomUUID(),
    app_id: params.app.id,
    workspace_id: params.workspaceId,
    owner_agent_id: params.ownerAgentId,
    package_ref: packageRef,
    package_payload: params.appPackage,
    version: params.app.manifest.version,
    status: 'cached',
    cached_at: now,
    updated_at: now,
  };

  try {
    const { error } = await getSupabaseAdmin()
      .from('app_package_cache')
      .upsert(payload, { onConflict: 'workspace_id,app_id,version' });
    if (!error) return { packageRef, cached: true };
  } catch {
    // Fall through to local dev/test cache.
  }

  await updateLocalRuntimeState(state => {
    const existing = state.appPackageCache.find(item =>
      item.ownerAgentId === params.ownerAgentId
      && item.appId === params.app.id
      && item.workspaceId === params.workspaceId
      && item.version === params.app.manifest.version
    );
    if (existing) {
      existing.packageRef = packageRef;
      existing.packagePayload = params.appPackage as unknown as Record<string, unknown>;
      existing.status = 'cached';
      existing.cachedAt = now;
      existing.updatedAt = now;
      return;
    }
    state.appPackageCache.unshift({
      id: randomUUID(),
      appId: params.app.id,
      workspaceId: params.workspaceId,
      ownerAgentId: params.ownerAgentId,
      packageRef,
      packagePayload: params.appPackage as unknown as Record<string, unknown>,
      version: params.app.manifest.version,
      status: 'cached',
      cachedAt: now,
      updatedAt: now,
    });
  });
  return { packageRef, cached: true };
}

export async function getAgentAppPackageCacheStatus(params: {
  ownerAgentId: string;
  workspaceId: string | null;
  appId: string;
  version?: string | null;
}): Promise<{ cached: boolean; packageRef: string | null }> {
  try {
    let query = getSupabaseAdmin()
      .from('app_package_cache')
      .select('package_ref,status')
      .eq('owner_agent_id', params.ownerAgentId)
      .eq('app_id', params.appId)
      .eq('status', 'cached')
      .order('cached_at', { ascending: false })
      .limit(1);
    if (params.workspaceId) query = query.eq('workspace_id', params.workspaceId);
    if (params.version) query = query.eq('version', params.version);
    const { data, error } = await query.maybeSingle();
    if (!error && data) {
      return { cached: true, packageRef: typeof data.package_ref === 'string' ? data.package_ref : null };
    }
  } catch {
    // Fall through to local state.
  }

  const state = await readLocalRuntimeState();
  const cached = state.appPackageCache.find(item =>
    item.ownerAgentId === params.ownerAgentId
    && item.appId === params.appId
    && item.status === 'cached'
    && (!params.workspaceId || item.workspaceId === params.workspaceId)
    && (!params.version || item.version === params.version)
  );
  return { cached: Boolean(cached), packageRef: cached?.packageRef ?? null };
}

export async function installAgentAppToDevice(params: {
  agentId: string;
  slug: string;
  target: unknown;
  workspaceId?: string | null;
}): Promise<AgentAppDeviceInstallResult> {
  const target = normalizeDeviceTarget(params.target);
  const entry = await getInstalledAgentApp(params.agentId, params.slug);
  if (!entry || entry.installation.status !== 'active') {
    throw new PermissionError('App must be installed in the workspace before device installation.');
  }
  const workspaceId = params.workspaceId ?? entry.installation.workspaceId ?? entry.app.workspaceId ?? null;
  const supportedDeviceTargets = resolveSupportedDeviceTargets(entry.app);
  if (!supportedDeviceTargets.includes(target)) {
    throw new ValidationError(`This app does not support ${target} installation`);
  }
  const appPackage = buildAgentAppPackage(entry.app);
  const cache = await cacheAgentAppPackage({
    ownerAgentId: params.agentId,
    workspaceId,
    app: entry.app,
    appPackage,
  });
  const now = new Date().toISOString();

  try {
    const { error } = await getSupabaseAdmin()
      .from('app_device_installations')
      .upsert({
        id: randomUUID(),
        app_id: entry.app.id,
        installation_id: entry.installation.id,
        owner_agent_id: params.agentId,
        workspace_id: workspaceId,
        target,
        package_ref: cache.packageRef,
        status: 'installed',
        installed_at: now,
        updated_at: now,
      }, { onConflict: 'owner_agent_id,app_id,target' });
    if (error) throw new Error(error.message);
  } catch {
    await updateLocalRuntimeState(state => {
      const existing = state.appDeviceInstallations.find(item =>
        item.ownerAgentId === params.agentId
        && item.appId === entry.app.id
        && item.target === target
      );
      if (existing) {
        existing.status = 'installed';
        existing.packageRef = cache.packageRef;
        existing.workspaceId = workspaceId;
        existing.updatedAt = now;
        return;
      }
      state.appDeviceInstallations.unshift({
        id: randomUUID(),
        appId: entry.app.id,
        workspaceId,
        ownerAgentId: params.agentId,
        target,
        packageRef: cache.packageRef,
        status: 'installed',
        installedAt: now,
        updatedAt: now,
      });
    });
  }

  return {
    workspaceInstalled: true,
    deviceInstalled: true,
    target,
    supportedDeviceTargets,
    packageCachedForOfflineInstall: cache.cached,
    packageRef: cache.packageRef,
    app: entry.app,
    installation: entry.installation,
  };
}
