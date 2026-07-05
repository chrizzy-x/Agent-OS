import crypto from 'crypto';
import { getPlanDescriptor } from '../auth/capabilities.js';
import type { AgentContext } from '../auth/permissions.js';
import { listInstalledAgentApps } from '../appstore/service.js';
import { buildCapabilityGraph, createEmptyCapabilityGraph } from '../capabilities/service.js';
import { listLibrary } from '../library/service.js';
import { listAccessibleMemoryEntries } from '../memory/service.js';
import { listProjects } from '../projects/service.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { listAccessibleSubagents } from '../subagents/service.js';
import { listAgentTasks } from '../tasks/service.js';
import { listVaultSecrets } from '../vault/service.js';
import { listWorkspaces, resolveDefaultWorkspaceForAgent } from '../workspaces/service.js';

type UserRole = 'retail' | 'pro' | 'enterprise' | 'admin';
type ContextSource = 'workspace' | 'project' | 'library' | 'app' | 'skill' | 'workflow' | 'conversation' | 'memory' | 'vault' | 'file' | 'task' | 'notification' | 'mcp' | 'sdk' | 'subagent' | 'capability' | 'runtime';

type WorkspaceContextObject = {
  contextId: string;
  workspaceId: string | null;
  source: ContextSource;
  assetType: string;
  owner: string;
  permissions: string[];
  timestamp: string;
  version: string;
  relevanceScore: number;
  confidenceScore: number;
  freshness: number;
  dependencies: string[];
  metadata: Record<string, unknown>;
  searchIndexRef: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function numberBetween(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashObject(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function freshnessScore(timestamp: string | null): number {
  if (!timestamp) return 0.5;
  const ageMs = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 0.8;
  const ageDays = ageMs / 86_400_000;
  return numberBetween(1 - ageDays / 30, 0.1, 1);
}

function contextObject(params: {
  workspaceId: string | null;
  source: ContextSource;
  assetType: string;
  owner: string;
  assetId: string;
  permissions?: string[];
  timestamp?: string | null;
  version?: string | null;
  relevanceScore: number;
  confidenceScore: number;
  dependencies?: string[];
  metadata?: Record<string, unknown>;
  searchIndexRef?: string | null;
}): WorkspaceContextObject {
  const timestamp = params.timestamp ?? new Date().toISOString();
  return {
    contextId: `${params.source}:${params.assetType}:${params.assetId}`.replace(/\s+/g, '-').toLowerCase(),
    workspaceId: params.workspaceId,
    source: params.source,
    assetType: params.assetType,
    owner: params.owner,
    permissions: params.permissions ?? [],
    timestamp,
    version: params.version ?? '1',
    relevanceScore: numberBetween(params.relevanceScore, 0, 1),
    confidenceScore: numberBetween(params.confidenceScore, 0, 1),
    freshness: freshnessScore(timestamp),
    dependencies: params.dependencies ?? [],
    metadata: params.metadata ?? {},
    searchIndexRef: params.searchIndexRef ?? null,
  };
}

function roleForTier(tier: unknown): UserRole {
  if (tier === 'enterprise_plus' || tier === 'enterprise_max') return 'enterprise';
  if (tier === 'retail_pro') return 'pro';
  return 'retail';
}

async function loadUserProfile(agentId: string): Promise<{ displayName: string; preferences: Record<string, unknown>; roleOverride: UserRole | null }> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('agents')
      .select('id,name,agent_name,metadata,preferences')
      .eq('id', agentId)
      .maybeSingle();
    if (error || !data) return { displayName: agentId, preferences: {}, roleOverride: null };
    const metadata = asRecord(data.metadata);
    const preferences = asRecord(data.preferences ?? metadata.preferences);
    const roleOverride = metadata.ops_admin === true || metadata.role === 'platform_admin' ? 'admin' : null;
    return {
      displayName: typeof data.name === 'string'
        ? data.name
        : typeof data.agent_name === 'string'
          ? data.agent_name
          : agentId,
      preferences,
      roleOverride,
    };
  } catch {
    return { displayName: agentId, preferences: {}, roleOverride: null };
  }
}

async function listInstalledSkills(agentId: string): Promise<Array<Record<string, unknown>>> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('skill_installations')
      .select('id,workspace_id,status,installed_at,skill:skills(id,name,slug,category,description,capabilities,permissions_required,required_secrets)')
      .eq('agent_id', agentId)
      .order('installed_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}

async function listWorkflows(agentId: string, workspaceId: string | null): Promise<Array<Record<string, unknown>>> {
  try {
    let query = getSupabaseAdmin()
      .from('agent_workflows')
      .select('id,name,summary,status,schedule,workspace_id,project_id,updated_at')
      .eq('agent_id', agentId)
      .order('updated_at', { ascending: false });
    if (workspaceId) query = query.eq('workspace_id', workspaceId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}

async function listMcpConnections(): Promise<Array<Record<string, unknown>>> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('mcp_servers')
      .select('id,name,description,active,requires_consensus,tools,updated_at,last_error')
      .order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
      id: String(row.id ?? row.name),
      provider: String(row.name ?? 'MCP'),
      connectionStatus: row.active === false ? 'disabled' : row.last_error ? 'error' : 'connected',
      capabilities: Array.isArray(row.tools) ? row.tools : [],
      permissions: row.requires_consensus ? ['approval_required'] : [],
      authStatus: row.active === false ? 'disabled' : 'connected',
      lastHealthCheck: row.updated_at ?? null,
    }));
  } catch {
    return [];
  }
}

