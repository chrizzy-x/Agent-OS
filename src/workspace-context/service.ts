import { getPlanDescriptor } from '../auth/capabilities.js';
import type { AgentContext } from '../auth/permissions.js';
import { listInstalledAgentApps } from '../appstore/service.js';
import { buildCapabilityGraph } from '../capabilities/service.js';
import { listLibrary } from '../library/service.js';
import { listAccessibleMemoryEntries } from '../memory/service.js';
import { listProjects } from '../projects/service.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { listAccessibleSubagents } from '../subagents/service.js';
import { listAgentTasks } from '../tasks/service.js';
import { listVaultSecrets } from '../vault/service.js';
import { listWorkspaces, resolveDefaultWorkspaceForAgent } from '../workspaces/service.js';

type UserRole = 'retail' | 'pro' | 'enterprise' | 'admin';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
    listAgentTasks({ userId: params.ctx.agentId, workspaceId, status: 'all', limit: 50 }).then(tasks => tasks.filter(task => ['queued', 'planning', 'awaiting_confirmation', 'running', 'paused'].includes(task.status))).catch(() => []),
    listAgentTasks({ userId: params.ctx.agentId, workspaceId, status: 'all', limit: 20 }).catch(() => []),
    listAccessibleMemoryEntries({ viewerAgentId: params.ctx.agentId, ownerAgentId: params.ctx.agentId, workspaceId, limit: 40 }).catch(() => []),
    workspaceId ? listVaultSecrets({ ownerAgentId: params.ctx.agentId, workspaceId }).catch(() => ({ secrets: [] })) : Promise.resolve({ secrets: [] }),
    buildCapabilityGraph({ ownerAgentId: params.ctx.agentId, workspaceId, projectId }).catch(() => ({
      availableCapabilities: [],
      unavailableCapabilities: [],
      needsConfiguration: [],
      summary: {
        total: 0,
        available: 0,
        needsConfiguration: 0,
        disabled: 0,
        error: 0,
        bySourceType: { system: 0, app: 0, skill: 0, workflow: 0, subagent: 0, mcp: 0, project: 0, library: 0 },
      },
    })),
  ]);

  const plan = getPlanDescriptor(params.ctx.tier);
  const role = userProfile.roleOverride ?? roleForTier(plan.plan);

  return {
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
      availableSecretMetadataOnly: (vault.secrets ?? []).map(secret => ({
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
    },
  };
}
