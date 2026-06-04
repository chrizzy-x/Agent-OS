import { NextRequest, NextResponse } from 'next/server';
import {
  buildConnectorAccessSummary,
  buildConnectorPermissionScope,
  findRelatedSubjectsForConnector,
  type ConnectorLastAuditOutcome,
  type IntrospectionDataset,
} from '@/src/mcp/introspection';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';
import { listWorkspaces } from '@/src/workspaces/service';

export const runtime = 'nodejs';

function parseTools(raw: unknown): Array<{ name: string; description: string | null; inputSchema: Record<string, unknown> | null }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(item => ({
      name: typeof item.name === 'string' ? item.name : 'tool',
      description: typeof item.description === 'string' ? item.description : null,
      inputSchema: item.inputSchema && typeof item.inputSchema === 'object'
        ? item.inputSchema as Record<string, unknown>
        : item.input_schema && typeof item.input_schema === 'object'
          ? item.input_schema as Record<string, unknown>
          : null,
    }));
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

function lastAuditOutcome(calls: Array<{ tool: string; success: boolean; errorMessage: string | null; timestamp: string | null }>): ConnectorLastAuditOutcome {
  const latest = calls.find(call => call.timestamp) ?? calls[0];
  if (!latest) return null;
  return {
    success: latest.success,
    timestamp: latest.timestamp,
    errorMessage: latest.errorMessage,
    tool: latest.tool,
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const { slug } = await context.params;
    const workspaceIds = (await listWorkspaces(ctx.agentId)).map(workspace => workspace.id);
    const [serverResult, callsResult, appsResult, workflowsResult, skillsResult] = await Promise.all([
      getSupabaseAdmin()
        .from('mcp_servers')
        .select('id,name,description,category,tools,requires_consensus,consensus_threshold,active,icon,created_at')
        .eq('name', slug)
        .eq('active', true)
        .maybeSingle(),
      getSupabaseAdmin()
        .from('mcp_calls')
        .select('tool_name,params,result,success,error_message,execution_time_ms,timestamp')
        .eq('agent_id', ctx.agentId)
        .eq('mcp_server', slug)
        .order('timestamp', { ascending: false })
        .limit(20),
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

    if (serverResult.error) throw serverResult.error;
    if (!serverResult.data) {
      return NextResponse.json({ error: 'Connector not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const tools = parseTools((serverResult.data as Record<string, unknown>).tools);
    const calls = ((callsResult.data ?? []) as Array<Record<string, unknown>>).map(row => ({
      tool: typeof row.tool_name === 'string' ? row.tool_name : 'tool',
      params: row.params && typeof row.params === 'object' ? row.params : {},
      result: row.result && typeof row.result === 'object' ? row.result : {},
      success: row.success === true,
      errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
      executionTimeMs: typeof row.execution_time_ms === 'number' ? row.execution_time_ms : null,
      timestamp: typeof row.timestamp === 'string' ? row.timestamp : null,
    }));
    const dataset: IntrospectionDataset = {
      apps: visibleApps((appsResult.data ?? []) as Array<Record<string, unknown>>, ctx.agentId, workspaceIds),
      workflows: (workflowsResult.data ?? []) as Array<Record<string, unknown>>,
      skills: visibleSkills((skillsResult.data ?? []) as Array<Record<string, unknown>>, ctx.agentId),
    };
    const usedBy = findRelatedSubjectsForConnector(dataset, slug);
    const requiresConsensus = (serverResult.data as Record<string, unknown>).requires_consensus === true;
    const successCount = calls.filter(call => call.success).length;

    return NextResponse.json({
      connector: {
        id: String((serverResult.data as Record<string, unknown>).id ?? slug),
        slug,
        name: String((serverResult.data as Record<string, unknown>).name ?? slug),
        description: typeof (serverResult.data as Record<string, unknown>).description === 'string'
          ? String((serverResult.data as Record<string, unknown>).description)
          : 'External MCP connector',
        category: typeof (serverResult.data as Record<string, unknown>).category === 'string'
          ? String((serverResult.data as Record<string, unknown>).category)
          : 'Connector',
        icon: typeof (serverResult.data as Record<string, unknown>).icon === 'string'
          ? String((serverResult.data as Record<string, unknown>).icon)
          : null,
        requiresConsensus,
        consensusThreshold: typeof (serverResult.data as Record<string, unknown>).consensus_threshold === 'number'
          ? (serverResult.data as Record<string, unknown>).consensus_threshold
          : Number((serverResult.data as Record<string, unknown>).consensus_threshold ?? 0),
        createdAt: typeof (serverResult.data as Record<string, unknown>).created_at === 'string'
          ? String((serverResult.data as Record<string, unknown>).created_at)
          : null,
        tools,
        toolCount: tools.length,
        healthStatus: calls[0]?.success === false ? 'degraded' : calls.length > 0 ? 'active' : 'idle',
        lastCalledAt: calls[0]?.timestamp ?? null,
        lastError: calls.find(call => call.errorMessage)?.errorMessage ?? null,
        callCount: calls.length,
        successCount,
        failureCount: calls.filter(call => !call.success).length,
        recentCalls: calls,
        accessSummary: buildConnectorAccessSummary({
          usedBy,
          callCount: calls.length,
          successCount,
          requiresConsensus,
        }),
        permissionScope: buildConnectorPermissionScope(usedBy, requiresConsensus),
        lastAuditOutcome: lastAuditOutcome(calls),
        usedBy,
      },
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
