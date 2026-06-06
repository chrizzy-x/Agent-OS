import crypto from 'crypto';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { resolveProjectForWorkspace } from '../projects/service.js';
import { PermissionError, ValidationError } from '../utils/errors.js';
import { assertWorkspaceMembership } from '../workspaces/service.js';

export type PrivateSubagent = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  ownerAgentId: string;
  name: string;
  description: string | null;
  instructions: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

function mapSubagent(row: Record<string, unknown>): PrivateSubagent {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    projectId: typeof row.project_id === 'string' ? row.project_id : null,
    ownerAgentId: String(row.owner_agent_id),
    name: String(row.name),
    description: typeof row.description === 'string' ? row.description : null,
    instructions: typeof row.instructions === 'string' ? row.instructions : '',
    status: typeof row.status === 'string' ? row.status : 'active',
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

export async function listPrivateSubagents(params: {
  ownerAgentId: string;
  workspaceId?: string | null;
  projectId?: string | null;
}): Promise<PrivateSubagent[]> {
  let query = getSupabaseAdmin()
    .from('private_subagents')
    .select('*')
    .eq('owner_agent_id', params.ownerAgentId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (params.workspaceId) query = query.eq('workspace_id', params.workspaceId);
  if (params.projectId) query = query.eq('project_id', params.projectId);
  const { data, error } = await query;

  if (error) throw new Error(`Failed to list private subagents: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapSubagent);
}

export async function getPrivateSubagent(ownerAgentId: string, subagentId: string): Promise<PrivateSubagent> {
  const { data, error } = await getSupabaseAdmin()
    .from('private_subagents')
    .select('*')
    .eq('id', subagentId)
    .eq('owner_agent_id', ownerAgentId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load private subagent: ${error.message}`);
  if (!data) throw new PermissionError('Private subagent not found or not accessible');
  return mapSubagent(data as Record<string, unknown>);
}

export async function createPrivateSubagent(params: {
  ownerAgentId: string;
  workspaceId: string;
  projectId?: string | null;
  name: string;
  description?: string | null;
  instructions?: string;
}): Promise<PrivateSubagent> {
  const name = params.name.trim();
  if (!name) throw new ValidationError('Subagent name is required');
  await assertWorkspaceMembership(params.workspaceId, params.ownerAgentId);
  const project = await resolveProjectForWorkspace({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
    projectId: params.projectId,
  });

  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from('private_subagents')
    .insert({
      id: crypto.randomUUID(),
      workspace_id: params.workspaceId,
      project_id: project.id,
      owner_agent_id: params.ownerAgentId,
      name: name.slice(0, 120),
      description: params.description?.trim() || null,
      instructions: params.instructions?.trim() || 'Use AgentOS tools only when explicitly needed. Keep outputs concise, safe, and scoped to the user workspace.',
      status: 'active',
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create private subagent: ${error.message}`);
  return mapSubagent(data as Record<string, unknown>);
}

export async function updatePrivateSubagent(params: {
  ownerAgentId: string;
  subagentId: string;
  name?: string;
  description?: string | null;
  instructions?: string;
  projectId?: string | null;
  status?: 'active' | 'archived';
}): Promise<PrivateSubagent> {
  const current = await getPrivateSubagent(params.ownerAgentId, params.subagentId);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.name !== undefined) patch.name = params.name.trim().slice(0, 120);
  if (params.description !== undefined) patch.description = params.description?.trim() || null;
  if (params.instructions !== undefined) patch.instructions = params.instructions;
  if (params.projectId !== undefined) {
    const project = await resolveProjectForWorkspace({
      ownerAgentId: params.ownerAgentId,
      workspaceId: current.workspaceId,
      projectId: params.projectId,
    });
    patch.project_id = project.id;
  }
  if (params.status !== undefined) patch.status = params.status;

  const { data, error } = await getSupabaseAdmin()
    .from('private_subagents')
    .update(patch)
    .eq('id', params.subagentId)
    .eq('owner_agent_id', params.ownerAgentId)
    .select()
    .maybeSingle();

  if (error) throw new Error(`Failed to update private subagent: ${error.message}`);
  if (!data) throw new PermissionError('Private subagent not found or not accessible');
  return mapSubagent(data as Record<string, unknown>);
}
