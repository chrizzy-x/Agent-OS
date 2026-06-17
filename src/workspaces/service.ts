import { randomUUID } from 'crypto';
import { normalizeAgentDisplayName } from '../auth/agent-names.js';
import { normalizePlan } from '../auth/tiers.js';
import { readLocalRuntimeState, updateLocalRuntimeState } from '../storage/local-state.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { PermissionError } from '../utils/errors.js';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: string;
  createdAt: string;
};

export type WorkspaceMember = {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
};

export type WorkspaceAgent = {
  workspaceId: string;
  agentId: string;
  agentName: string | null;
  addedAt: string;
};

export type WorkspaceMemberProfile = WorkspaceMember & {
  name: string | null;
  email: string | null;
};

export type WorkspaceAudit = {
  id: string;
  workspaceId: string;
  actorId: string | null;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

const localWorkspaces = new Map<string, Workspace>();
const localMembers = new Map<string, WorkspaceMember[]>();
const localAgents = new Map<string, WorkspaceAgent[]>();
const localAudit = new Map<string, WorkspaceAudit[]>();

function mapPersistedWorkspace(row: {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: string;
  createdAt: string;
}): Workspace {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    ownerId: row.ownerId,
    plan: row.plan,
    createdAt: row.createdAt,
  };
}

function mapWorkspaceJoin(value: unknown): Workspace | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object') return null;
  const ws = row as Record<string, unknown>;
  const id = typeof ws.id === 'string' ? ws.id : '';
  if (!id) return null;
  return {
    id,
    name: typeof ws.name === 'string' ? ws.name : 'Workspace',
    slug: typeof ws.slug === 'string' ? ws.slug : normalizeSlug(id),
    ownerId: typeof ws.owner_id === 'string' ? ws.owner_id : '',
    plan: typeof ws.plan === 'string' ? normalizePlan(ws.plan) : 'retail_free',
    createdAt: String(ws.created_at ?? new Date().toISOString()),
  };
}

async function listPersistedLocalWorkspaces(userId: string): Promise<Workspace[]> {
  const state = await readLocalRuntimeState();
  const memberWorkspaceIds = new Set(
    state.workspaceMembers
      .filter(member => member.userId === userId)
      .map(member => member.workspaceId),
  );
  return state.workspaces
    .filter(workspace => memberWorkspaceIds.has(workspace.id))
    .map(mapPersistedWorkspace);
}

async function persistLocalWorkspace(workspace: Workspace): Promise<void> {
  await updateLocalRuntimeState(state => {
    state.workspaces = [
      {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        ownerId: workspace.ownerId,
        plan: workspace.plan,
        createdAt: workspace.createdAt,
      },
      ...state.workspaces.filter(item => item.id !== workspace.id),
    ];
    state.workspaceMembers = [
      {
        workspaceId: workspace.id,
        userId: workspace.ownerId,
        role: 'owner',
        joinedAt: workspace.createdAt,
      },
      ...state.workspaceMembers.filter(item => !(item.workspaceId === workspace.id && item.userId === workspace.ownerId)),
    ];
  });
}

function normalizeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50) || `workspace-${randomUUID().slice(0, 8)}`;
}

async function appendAudit(workspaceId: string, actorId: string | null, action: string, metadata: Record<string, unknown>): Promise<void> {
  const entry: WorkspaceAudit = {
    id: randomUUID(),
    workspaceId,
    actorId,
    action,
    metadata,
    createdAt: new Date().toISOString(),
  };

  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('workspace_audit_logs').insert({
      workspace_id: workspaceId,
      actor_id: actorId,
      action,
      metadata,
    });
  } catch {
    const entries = localAudit.get(workspaceId) ?? [];
    entries.unshift(entry);
    localAudit.set(workspaceId, entries);
  }
}

export async function listWorkspaces(userId: string): Promise<Workspace[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('workspace_members')
      .select('workspaces(id,name,slug,owner_id,plan,created_at)')
      .eq('user_id', userId);

    if (!error) {
      const remoteWorkspaces = ((data ?? []) as Array<Record<string, unknown>>).flatMap(row => {
        const workspace = mapWorkspaceJoin(row.workspaces);
        return workspace ? [workspace] : [];
      });
      if (remoteWorkspaces.length > 0) return remoteWorkspaces;
    }

    const owned = await supabase
      .from('workspaces')
      .select('id,name,slug,owner_id,plan,created_at')
      .eq('owner_id', userId);
    if (!owned.error && owned.data?.length) {
      return ((owned.data ?? []) as Array<Record<string, unknown>>)
        .map(row => mapWorkspaceJoin(row))
        .filter((workspace): workspace is Workspace => Boolean(workspace));
    }
  } catch {
    // Fall back to local state below.
  }

  const memoryWorkspaces = [...localWorkspaces.values()].filter(ws => {
    const members = localMembers.get(ws.id) ?? [];
    return members.some(m => m.userId === userId);
  });
  if (memoryWorkspaces.length > 0) return memoryWorkspaces;

  return listPersistedLocalWorkspaces(userId);
}

