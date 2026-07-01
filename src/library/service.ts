import { getAgentAppPackageCacheStatus, listInstalledAgentApps, resolveSupportedDeviceTargets } from '../appstore/service.js';
import { listAccessibleFiles } from '../files/service.js';
import { listAccessibleMemoryEntries } from '../memory/service.js';
import { listAccessibleSubagents } from '../subagents/service.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { readLocalRuntimeState } from '../storage/local-state.js';
import { recordMarketplaceInstallEvent, type MarketplaceAssetType } from '../marketplace/install-events.js';

export type LibraryItemKind =
  | 'installed_app'
  | 'installed_skill'
  | 'saved_workflow'
  | 'subagent'
  | 'memory_collection'
  | 'template'
  | 'file'
  | 'published_asset'
  | 'forked_asset'
  | 'mcp_connection'
  | 'external_connection'
  | 'download'
  | 'recent_activity';

export type LibraryItem = {
  id: string;
  kind: LibraryItemKind;
  name: string;
  description: string;
  href: string;
  workspaceId: string | null;
  projectId: string | null;
  visibility: 'private' | 'workspace' | 'public';
  updatedAt: string | null;
  metadata: Record<string, unknown>;
};

export type LibraryPayload = {
  items: LibraryItem[];
  groups: Record<LibraryItemKind, LibraryItem[]>;
  summary: Record<LibraryItemKind, number>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeVisibility(value: unknown): 'private' | 'workspace' | 'public' {
  return value === 'workspace' || value === 'public' ? value : 'private';
}

function matchesSearch(item: LibraryItem, search: string): boolean {
  if (!search) return true;
  return `${item.name} ${item.description} ${item.kind} ${JSON.stringify(item.metadata)}`.toLowerCase().includes(search);
}

function groupItems(items: LibraryItem[]): LibraryPayload {
  const groups: Record<LibraryItemKind, LibraryItem[]> = {
    installed_app: [],
    installed_skill: [],
    saved_workflow: [],
    subagent: [],
    memory_collection: [],
    template: [],
    file: [],
    published_asset: [],
    forked_asset: [],
    mcp_connection: [],
    external_connection: [],
    download: [],
    recent_activity: [],
  };
  for (const item of items) groups[item.kind].push(item);
  return {
    items,
    groups,
    summary: Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, value.length])) as Record<LibraryItemKind, number>,
  };
}

function assetTypeForLibraryItem(item: LibraryItem): MarketplaceAssetType | null {
  if (item.kind === 'installed_app') return 'app';
  if (item.kind === 'installed_skill') return 'skill';
  if (item.kind === 'published_asset' && item.metadata.sourceType === 'skill') return 'skill';
  if (item.kind === 'published_asset' && item.metadata.sourceType === 'app') return 'app';
  if (item.kind === 'saved_workflow' || item.kind === 'published_asset') return 'workflow';
  if (item.kind === 'subagent') return 'subagent';
  if (item.kind === 'memory_collection') return 'memory_asset';
  if (item.kind === 'file') return 'file';
  if (item.kind === 'mcp_connection') return 'mcp_connection';
  return null;
}

async function syncItemsToWorkspaceAssetRegistry(ownerAgentId: string, items: LibraryItem[]): Promise<void> {
  await Promise.all(items.map(item => {
    const assetType = assetTypeForLibraryItem(item);
    if (!assetType) return Promise.resolve();
    const sourceSlug = typeof item.metadata.slug === 'string'
      ? item.metadata.slug
      : typeof item.metadata.path === 'string'
        ? item.metadata.path
        : item.id;
    return recordMarketplaceInstallEvent({
      ownerAgentId,
      workspaceId: item.workspaceId,
      assetType,
      assetId: item.id,
      sourceSlug,
      name: item.name,
      description: item.description,
      href: item.href,
      visibility: item.visibility,
      metadata: { ...item.metadata, libraryKind: item.kind },
    });
  })).catch(() => undefined);
}

async function listInstalledSkills(agentId: string): Promise<LibraryItem[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('skill_installations')
      .select(`
        id,
        installed_at,
        skill:skills(id,name,slug,category,description,visibility,published,updated_at,created_at)
      `)
      .eq('agent_id', agentId)
      .order('installed_at', { ascending: false });
    if (!error) {
      return ((data ?? []) as Array<Record<string, unknown>>).flatMap(row => {
        const skill = row.skill && typeof row.skill === 'object' ? row.skill as Record<string, unknown> : null;
        if (!skill) return [];
        const slug = String(skill.slug ?? skill.id);
        return [{
          id: String(row.id ?? skill.id),
          kind: 'installed_skill' as const,
          name: String(skill.name ?? 'Skill'),
          description: String(skill.description ?? skill.category ?? 'Installed skill'),
          href: `/skills/${slug}`,
          workspaceId: null,
          projectId: null,
          visibility: normalizeVisibility(skill.visibility ?? (skill.published === true ? 'public' : 'private')),
          updatedAt: String(row.installed_at ?? skill.updated_at ?? skill.created_at ?? ''),
          metadata: { skillId: skill.id, slug, category: skill.category ?? null },
        }];
      });
    }
  } catch {
    // Fall through to local state.
  }

  const state = await readLocalRuntimeState();
  return (state.skills.installations[agentId] ?? []).flatMap(installation => {
    const skill = state.skills.catalog.find(item => item.id === installation.skill_id);
    if (!skill) return [];
    return [{
      id: installation.id,
      kind: 'installed_skill' as const,
      name: skill.name,
      description: skill.description,
      href: `/skills/${skill.slug}`,
      workspaceId: skill.workspace_id ?? null,
      projectId: null,
      visibility: normalizeVisibility((skill as { visibility?: unknown }).visibility ?? (skill.published ? 'public' : 'private')),
      updatedAt: installation.installed_at,
      metadata: { skillId: skill.id, slug: skill.slug, category: skill.category },
    }];
  });
}

