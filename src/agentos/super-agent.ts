import { getSupabaseAdmin } from '../storage/supabase.js';
import { PermissionError, ValidationError } from '../utils/errors.js';

export type SuperAgentProfile = {
  id: string;
  workspaceId: string;
  name: string;
  status: string;
  instructionProfileId: string | null;
  instructions: string;
  instructionVersion: number;
  updatedAt: string;
};

function mapProfile(params: {
  superAgent: Record<string, unknown>;
  profile: Record<string, unknown> | null;
}): SuperAgentProfile {
  return {
    id: String(params.superAgent.id),
    workspaceId: String(params.superAgent.workspace_id),
    name: typeof params.superAgent.name === 'string' ? params.superAgent.name : 'Super AgentOS',
    status: typeof params.superAgent.status === 'string' ? params.superAgent.status : 'active',
    instructionProfileId: typeof params.superAgent.instruction_profile_id === 'string'
      ? params.superAgent.instruction_profile_id
      : null,
    instructions: typeof params.profile?.instructions === 'string' ? params.profile.instructions : '',
    instructionVersion: Number(params.profile?.version ?? 1),
    updatedAt: String(params.superAgent.updated_at ?? params.profile?.updated_at ?? new Date().toISOString()),
  };
}

export async function getSuperAgentProfile(params: {
  ownerAgentId: string;
  workspaceId?: string;
}): Promise<SuperAgentProfile> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('super_agents')
    .select('*')
    .eq('owner_agent_id', params.ownerAgentId)
    .order('created_at', { ascending: true })
    .limit(1);

  if (params.workspaceId) {
    query = query.eq('workspace_id', params.workspaceId);
  }

  const { data: superAgent, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to load Super AgentOS profile: ${error.message}`);
  if (!superAgent) throw new PermissionError('Super AgentOS profile not found');

  const instructionProfileId = typeof superAgent.instruction_profile_id === 'string'
    ? superAgent.instruction_profile_id
    : null;
  let profile: Record<string, unknown> | null = null;
  if (instructionProfileId) {
    const { data: profileRow, error: profileError } = await supabase
      .from('instruction_profiles')
      .select('*')
      .eq('id', instructionProfileId)
      .eq('owner_agent_id', params.ownerAgentId)
      .maybeSingle();
    if (profileError) throw new Error(`Failed to load Super AgentOS instructions: ${profileError.message}`);
    profile = (profileRow as Record<string, unknown> | null | undefined) ?? null;
  }

  return mapProfile({ superAgent: superAgent as Record<string, unknown>, profile });
}

export async function updateSuperAgentInstructions(params: {
  ownerAgentId: string;
  workspaceId?: string;
  instructions: string;
}): Promise<SuperAgentProfile> {
  const instructions = params.instructions.trim();
  if (!instructions) throw new ValidationError('instructions are required');
  if (instructions.length > 30_000) throw new ValidationError('instructions exceed maximum supported length');

  const current = await getSuperAgentProfile({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
  });
  if (!current.instructionProfileId) {
    throw new PermissionError('Super AgentOS instructions profile is missing');
  }

  const supabase = getSupabaseAdmin();
  const nextVersion = current.instructionVersion + 1;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('instruction_profiles')
    .update({
      instructions,
      version: nextVersion,
      updated_at: now,
    })
    .eq('id', current.instructionProfileId)
    .eq('owner_agent_id', params.ownerAgentId);

  if (error) throw new Error(`Failed to update Super AgentOS instructions: ${error.message}`);
  return getSuperAgentProfile({ ownerAgentId: params.ownerAgentId, workspaceId: params.workspaceId });
}
