import { NextRequest, NextResponse } from 'next/server';
import { findRelatedSubjectsForTool, type IntrospectionDataset } from '@/src/mcp/introspection';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';
import { listWorkspaces } from '@/src/workspaces/service';

export const runtime = 'nodejs';

function derivePrimitive(tool: string): string {
  return tool.replace(/^agentos\./, '').replace(/^mcp\./, '').split(/[._]/)[0] || 'runtime';
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function visibleApps(rows: Array<Record<string, unknown>>, agentId: string, workspaceIds: string[]): Array<Record<string, unknown>> {
  return rows.filter(row =>
    row.published === true
    || row.publisher_id === agentId
    || (typeof row.workspace_id === 'string' && workspaceIds.includes(row.workspace_id))
  );
}

function visibleSkills(rows: Array<Record<string, unknown>>, agentId: string): Array<Record<string, unknown>> {
  return rows.filter(row => row.published === true || row.author_id === agentId);
}

function buildRouteDecision(row: Record<string, unknown>, tool: string, primitive: string): Record<string, unknown> {
  const persisted = asObject(row.route_decision);
  if (Object.keys(persisted).length > 0) return persisted;
  return {
    source: tool.startsWith('mcp.') ? 'external_mcp' : tool.startsWith('skill.') || tool.startsWith('agentos.skill.') ? 'skill' : 'primitive',
    selectedTool: tool,
    selectedPrimitive: primitive,
    consensusThreshold: typeof row.consensus_threshold === 'number' ? row.consensus_threshold : Number(row.consensus_threshold ?? 0),
    validatorCount: typeof row.validator_count === 'number' ? row.validator_count : Number(row.validator_count ?? 0),
    status: typeof row.status === 'string' ? row.status : 'recorded',
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const { id } = await context.params;
    const workspaceIds = (await listWorkspaces(ctx.agentId)).map(workspace => workspace.id);
    const [result, appsResult, workflowsResult, skillsResult] = await Promise.all([
      getSupabaseAdmin()
        .from('ffp_chain_executions')
        .select('id,chain_id,proposal_id,tool,input,result,status,error_message,consensus_threshold,validator_count,input_hash,executed_at,fallback_used,fallback_reason,invoked_by_type,invoked_by_id,route_decision')
        .eq('id', id)
        .maybeSingle(),
      getSupabaseAdmin()
        .from('agent_apps')
        .select('id,name,slug,workspace_id,publisher_id,published,updated_at,manifest,default_config,permissions_required,runtime_type,kernel_product')
        .order('updated_at', { ascending: false }),
      getSupabaseAdmin()
        .from('agent_workflows')
        .select('id,name,summary,updated_at,steps,graph_state,code_state,canonical_doc')
        .eq('agent_id', ctx.agentId)
        .order('updated_at', { ascending: false }),
      getSupabaseAdmin()
        .from('skills')
        .select('id,name,slug,description,author_id,published,updated_at,source_code,capabilities,primitives_required')
        .order('updated_at', { ascending: false }),
    ]);

    if (result.error) throw result.error;
    if (!result.data) {
      return NextResponse.json({ error: 'FFP route not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const dataset: IntrospectionDataset = {
      apps: visibleApps((appsResult.data ?? []) as Array<Record<string, unknown>>, ctx.agentId, workspaceIds),
      workflows: (workflowsResult.data ?? []) as Array<Record<string, unknown>>,
      skills: visibleSkills((skillsResult.data ?? []) as Array<Record<string, unknown>>, ctx.agentId),
    };
    const row = result.data as Record<string, unknown>;
    const tool = String(row.tool ?? 'tool');
    const primitive = derivePrimitive(tool);
    return NextResponse.json({
      route: {
        id: String(row.id),
        chainId: String(row.chain_id ?? ''),
        proposalId: typeof row.proposal_id === 'string' ? row.proposal_id : null,
        tool,
        primitive,
        input: row.input && typeof row.input === 'object' ? row.input : {},
        result: row.result && typeof row.result === 'object' ? row.result : {},
        status: typeof row.status === 'string' ? row.status : 'recorded',
        errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
        consensusThreshold: typeof row.consensus_threshold === 'number' ? row.consensus_threshold : Number(row.consensus_threshold ?? 0),
        validatorCount: typeof row.validator_count === 'number' ? row.validator_count : Number(row.validator_count ?? 0),
        inputHash: typeof row.input_hash === 'string' ? row.input_hash : null,
        executedAt: typeof row.executed_at === 'string' ? row.executed_at : null,
        fallbackUsed: row.fallback_used === true,
        fallbackReason: typeof row.fallback_reason === 'string' ? row.fallback_reason : null,
        invokedByType: typeof row.invoked_by_type === 'string' ? row.invoked_by_type : 'ffp_chain',
        invokedById: typeof row.invoked_by_id === 'string' ? row.invoked_by_id : String(row.chain_id ?? ''),
        routeDecision: buildRouteDecision(row, tool, primitive),
        related: findRelatedSubjectsForTool(dataset, tool),
      },
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