async function listWorkflows(agentId: string): Promise<LibraryItem[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('agent_workflows')
      .select('id,name,summary,status,visibility,workspace_id,project_id,updated_at,created_at,published')
      .eq('agent_id', agentId)
      .order('updated_at', { ascending: false });
    if (error) return [];
    return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
      id: String(row.id),
      kind: row.published === true || row.visibility === 'public' ? 'published_asset' : 'saved_workflow',
      name: String(row.name ?? 'Workflow'),
      description: typeof row.summary === 'string' && row.summary ? row.summary : String(row.status ?? 'Workflow'),
      href: `/workflows/${String(row.id)}`,
      workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : null,
      projectId: typeof row.project_id === 'string' ? row.project_id : null,
      visibility: normalizeVisibility(row.visibility),
      updatedAt: String(row.updated_at ?? row.created_at ?? ''),
      metadata: { sourceType: 'workflow', status: row.status ?? null },
    }));
  } catch {
    return [];
  }
}

async function listPublishedAssets(agentId: string): Promise<LibraryItem[]> {
  const items: LibraryItem[] = [];
  try {
    const { data } = await getSupabaseAdmin()
      .from('skills')
      .select('id,name,slug,category,description,visibility,updated_at,created_at')
      .eq('author_id', agentId)
      .eq('published', true)
      .order('updated_at', { ascending: false });
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      items.push({
        id: String(row.id),
        kind: 'published_asset',
        name: String(row.name ?? 'Skill'),
        description: String(row.description ?? row.category ?? 'Published skill'),
        href: `/skills/${String(row.slug ?? row.id)}`,
        workspaceId: null,
        projectId: null,
        visibility: normalizeVisibility(row.visibility ?? 'public'),
        updatedAt: String(row.updated_at ?? row.created_at ?? ''),
        metadata: { sourceType: 'skill', slug: row.slug ?? null },
      });
    }
  } catch {
    // Skip optional published assets.
  }
  return items;
}

async function listExplicitLibraryItems(agentId: string): Promise<LibraryItem[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('library_items')
      .select('*')
      .eq('owner_agent_id', agentId)
      .order('updated_at', { ascending: false });
    if (!error) {
      return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
        id: String(row.id),
        kind: String(row.source_type ?? 'template') as LibraryItemKind,
        name: String(row.name ?? 'Library item'),
        description: typeof row.description === 'string' ? row.description : String(row.source_type ?? 'Library item'),
        href: typeof asRecord(row.metadata).href === 'string' ? String(asRecord(row.metadata).href) : '/library',
        workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : null,
        projectId: typeof row.project_id === 'string' ? row.project_id : null,
        visibility: normalizeVisibility(row.visibility),
        updatedAt: String(row.updated_at ?? row.created_at ?? ''),
        metadata: asRecord(row.metadata),
      }));
    }
  } catch {
    // Fall through to local state.
  }
  const state = await readLocalRuntimeState();
  return state.libraryItems
    .filter(item => item.ownerAgentId === agentId)
    .map(item => ({
      id: item.id,
      kind: item.sourceType as LibraryItemKind,
      name: item.name,
      description: item.description ?? item.sourceType,
      href: typeof item.metadata.href === 'string' ? item.metadata.href : '/library',
      workspaceId: item.workspaceId,
      projectId: item.projectId,
      visibility: item.visibility,
      updatedAt: item.updatedAt,
      metadata: item.metadata,
    }));
}

async function listRecentActivity(agentId: string): Promise<LibraryItem[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('audit_logs')
      .select('id,operation,primitive,workspace_id,session_id,source_type,source_id,metadata,created_at')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(12);
    if (error) return [];
    return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
      id: String(row.id),
      kind: 'recent_activity' as const,
      name: String(row.operation ?? row.primitive ?? 'Activity'),
      description: String(row.source_type ?? row.primitive ?? 'Workspace activity'),
      href: typeof row.source_type === 'string' && typeof row.source_id === 'string'
        ? `/${row.source_type === 'workflow' ? 'workflows' : row.source_type}/${encodeURIComponent(row.source_id)}`
        : '/notifications',
      workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : null,
      projectId: null,
      visibility: 'private',
      updatedAt: String(row.created_at ?? ''),
      metadata: { sourceType: row.source_type ?? null, sourceId: row.source_id ?? null, ...asRecord(row.metadata) },
    }));
  } catch {
    return [];
  }
}

