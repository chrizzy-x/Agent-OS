import crypto from 'crypto';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { normalizePlan, PLAN_LABELS, type AccountType, type AgentPlan } from '../auth/tiers.js';

export type AgentOSProvisioningResult = {
  workspaceId: string;
  superAgentId: string;
  instructionProfileId: string;
  studioSessionId: string;
  vaultId: string;
};

function stableId(prefix: string, agentId: string, suffix = ''): string {
  return `${prefix}_${agentId.replace(/[^a-zA-Z0-9_-]/g, '_')}${suffix}`;
}

function stableUuid(seed: string): string {
  const hex = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20, 32).join('')}`;
}

function workspaceName(agentName: string | null | undefined, accountType: AccountType): string {
  if (accountType === 'enterprise') return `${agentName || 'AgentOS'} Organization`;
  return `${agentName || 'My'} Workspace`;
}

function workspaceSlug(agentId: string): string {
  return `workspace-${agentId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 46)}`;
}

async function upsert(table: string, payload: Record<string, unknown>, conflict = 'id'): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from(table).upsert(payload, { onConflict: conflict });
  if (error) {
    throw new Error(`Failed to provision ${table}: ${error.message}`);
  }
}

async function resolveProvisionedWorkspaceId(agentId: string): Promise<string> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('workspaces')
      .select('id')
      .eq('owner_id', agentId)
      .order('created_at', { ascending: true })
      .maybeSingle();
    if (!error && typeof data?.id === 'string' && data.id.trim()) {
      return data.id;
    }
  } catch {
    // Fall back to deterministic UUID below.
  }

  return stableUuid(`workspace:${agentId}`);
}

export async function provisionAgentOSAccount(params: {
  agentId: string;
  agentName: string;
  email: string;
  accountType: AccountType;
  plan: AgentPlan;
}): Promise<AgentOSProvisioningResult> {
  const now = new Date().toISOString();
  const workspaceId = await resolveProvisionedWorkspaceId(params.agentId);
  const superAgentId = stableId('super_agentos', params.agentId);
  const instructionProfileId = stableId('instructions', params.agentId, '_default');
  const studioSessionId = stableId('studio_session', params.agentId, '_default');
  const vaultId = stableId('vault', workspaceId);
  const label = PLAN_LABELS[params.plan];

  await upsert('workspaces', {
    id: workspaceId,
    name: workspaceName(params.agentName, params.accountType),
    slug: workspaceSlug(params.agentId),
    owner_id: params.agentId,
    plan: params.plan,
    created_at: now,
    updated_at: now,
    metadata: {
      account_type: params.accountType,
      plan_label: label,
      plan_price_usd: 0,
    },
  });

  await upsert('workspace_members', {
    workspace_id: workspaceId,
    user_id: params.agentId,
    role: 'owner',
    joined_at: now,
  }, 'workspace_id,user_id');

  await upsert('workspace_agents', {
    workspace_id: workspaceId,
    agent_id: params.agentId,
    added_at: now,
  }, 'workspace_id,agent_id');

  await upsert('instruction_profiles', {
    id: instructionProfileId,
    workspace_id: workspaceId,
    owner_agent_id: params.agentId,
    subject_type: 'super_agentos',
    subject_id: superAgentId,
    instructions: 'You are Super AgentOS. Drive the user through persistent NL Studio conversations, create private workflows/subagents, use installed skills, request vault access when needed, and never expose secrets.',
    version: 1,
    created_at: now,
    updated_at: now,
  });

  await upsert('super_agents', {
    id: superAgentId,
    workspace_id: workspaceId,
    owner_agent_id: params.agentId,
    name: 'Super AgentOS',
    instruction_profile_id: instructionProfileId,
    status: 'active',
    metadata: {
      provisioned_after_signup: true,
      plan: params.plan,
      plan_label: label,
    },
    created_at: now,
    updated_at: now,
  });

  await upsert('nl_studio_sessions', {
    id: studioSessionId,
    workspace_id: workspaceId,
    owner_agent_id: params.agentId,
    super_agent_id: superAgentId,
    title: 'AgentOS Studio',
    status: 'active',
    state: {
      workflowGraph: { nodes: [], edges: [] },
      workflowCode: '{\n  "version": "1.0.0",\n  "nodes": [],\n  "edges": []\n}',
      artifacts: [],
      approvals: [],
      installedSkills: [],
    },
    created_at: now,
    updated_at: now,
  });

  await upsert('vaults', {
    id: vaultId,
    workspace_id: workspaceId,
    owner_agent_id: params.agentId,
    name: params.accountType === 'enterprise' ? 'Organization Vault' : 'Personal Vault',
    scope: params.accountType === 'enterprise' ? 'organization' : 'personal',
    created_at: now,
    updated_at: now,
  });

  await upsert('nl_studio_events', {
    id: stableId('event', params.agentId, '_provisioned'),
    session_id: studioSessionId,
    workspace_id: workspaceId,
    owner_agent_id: params.agentId,
    type: 'version_created',
    payload: {
      message: 'Initial Super AgentOS workspace provisioned.',
      plan: params.plan,
    },
    created_at: now,
  });

  return { workspaceId, superAgentId, instructionProfileId, studioSessionId, vaultId };
}

export async function reconcileAgentOSProvisioning(agentId: string): Promise<AgentOSProvisioningResult | null> {
  const supabase = getSupabaseAdmin();
  const { data: agent, error } = await supabase
    .from('agents')
    .select('id,name,tier,metadata')
    .eq('id', agentId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load account for provisioning reconciliation: ${error.message}`);
  if (!agent) return null;

  const metadata = (agent.metadata as Record<string, unknown> | null | undefined) ?? {};
  const accountType: AccountType = metadata.account_type === 'enterprise' ? 'enterprise' : 'retail';
  const plan = normalizePlan(metadata.plan ?? agent.tier);
  const email = typeof metadata.email === 'string' && metadata.email.trim()
    ? metadata.email
    : `${agentId}@local.agentos`;

  return provisionAgentOSAccount({
    agentId: String(agent.id),
    agentName: typeof agent.name === 'string' && agent.name.trim() ? agent.name : 'My Agent',
    email,
    accountType,
    plan,
  });
}
