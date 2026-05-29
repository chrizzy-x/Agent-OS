import { randomUUID } from 'crypto';
import { normalizeAgentDisplayName } from '../auth/agent-names.js';
import { readLocalRuntimeState } from '../storage/local-state.js';
import { getSupabaseAdmin } from '../storage/supabase.js';

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
      return ((data ?? []) as Array<Record<string, unknown>>).flatMap(row => {
        const ws = row.workspaces as Record<string, unknown> | null;
        if (!ws) return [];
        return [{
          id: String(ws.id),
          name: String(ws.name),
          slug: String(ws.slug),
          ownerId: String(ws.owner_id),
          plan: String(ws.plan),
          createdAt: String(ws.created_at),
        }];
      });
    }
  } catch {
    // Fall back to local state below.
  }

  return [...localWorkspaces.values()].filter(ws => {
    const members = localMembers.get(ws.id) ?? [];
    return members.some(m => m.userId === userId);
  });
}

export async function createWorkspace(params: { name: string; ownerId: string; slug?: string; plan?: string }): Promise<Workspace> {
  const workspace: Workspace = {
    id: randomUUID(),
    name: params.name,
    slug: params.slug?.trim() || normalizeSlug(params.name),
    ownerId: params.ownerId,
    plan: params.plan ?? 'free',
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