export async function assertWorkspaceMembership(workspaceId: string, userId: string): Promise<{
  workspace: Workspace;
  role: WorkspaceRole;
}> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('workspace_members')
      .select('role, workspaces(id,name,slug,owner_id,plan,created_at)')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      const row = data as Record<string, unknown>;
      const workspace = mapWorkspaceJoin(row.workspaces);
      if (workspace) {
        return {
          role: (row.role as WorkspaceRole) ?? 'member',
          workspace,
        };
      }
    }

    const member = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!member.error && member.data) {
      const workspaceResult = await supabase
        .from('workspaces')
        .select('id,name,slug,owner_id,plan,created_at')
        .eq('id', workspaceId)
        .maybeSingle();
      const workspace = !workspaceResult.error ? mapWorkspaceJoin(workspaceResult.data) : null;
      if (workspace) {
        return {
          role: ((member.data as Record<string, unknown>).role as WorkspaceRole) ?? 'member',
          workspace,
        };
      }
    }
  } catch {
    // Fall back to local state below.
  }

  const workspace = localWorkspaces.get(workspaceId);
  const member = (localMembers.get(workspaceId) ?? []).find(item => item.userId === userId);
  if (workspace && member) {
    return { workspace, role: member.role };
  }

  const state = await readLocalRuntimeState();
  const persistedWorkspace = state.workspaces.find(item => item.id === workspaceId);
  const persistedMember = state.workspaceMembers.find(item => item.workspaceId === workspaceId && item.userId === userId);
  if (persistedWorkspace && persistedMember) {
    return { workspace: mapPersistedWorkspace(persistedWorkspace), role: persistedMember.role };
  }

  throw new PermissionError('Workspace not found or not accessible');
}

export async function assertWorkspaceOwnership(workspaceId: string, userId: string): Promise<Workspace> {
  const membership = await assertWorkspaceMembership(workspaceId, userId);
  if (membership.workspace.ownerId !== userId && membership.role !== 'owner' && membership.role !== 'admin') {
    throw new PermissionError('Workspace owner or admin access required');
  }
  return membership.workspace;
}

export async function resolveDefaultWorkspaceForAgent(userId: string): Promise<Workspace | null> {
  const workspaces = await listWorkspaces(userId);
  return workspaces[0] ?? null;
}

export async function createWorkspace(params: { name: string; ownerId: string; slug?: string; plan?: string }): Promise<Workspace> {
  const workspace: Workspace = {
    id: randomUUID(),
    name: params.name,
    slug: params.slug?.trim() || normalizeSlug(params.name),
    ownerId: params.ownerId,
    plan: normalizePlan(params.plan ?? 'retail_free'),
    createdAt: new Date().toISOString(),
  };

  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('workspaces').insert({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      owner_id: workspace.ownerId,
      plan: workspace.plan,
    });
    await supabase.from('workspace_members').insert({
      workspace_id: workspace.id,
      user_id: workspace.ownerId,
      role: 'owner',
    });
  } catch {
    localWorkspaces.set(workspace.id, workspace);
    localMembers.set(workspace.id, [{ workspaceId: workspace.id, userId: workspace.ownerId, role: 'owner', joinedAt: workspace.createdAt }]);
  }

  localWorkspaces.set(workspace.id, workspace);
  localMembers.set(workspace.id, [{ workspaceId: workspace.id, userId: workspace.ownerId, role: 'owner', joinedAt: workspace.createdAt }]);
  await persistLocalWorkspace(workspace);
  await appendAudit(workspace.id, workspace.ownerId, 'workspace.created', { slug: workspace.slug });
  return workspace;
}

export async function addWorkspaceMember(params: { workspaceId: string; userId: string; role: WorkspaceRole; actorId: string }): Promise<WorkspaceMember> {
  const member: WorkspaceMember = {
    workspaceId: params.workspaceId,
    userId: params.userId,
    role: params.role,
    joinedAt: new Date().toISOString(),
  };

  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('workspace_members').upsert({
      workspace_id: member.workspaceId,
      user_id: member.userId,
      role: member.role,
    });
  } catch {
    const members = localMembers.get(member.workspaceId) ?? [];
    const existing = members.findIndex(item => item.userId === member.userId);
    if (existing >= 0) {
      members[existing] = member;
    } else {
      members.push(member);
    }
    localMembers.set(member.workspaceId, members);
  }

  await appendAudit(member.workspaceId, params.actorId, 'workspace.member_added', { userId: member.userId, role: member.role });
  return member;
}

