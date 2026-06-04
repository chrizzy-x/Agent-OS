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

function parseTools(raw: unknown): Array<{ name: string; description: string | null }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(item => ({
      name: typeof item.name === 'string' ? item.name : 'tool',
      description: typeof item.description === 'string' ? item.description : null,
    }));
}

function healthFromCalls(calls: Array<{ success: boolean; timestamp: string | null }>): 'active' | 'degraded' | 'idle' {
  if (calls.length === 0) return 'idle';
  const recentCall = calls.find(call => call.timestamp)?.timestamp;
  if (!recentCall) return 'idle';
  if (calls[0]?.success === false) return 'degraded';
  return new Date(recentCall).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000 ? 'active' : 'idle';
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

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const workspaceIds = (await listWorkspaces(ctx.agentId)).map(workspace => workspace.id);
    const [serversResult, callsResult, appsResult, workflowsResult, skillsResult] = await Promise.all([
      getSupabaseAdmin()
        .from('mcp_servers')
        .select('id,name,description,category,tools,requires_consensus,consensus_threshold,active,icon,created_at')
        .eq('active', true)
        .order('name', { ascending: true }),
      getSupabaseAdmin()
        .from('mcp_calls')
        .select('mcp_server,tool_name,success,error_message,timestamp')
        .eq('agent_id', ctx.agentId)
        .order('timestamp', { ascending: false })
        .limit(250),
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

    const dataset: IntrospectionDataset = {
      apps: visibleApps((appsResult.data ?? []) as Array<Record<string, unknown>>, ctx.agentId, workspaceIds),
      workflows: (workflowsResult.data ?? []) as Array<Record<string, unknown>>,
      skills: visibleSkills((skillsResult.data ?? []) as Array<Record<string, unknown>>, ctx.agentId),
    };

    const callsByServer = new Map<string, Array<{ tool: string; success: boolean; errorMessage: string | null; timestamp: string | null }>>();
    for (const row of (callsResult.data ?? []) as Array<Record<string, unknown>>) {
      const server = String(row.mcp_server ?? '');
      if (!server) continue;
      const bucket = callsByServer.get(server) ?? [];
      bucket.push({
        tool: typeof row.tool_name === 'string' ? row.tool_name : 'tool',
        success: row.success === true,
        errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
        timestamp: typeof row.timestamp === 'string' ? row.timestamp : null,
      });
      callsByServer.set(server, bucket);
    }

    const connectors = ((serversResult.data ?? []) as Array<Record<string, unknown>>).map(row => {
      const tools = parseTools(row.tools);
      const calls = callsByServer.get(String(row.name ?? '')) ?? [];
      const lastCall = calls.find(call => call.timestamp)?.timestamp ?? null;
      const usedBy = findRelatedSubjectsForConnector(dataset, String(row.name ?? ''));
      const successCount = calls.filter(call => call.success).length;
      const requiresConsensus = row.requires_consensus === true;
      return {
        id: String(row.id ?? row.name),
        slug: String(row.name ?? ''),
        name: String(row.name ?? 'Connector'),
        description: typeof row.description === 'string' ? row.description : 'External MCP connector',
        category: typeof row.category === 'string' ? row.category : 'Connector',
        icon: typeof row.icon === 'string' ? row.icon : null,
        tools,
        toolCount: tools.length,
        requiresConsensus,
        consensusThreshold: typeof row.consensus_threshold === 'number' ? row.consensus_threshold : Number(row.consensus_threshold ?? 0),
        healthStatus: healthFromCalls(calls),
        lastCalledAt: lastCall,
        lastError: calls.find(call => call.errorMessage)?.errorMessage ?? null,
        callCount: calls.length,
        successCount,
        failureCount: calls.filter(call => !call.success).length,
        accessSummary: buildConnectorAccessSummary({
          usedBy,
          callCount: calls.length,
          successCount,
          requiresConsensus,
        }),
        permissionScope: buildConnectorPermissionScope(usedBy, requiresConsensus),
        lastAuditOutcome: lastAuditOutcome(calls),
        usedBy,
      };
    });

    return NextResponse.json({ connectors });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