export async function listLibrary(params: {
  ownerAgentId: string;
  workspaceId?: string | null;
  projectId?: string | null;
  search?: string | null;
  limit?: number;
}): Promise<LibraryPayload> {
  const [installedApps, installedSkills, workflows, subagents, memory, files, publishedAssets, explicit, recentActivity] = await Promise.all([
    listInstalledAgentApps(params.ownerAgentId).catch(() => []),
    listInstalledSkills(params.ownerAgentId),
    listWorkflows(params.ownerAgentId),
    listAccessibleSubagents({ viewerAgentId: params.ownerAgentId, workspaceId: params.workspaceId, projectId: params.projectId }).catch(() => []),
    listAccessibleMemoryEntries({ viewerAgentId: params.ownerAgentId, ownerAgentId: params.ownerAgentId, workspaceId: params.workspaceId ?? null, limit: 100 }).catch(() => []),
    listAccessibleFiles({ viewerAgentId: params.ownerAgentId, workspaceId: params.workspaceId ?? undefined, limit: 100 }).catch(() => []),
    listPublishedAssets(params.ownerAgentId),
    listExplicitLibraryItems(params.ownerAgentId),
    listRecentActivity(params.ownerAgentId),
  ]);

  const appItems: LibraryItem[] = await Promise.all(installedApps.map(async entry => {
    const workspaceId = entry.installation.workspaceId ?? entry.app.workspaceId ?? null;
    const installedVersion = entry.app.manifest?.version ?? entry.installation.installedVersion ?? '1.0.0';
    const supportedDeviceTargets = resolveSupportedDeviceTargets(entry.app);
    const cache = await getAgentAppPackageCacheStatus({
      ownerAgentId: params.ownerAgentId,
      workspaceId,
      appId: entry.app.id,
      version: installedVersion,
    });
    return {
      id: entry.installation.id,
      kind: 'installed_app' as const,
      name: entry.app.name,
      description: entry.app.description,
      href: `/appstore/${entry.app.slug}`,
      workspaceId,
      projectId: null,
      visibility: entry.app.visibility,
      updatedAt: entry.installation.updatedAt,
      metadata: {
        appId: entry.app.id,
        slug: entry.app.slug,
        status: entry.installation.status,
        supportedDeviceTargets,
        packageCachedForOfflineInstall: cache.cached,
        packageRef: cache.packageRef,
      },
    };
  }));
  const subagentItems: LibraryItem[] = subagents.map(item => ({
    id: item.id,
    kind: 'subagent',
    name: item.name,
    description: item.description ?? 'Specialist worker',
    href: `/agents/${item.id}`,
    workspaceId: item.workspaceId,
    projectId: item.projectId,
    visibility: item.visibility,
    updatedAt: item.updatedAt,
    metadata: { capabilities: item.exposedCapabilities, status: item.status },
  }));
  const fileItems: LibraryItem[] = files.map(item => ({
    id: item.id,
    kind: 'file',
    name: item.path,
    description: item.contentType ?? String(item.metadata.kind ?? 'File'),
    href: `/files?path=${encodeURIComponent(item.path)}`,
    workspaceId: item.workspaceId,
    projectId: null,
    visibility: item.visibility,
    updatedAt: item.updatedAt,
    metadata: { path: item.path, sizeBytes: item.sizeBytes, ...item.metadata },
  }));
  const memoryItems: LibraryItem[] = memory.map(item => ({
    id: item.id,
    kind: 'memory_collection',
    name: item.key,
    description: item.content,
    href: `/memory?key=${encodeURIComponent(item.key)}`,
    workspaceId: item.workspaceId,
    projectId: item.namespaceType === 'workspace' ? null : item.namespaceId || null,
    visibility: item.visibility,
    updatedAt: item.updatedAt,
    metadata: { namespaceType: item.namespaceType, namespaceId: item.namespaceId, tags: item.tags },
  }));

  const search = params.search?.trim().toLowerCase() ?? '';
  const limit = Math.max(1, Math.min(params.limit ?? 100, 250));
  const items = [...explicit, ...appItems, ...installedSkills, ...workflows, ...subagentItems, ...memoryItems, ...fileItems, ...publishedAssets, ...recentActivity]
    .filter(item => !params.workspaceId || !item.workspaceId || item.workspaceId === params.workspaceId)
    .filter(item => !params.projectId || !item.projectId || item.projectId === params.projectId)
    .filter(item => matchesSearch(item, search))
    .sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')))
    .slice(0, limit);

  await syncItemsToWorkspaceAssetRegistry(params.ownerAgentId, items);
  return groupItems(items);
}