async function getAccountProfileMap(userIds: string[]): Promise<Map<string, { name: string | null; email: string | null }>> {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  const profiles = new Map<string, { name: string | null; email: string | null }>();
  if (uniqueIds.length === 0) return profiles;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('agents')
      .select('id,name,metadata')
      .in('id', uniqueIds);

    if (!error && data) {
      for (const row of data as Array<Record<string, unknown>>) {
        const metadata = (row.metadata as Record<string, unknown> | null | undefined) ?? {};
        profiles.set(String(row.id), {
          name: typeof row.name === 'string' ? row.name : null,
          email: typeof metadata.email === 'string' ? metadata.email : null,
        });
      }
      return profiles;
    }
  } catch {
    // Fall back to local state below.
  }

  const state = await readLocalRuntimeState();
  for (const account of Object.values(state.accounts)) {
    if (uniqueIds.includes(account.agentId)) {
      profiles.set(account.agentId, { name: account.agentName, email: account.email });
    }
  }
  return profiles;
}

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberProfile[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('workspace_members')
      .select('workspace_id,user_id,role,joined_at')
      .eq('workspace_id', workspaceId)
      .order('joined_at', { ascending: true });

    if (!error) {
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const profiles = await getAccountProfileMap(rows.map(row => String(row.user_id)));
      return rows.map(row => ({
        workspaceId: String(row.workspace_id),
        userId: String(row.user_id),
        role: (row.role as WorkspaceRole) ?? 'member',
        joinedAt: String(row.joined_at ?? new Date().toISOString()),
        name: profiles.get(String(row.user_id))?.name ?? null,
        email: profiles.get(String(row.user_id))?.email ?? null,
      }));
    }
  } catch {
    // Fall back to local state below.
  }

  const members = [...(localMembers.get(workspaceId) ?? [])];
  const profiles = await getAccountProfileMap(members.map(member => member.userId));
  return members.map(member => ({
    ...member,
    name: profiles.get(member.userId)?.name ?? null,
    email: profiles.get(member.userId)?.email ?? null,
  }));
}

export async function updateWorkspaceMemberRole(params: {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  actorId: string;
}): Promise<WorkspaceMember> {
  if (params.role === 'owner') {
    throw new PermissionError('Owner role cannot be reassigned from this endpoint');
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('workspace_members')
      .update({ role: params.role })
      .eq('workspace_id', params.workspaceId)
      .eq('user_id', params.userId)
      .select('workspace_id,user_id,role,joined_at')
      .maybeSingle();

    if (error) throw error;
    if (data) {
      const member: WorkspaceMember = {
        workspaceId: String(data.workspace_id),
        userId: String(data.user_id),
        role: (data.role as WorkspaceRole) ?? params.role,
        joinedAt: String(data.joined_at ?? new Date().toISOString()),
      };
      await appendAudit(params.workspaceId, params.actorId, 'workspace.member_role_updated', { userId: member.userId, role: member.role });
      return member;
    }
  } catch {
    // Fall back to local state below.
  }

  const members = localMembers.get(params.workspaceId) ?? [];
  const existing = members.find(member => member.userId === params.userId);
  if (!existing) {
    throw new PermissionError('Workspace member not found');
  }
  existing.role = params.role;
  await appendAudit(params.workspaceId, params.actorId, 'workspace.member_role_updated', { userId: existing.userId, role: existing.role });
  return existing;
}

export async function removeWorkspaceMember(params: {
  workspaceId: string;
  userId: string;
  actorId: string;
}): Promise<{ removed: boolean }> {
  const workspace = await assertWorkspaceOwnership(params.workspaceId, params.actorId);
  if (workspace.ownerId === params.userId) {
    throw new PermissionError('Workspace owner cannot be removed');
  }

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', params.workspaceId)
      .eq('user_id', params.userId);
    if (error) throw error;
  } catch {
    const members = localMembers.get(params.workspaceId) ?? [];
    localMembers.set(params.workspaceId, members.filter(member => member.userId !== params.userId));
  }

  await appendAudit(params.workspaceId, params.actorId, 'workspace.member_removed', { userId: params.userId });
  return { removed: true };
}

export async function updateWorkspace(params: {
  workspaceId: string;
  actorId: string;
  name?: string;
  metadata?: Record<string, unknown>;
}): Promise<Workspace> {
  const existing = await assertWorkspaceOwnership(params.workspaceId, params.actorId);
  const nextName = typeof params.name === 'string' && params.name.trim() ? params.name.trim() : existing.name;
  const nextSlug = normalizeSlug(nextName);

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('workspaces')
      .update({
        name: nextName,
        slug: nextSlug,
        metadata: params.metadata ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.workspaceId)
      .select('id,name,slug,owner_id,plan,created_at')
      .maybeSingle();

    if (error) throw error;
    if (data) {
      await appendAudit(params.workspaceId, params.actorId, 'workspace.updated', { name: nextName });
      return {
        id: String(data.id),
        name: String(data.name),
        slug: String(data.slug),
        ownerId: String(data.owner_id),
        plan: String(data.plan),
        createdAt: String(data.created_at),
      };
    }
  } catch {
    // Fall back to local state below.
  }

  const workspace = localWorkspaces.get(params.workspaceId);
  if (!workspace) {
    throw new PermissionError('Workspace not found or not accessible');
  }
  workspace.name = nextName;
  workspace.slug = nextSlug;
  await appendAudit(params.workspaceId, params.actorId, 'workspace.updated', { name: nextName });
  return workspace;
}