function memorySummary(entries: Awaited<ReturnType<typeof listAccessibleMemoryEntries>>) {
  return entries.map(entry => ({
    id: entry.id,
    scope: entry.namespaceType,
    sourceType: entry.metadata.sourceType ?? entry.namespaceType,
    sourceId: entry.metadata.sourceId ?? entry.namespaceId,
    summary: entry.metadata.summary ?? entry.content.slice(0, 180),
    tags: entry.tags,
    updatedAt: entry.updatedAt,
  }));
}

export async function buildWorkspaceContextPackage(params: {
  ctx: AgentContext;
  workspaceId?: string | null;
  projectId?: string | null;
}) {
  const startedAt = Date.now();
  const [userProfile, workspaces] = await Promise.all([
    loadUserProfile(params.ctx.agentId),
    listWorkspaces(params.ctx.agentId).catch(() => []),
  ]);
  const defaultWorkspace = params.workspaceId
    ? workspaces.find(item => item.id === params.workspaceId) ?? null
    : workspaces[0] ?? await resolveDefaultWorkspaceForAgent(params.ctx.agentId).catch(() => null);
  const workspaceId = params.workspaceId ?? defaultWorkspace?.id ?? null;
  const projectId = params.projectId ?? null;

  const [
    projects,
    installedApps,
    installedSkills,
    workflows,
    subagents,
    mcpConnections,
    library,
    activeTasks,
    recentTasks,
    memoryEntries,
    vault,
    capabilityGraph,
  ] = await Promise.all([
    workspaceId ? listProjects({ ownerAgentId: params.ctx.agentId, workspaceId, status: 'all' }).catch(() => []) : Promise.resolve([]),
    listInstalledAgentApps(params.ctx.agentId).catch(() => []),
    listInstalledSkills(params.ctx.agentId),
    listWorkflows(params.ctx.agentId, workspaceId),
    listAccessibleSubagents({ viewerAgentId: params.ctx.agentId, workspaceId, projectId }).catch(() => []),
    listMcpConnections(),
    listLibrary({ ownerAgentId: params.ctx.agentId, workspaceId, projectId, limit: 100 }).catch(() => ({ items: [], groups: {}, summary: {} })),
    listAgentTasks({ userId: params.ctx.agentId, workspaceId, status: 'all', limit: 50 }).then(tasks => tasks.filter(task => [
      'created',
      'queued',
      'planning',
      'waiting_for_dependencies',
      'waiting_for_approval',
      'awaiting_confirmation',
      'scheduled',
      'running',
      'paused',
      'retrying',
      'cancelling',
    ].includes(task.status))).catch(() => []),
    listAgentTasks({ userId: params.ctx.agentId, workspaceId, status: 'all', limit: 20 }).catch(() => []),
    listAccessibleMemoryEntries({ viewerAgentId: params.ctx.agentId, ownerAgentId: params.ctx.agentId, workspaceId, limit: 40 }).catch(() => []),
    workspaceId ? listVaultSecrets({ ownerAgentId: params.ctx.agentId, workspaceId }).catch(() => ({ secrets: [] })) : Promise.resolve({ secrets: [] }),
    buildCapabilityGraph({ ownerAgentId: params.ctx.agentId, workspaceId, projectId }).catch(() => createEmptyCapabilityGraph()),
  ]);

  const plan = getPlanDescriptor(params.ctx.tier);
  const role = userProfile.roleOverride ?? roleForTier(plan.plan);
  const vaultSecrets = vault.secrets ?? [];
  const capabilityObjects = [...capabilityGraph.availableCapabilities, ...capabilityGraph.unavailableCapabilities];
  const contextObjects = [
    ...(workspaceId ? [contextObject({
      workspaceId,
      source: 'workspace',
      assetType: 'workspace',
      owner: params.ctx.agentId,
      assetId: workspaceId,
      permissions: ['workspace:read'],
      timestamp: defaultWorkspace?.createdAt ?? null,
      relevanceScore: 1,
      confidenceScore: 1,
      metadata: { name: defaultWorkspace?.name ?? null, role },
      searchIndexRef: `workspace:${workspaceId}`,
    })] : []),
    ...projects.map(project => contextObject({
      workspaceId: project.workspaceId,
      source: 'project',
      assetType: 'project',
      owner: params.ctx.agentId,
      assetId: project.id,
      permissions: ['project:read'],
      timestamp: project.updatedAt,
      relevanceScore: project.id === projectId ? 1 : 0.82,
      confidenceScore: 0.95,
      metadata: { name: project.name, status: project.status },
      searchIndexRef: `project:${project.id}`,
    })),
    ...installedApps.map(entry => contextObject({
      workspaceId,
      source: 'app',
      assetType: 'installed_app',
      owner: params.ctx.agentId,
      assetId: entry.app.id,
      permissions: entry.app.permissionsRequired,
      timestamp: entry.installation.installedAt,
      relevanceScore: 0.74,
      confidenceScore: entry.app.disabled ? 0.35 : 0.9,
      dependencies: entry.app.requiredSecrets,
      metadata: { name: entry.app.name, slug: entry.app.slug, status: entry.installation.status, health: entry.app.healthStatus },
      searchIndexRef: `app:${entry.app.slug}`,
    })),
    ...installedSkills.map(item => {
      const skill = asRecord(item.skill);
      return contextObject({
        workspaceId: typeof item.workspace_id === 'string' ? String(item.workspace_id) : workspaceId,
        source: 'skill',
        assetType: 'installed_skill',
        owner: params.ctx.agentId,
        assetId: String(skill.id ?? item.skill_id ?? item.id),
        permissions: stringArray(skill.permissions_required),
        timestamp: typeof item.installed_at === 'string' ? String(item.installed_at) : null,
        relevanceScore: 0.72,
        confidenceScore: 0.9,
        dependencies: stringArray(skill.required_secrets),
        metadata: { name: skill.name ?? null, slug: skill.slug ?? null, category: skill.category ?? null, status: item.status ?? null },
        searchIndexRef: `skill:${String(skill.slug ?? skill.id ?? item.id)}`,
      });
    }),
    ...workflows.map(item => contextObject({
      workspaceId: typeof item.workspace_id === 'string' ? String(item.workspace_id) : workspaceId,
      source: 'workflow',
      assetType: 'workflow',
      owner: params.ctx.agentId,
      assetId: String(item.id),
      permissions: ['run_workflow'],
      timestamp: typeof item.updated_at === 'string' ? String(item.updated_at) : null,
      relevanceScore: item.project_id === projectId ? 0.86 : 0.68,
      confidenceScore: item.status === 'active' ? 0.9 : 0.5,
      metadata: { name: item.name ?? null, status: item.status ?? null, schedule: item.schedule ?? null },
      searchIndexRef: `workflow:${String(item.id)}`,
    })),
    ...subagents.map(item => contextObject({
      workspaceId: item.workspaceId,
      source: 'subagent',
      assetType: 'subagent',
      owner: params.ctx.agentId,
      assetId: item.id,
      permissions: ['agent:invoke'],
      timestamp: item.updatedAt,
      relevanceScore: item.projectId === projectId ? 0.84 : 0.66,
      confidenceScore: item.status === 'active' || item.status === 'running' ? 0.9 : 0.45,
      dependencies: item.exposedCapabilities,
      metadata: { name: item.name, status: item.status, projectId: item.projectId },
      searchIndexRef: `subagent:${item.id}`,
    })),
    ...mcpConnections.map(item => contextObject({
      workspaceId,
      source: 'mcp',
      assetType: 'mcp_server',
      owner: params.ctx.agentId,
      assetId: String(item.id),
      permissions: stringArray(item.permissions),
      timestamp: typeof item.lastHealthCheck === 'string' ? String(item.lastHealthCheck) : null,
      relevanceScore: 0.62,
      confidenceScore: item.connectionStatus === 'connected' ? 0.86 : 0.35,
      dependencies: stringArray(item.capabilities),
      metadata: { provider: item.provider, connectionStatus: item.connectionStatus, authStatus: item.authStatus },
      searchIndexRef: `mcp:${String(item.id)}`,
    })),
    ...library.items.map(item => contextObject({
      workspaceId: item.workspaceId,
      source: item.kind === 'file' ? 'file' : 'library',
      assetType: item.kind,
      owner: params.ctx.agentId,
      assetId: item.id,
      permissions: ['library:read'],
      timestamp: item.updatedAt,
      relevanceScore: item.projectId === projectId ? 0.78 : 0.58,
      confidenceScore: 0.85,
      metadata: { name: item.name, href: item.href, projectId: item.projectId },
      searchIndexRef: `library:${item.id}`,
    })),
    ...activeTasks.map(task => contextObject({
      workspaceId: task.workspaceId,
      source: 'task',
      assetType: 'active_task',
      owner: params.ctx.agentId,
      assetId: task.id,
      permissions: task.requiredPermissions,
      timestamp: task.updatedAt,
      relevanceScore: 0.92,
      confidenceScore: 0.9,
      dependencies: task.capabilityIds,
      metadata: { title: task.title, status: task.status, progress: task.progress },
      searchIndexRef: `task:${task.id}`,
    })),
    ...recentTasks.map(task => contextObject({
      workspaceId: task.workspaceId,
      source: 'task',
      assetType: 'task_history',
      owner: params.ctx.agentId,
      assetId: task.id,
      permissions: task.requiredPermissions,
      timestamp: task.updatedAt,
      relevanceScore: 0.52,
      confidenceScore: 0.8,
      dependencies: task.capabilityIds,
      metadata: { title: task.title, status: task.status, resultSummary: task.resultSummary },
      searchIndexRef: `task:${task.id}`,
    })),
    ...memoryEntries.map(entry => contextObject({
      workspaceId,
      source: 'memory',
      assetType: entry.namespaceType,
      owner: params.ctx.agentId,
      assetId: entry.id,
      permissions: ['memory:read'],
      timestamp: entry.updatedAt,
      relevanceScore: entry.namespaceId === projectId ? 0.84 : 0.6,
      confidenceScore: 0.82,
      metadata: { scope: entry.namespaceType, sourceType: entry.metadata.sourceType ?? entry.namespaceType, tags: entry.tags, summary: entry.metadata.summary ?? entry.content.slice(0, 180) },
      searchIndexRef: `memory:${entry.id}`,
    })),
    ...vaultSecrets.map(secret => contextObject({
      workspaceId,
      source: 'vault',
      assetType: 'secret_metadata',
      owner: params.ctx.agentId,
      assetId: secret.id,
      permissions: ['vault:metadata:read'],
      timestamp: secret.updatedAt,
      relevanceScore: 0.56,
      confidenceScore: secret.status === 'active' ? 0.85 : 0.4,
      metadata: { provider: secret.name.split('_')[0]?.toLowerCase() || 'secret', status: secret.status },
      searchIndexRef: `vault:${secret.id}`,
    })),
    ...capabilityObjects.map(capability => contextObject({
      workspaceId: typeof capability.metadata.workspaceId === 'string' ? capability.metadata.workspaceId : workspaceId,
      source: 'capability',
      assetType: capability.sourceType,
      owner: params.ctx.agentId,
      assetId: capability.id,
      permissions: capability.requiredPermissions,
      timestamp: capability.updatedAt,
      relevanceScore: capability.status === 'available' ? 0.8 : 0.42,
      confidenceScore: capability.confidenceScore,
      dependencies: capability.dependencies,
      metadata: { name: capability.name, status: capability.status, health: capability.health, contract: capability.contract },
      searchIndexRef: `capability:${capability.id}`,
    })),
  ].sort((left, right) => {
    if (right.relevanceScore !== left.relevanceScore) return right.relevanceScore - left.relevanceScore;
    if (right.confidenceScore !== left.confidenceScore) return right.confidenceScore - left.confidenceScore;
    return left.contextId.localeCompare(right.contextId);
  });
  const sourcesUsed = [...new Set(contextObjects.map(item => item.source))].sort();
  const dependencyHash = hashObject(contextObjects.map(item => ({
    id: item.contextId,
    version: item.version,
    timestamp: item.timestamp,
    dependencies: item.dependencies,
  })));
  const contextVersion = `ctx-${dependencyHash.slice(0, 16)}`;
  const tokenEstimate = Math.ceil(JSON.stringify(contextObjects.map(item => ({ id: item.contextId, metadata: item.metadata }))).length / 4);

  return {
    metadata: {
      contextVersion,
      timestamp: new Date().toISOString(),
      buildId: 'workspace-context-engine-v6.6.8',
      workspaceVersion: defaultWorkspace?.createdAt ?? null,
      dependencyHash,
      sourcesUsed,
      cache: { mode: 'event-ready', hit: false },
      permissionChecks: contextObjects.length,
      removedDuplicates: 0,
      finalTokenEstimate: tokenEstimate,
      buildDurationMs: Date.now() - startedAt,
      runtimeRegistryVersion: capabilityGraph.graphVersion,
    },
    contextObjects,
    user: {
      id: params.ctx.agentId,
      displayName: userProfile.displayName,
      role,
      tier: plan.plan,
      preferences: userProfile.preferences,
    },
    workspace: {
      projects,
      library: library.items,
      installedApps: installedApps.map(entry => ({
        id: entry.app.id,
        name: entry.app.name,
        slug: entry.app.slug,
        status: entry.installation.status,
        capabilityStatus: entry.app.disabled ? 'disabled' : entry.app.healthStatus,
      })),
      installedSkills,
      workflows,
      activeWorkflows: workflows.filter(item => item.status === 'active'),
      subagents,
      privateSubagents: subagents,
      mcpConnections,
      activeTasks,
      recentTaskHistory: recentTasks,
    },
    memory: {
      relevantUserMemory: memorySummary(memoryEntries.filter(entry => entry.namespaceType === 'user' || entry.namespaceType === 'agent')),
      relevantProjectMemory: memorySummary(memoryEntries.filter(entry => entry.namespaceType === 'workspace' || entry.namespaceId === projectId)),
      relevantConversationMemory: memorySummary(memoryEntries.filter(entry => entry.namespaceType !== 'user' && entry.namespaceType !== 'agent')),
    },
    vault: {
      availableSecretMetadataOnly: vaultSecrets.map(secret => ({
        secretId: secret.id,
        provider: secret.name.split('_')[0]?.toLowerCase() || 'secret',
        scope: workspaceId ? `workspace:${workspaceId}` : 'workspace',
        permissionRequirement: 'server-side runtime access only',
        availabilityStatus: secret.status,
      })),
    },
    capabilityGraph: {
      availableCapabilities: capabilityGraph.availableCapabilities,
      unavailableCapabilities: capabilityGraph.unavailableCapabilities,
      needsConfiguration: capabilityGraph.needsConfiguration,
      summary: capabilityGraph.summary,
      graphVersion: capabilityGraph.graphVersion,
      generatedAt: capabilityGraph.generatedAt,
      relationships: capabilityGraph.relationships,
    },
    runtimeRegistry: {
      assets: capabilityGraph.registryAssets,
      graphVersion: capabilityGraph.graphVersion,
      contract: capabilityGraph.runtimeContract,
    },
  };
}
