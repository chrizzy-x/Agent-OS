import crypto from 'crypto';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { getPlanDescriptor } from './capabilities.js';
import { isValidPlan, normalizePlan, PLAN_ACCOUNT_TYPE, type AgentPlan } from './tiers.js';
import { PermissionError, ValidationError } from '../utils/errors.js';

export type PlanTransitionResult = {
  agentId: string;
  workspaceId: string | null;
  oldPlan: AgentPlan;
  newPlan: AgentPlan;
  oldCapabilities: string[];
  newCapabilities: string[];
  changedAt: string;
};

export async function transitionPlan(params: {
  agentId: string;
  newPlan: string;
  reason?: string;
  changedBy?: string;
}): Promise<PlanTransitionResult> {
  if (!isValidPlan(params.newPlan)) {
    throw new ValidationError('Invalid target plan');
  }

  const supabase = getSupabaseAdmin();
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id,tier,metadata')
    .eq('id', params.agentId)
    .maybeSingle();

  if (agentError) throw new Error(`Failed to load account: ${agentError.message}`);
  if (!agent) throw new PermissionError('Account not found');

  const metadata = (agent.metadata as Record<string, unknown> | null | undefined) ?? {};
  const oldPlan = normalizePlan(metadata.plan ?? agent.tier);
  const newPlan = params.newPlan as AgentPlan;
  const now = new Date().toISOString();

  const nextMetadata = {
    ...metadata,
    plan: newPlan,
    account_type: PLAN_ACCOUNT_TYPE[newPlan],
    plan_selection_skipped: false,
    plan_changed_at: now,
  };

  const { error: updateError } = await supabase
    .from('agents')
    .update({
      tier: newPlan,
      metadata: nextMetadata,
    })
    .eq('id', params.agentId);

  if (updateError) throw new Error(`Failed to update account plan: ${updateError.message}`);

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id,owner_id,plan')
    .eq('owner_id', params.agentId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (workspace) {
    await supabase
      .from('workspaces')
      .update({
        plan: newPlan,
        updated_at: now,
      })
      .eq('id', workspace.id)
      .eq('owner_id', params.agentId);
  }

  await supabase.from('plan_transitions').insert({
    id: crypto.randomUUID(),
    agent_id: params.agentId,
    workspace_id: workspace?.id ?? null,
    old_plan: oldPlan,
    new_plan: newPlan,
    reason: params.reason ?? null,
    changed_by: params.changedBy ?? params.agentId,
    created_at: now,
  });

  if (workspace?.id) {
    await supabase.from('workspace_audit_logs').insert({
      id: crypto.randomUUID(),
      workspace_id: workspace.id,
      actor_id: params.changedBy ?? params.agentId,
      action: 'plan_changed',
      metadata: {
        oldPlan,
        newPlan,
        reason: params.reason ?? null,
      },
      created_at: now,
    });
  }

  return {
    agentId: params.agentId,
    workspaceId: workspace?.id ?? null,
    oldPlan,
    newPlan,
    oldCapabilities: getPlanDescriptor(oldPlan).capabilities,
    newCapabilities: getPlanDescriptor(newPlan).capabilities,
    changedAt: now,
  };
}