export async function addWorkspaceAgent(params: { workspaceId: string; agentId: string; actorId: string }): Promise<WorkspaceAgent> {
  const item: WorkspaceAgent = {
    workspaceId: params.workspaceId,
    agentId: params.agentId,
    agentName: null,
    addedAt: new Date().toISOString(),
  };

  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('workspace_agents').upsert({
      workspace_id: item.workspaceId,
      agent_id: item.agentId,
    });
  } catch {
    const agents = localAgents.get(item.workspaceId) ?? [];
    if (!agents.some(entry => entry.agentId === item.agentId)) {
      agents.push(item);
      localAgents.set(item.workspaceId, agents);
    }
  }

  const nameMap = await getAgentNameMap([item.agentId]);
  item.agentName = nameMap.get(item.agentId) ?? null;
  await appendAudit(item.workspaceId, params.actorId, 'workspace.agent_added', { agentName: item.agentName ?? 'Private agent' });
  return item;
}

export async function resolveWorkspaceAgentByName(agentName: string): Promise<{ agentId: string; agentName: string } | null> {
  const name = agentName.trim();
  if (!name) return null;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('agents')
      .select('id,name')
      .eq('name', name)
      .limit(2);

    if (!error && data && data.length === 1) {
      const row = data[0] as Record<string, unknown>;
      return { agentId: String(row.id), agentName: String(row.name) };
    }
  } catch {
    // Fall back to local state below.
  }

  const normalizedName = normalizeAgentDisplayName(name);
  if (!normalizedName) return null;

  const state = await readLocalRuntimeState();
  const matches = [
    ...Object.values(state.accounts).map(account => ({ agentId: account.agentId, agentName: account.agentName })),
    ...Object.values(state.externalAgents).map(agent => ({ agentId: agent.agent_id, agentName: agent.name })),
  ].filter(agent => normalizeAgentDisplayName(agent.agentName) === normalizedName);

  return matches.length === 1 ? matches[0] : null;
}

async function getAgentNameMap(agentIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(agentIds)].filter(Boolean);
  const names = new Map<string, string>();
  if (uniqueIds.length === 0) return names;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('agents')
      .select('id,name')
      .in('id', uniqueIds);

    if (!error && data) {
      for (const row of data as Array<Record<string, unknown>>) {
        names.set(String(row.id), String(row.name));
      }
      return names;
    }
  } catch {
    // Fall back to local state below.
  }

  const state = await readLocalRuntimeState();
  for (const account of Object.values(state.accounts)) {
    if (uniqueIds.includes(account.agentId)) names.set(account.agentId, account.agentName);
  }
  for (const agent of Object.values(state.externalAgents)) {
    if (uniqueIds.includes(agent.agent_id)) names.set(agent.agent_id, agent.name);
  }

  return names;
}

export async function listWorkspaceAgents(workspaceId: string): Promise<WorkspaceAgent[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('workspace_agents')
      .select('workspace_id,agent_id,added_at')
      .eq('workspace_id', workspaceId)
      .order('added_at', { ascending: false });

    if (!error) {
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const nameMap = await getAgentNameMap(rows.map(row => String(row.agent_id)));
      return rows.map(row => ({
        workspaceId: String(row.workspace_id),
        agentId: String(row.agent_id),
        agentName: nameMap.get(String(row.agent_id)) ?? null,
        addedAt: String(row.added_at),
      }));
    }
  } catch {
    // Fall back to local state below.
  }

  return [...(localAgents.get(workspaceId) ?? [])].sort((left, right) => right.addedAt.localeCompare(left.addedAt));
}

export async function getWorkspaceAudit(workspaceId: string): Promise<WorkspaceAudit[]> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('workspace_audit_logs')
      .select('id,workspace_id,actor_id,action,metadata,created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error) {
      return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
        id: String(row.id),
        workspaceId: String(row.workspace_id),
        actorId: typeof row.actor_id === 'string' ? row.actor_id : null,
        action: String(row.action),
        metadata: (row.metadata as Record<string, unknown> | null | undefined) ?? {},
        createdAt: String(row.created_at),
      }));
    }
  } catch {
    // Fall back to local state below.
  }

  return [...(localAudit.get(workspaceId) ?? [])].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
