import { NextRequest, NextResponse } from 'next/server';
import { listInstalledAgentApps } from '@/src/appstore/service';
import { getPlanDescriptor } from '@/src/auth/capabilities';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { normalizePlan } from '@/src/auth/tiers';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { listStudioSessions } from '@/src/studio/persistence';
import { toErrorResponse } from '@/src/utils/errors';
import { listVaultSecrets } from '@/src/vault/service';
import { listProjects } from '@/src/projects/service';
import { assertWorkspaceMembership, listWorkspaces, resolveDefaultWorkspaceForAgent } from '@/src/workspaces/service';

export const runtime = 'nodejs';

function summarizeEventPayload(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload);
  if (keys.length === 0) return 'No details';
  return keys.slice(0, 4).join(', ');
}

async function loadEnterpriseKernelRows(agentId: string) {
  const supabase = getSupabaseAdmin();
  const primary = await supabase
    .from('kernel_registry')
    .select('product,health_status,status_topic,last_heartbeat_at,last_error,registered_at')
    .eq('agent_id', agentId)
    .order('registered_at', { ascending: false });
  if (!primary.error) return primary;

  return supabase
    .from('kernel_registry')
    .select('product,status,status_topic,last_heartbeat_at,last_status_payload,registered_at')
    .eq('agent_id', agentId)
    .order('registered_at', { ascending: false });
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const url = new URL(request.url);
    const requestedWorkspaceId = url.searchParams.get('workspace');
    const plan = getPlanDescriptor(normalizePlan(ctx.tier));
    const enterprise = plan.enterprise;
    const defaultWorkspace = await resolveDefaultWorkspaceForAgent(ctx.agentId);
    const workspace = requestedWorkspaceId
      ? (await assertWorkspaceMembership(requestedWorkspaceId, ctx.agentId)).workspace
      : defaultWorkspace;

    const [workspaces, sessions, projects, installedApps, workflowsResult, skillsResult, eventsResult, kernelsResult, ffpResult, mcpServersResult, mcpCallsResult] = await Promise.all([
      listWorkspaces(ctx.agentId),
      listStudioSessions(ctx.agentId),
      listProjects({ ownerAgentId: ctx.agentId, workspaceId: workspace?.id, status: 'active' }),
      listInstalledAgentApps(ctx.agentId).catch(() => []),
      getSupabaseAdmin()
        .from('agent_workflows')
        .select('id,workspace_id,name,summary,status,updated_at,created_at,last_run_at,last_error')
        .eq('agent_id', ctx.agentId)
        .order('updated_at', { ascending: false }),
      getSupabaseAdmin()
        .from('skill_installations')
        .select('id,installed_at,skill:skills(id,name,slug,category,description)')
        .eq('agent_id', ctx.agentId)
        .order('installed_at', { ascending: false }),
      getSupabaseAdmin()
        .from('nl_studio_events')
        .select('id,session_id,workspace_id,type,payload,created_at')
        .eq('owner_agent_id', ctx.agentId)
        .eq('workspace_id', workspace?.id ?? '')
        .order('created_at', { ascending: false })
        .limit(12),
      enterprise
        ? loadEnterpriseKernelRows(ctx.agentId)
        : Promise.resolve({ data: [], error: null }),
      enterprise
        ? getSupabaseAdmin()
          .from('ffp_chain_executions')
          .select('chain_id,status,executed_at')
          .order('executed_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      getSupabaseAdmin()
        .from('mcp_servers')
        .select('name,category,active')
        .eq('active', true)
        .order('name', { ascending: true }),
      getSupabaseAdmin()
        .from('mcp_calls')
        .select('mcp_server,success,error_message,timestamp')
        .eq('agent_id', ctx.agentId)
        .order('timestamp', { ascending: false })
        .limit(24),
    ]);

    const workflows = ((workflowsResult.data ?? []) as Array<Record<string, unknown>>)
      .filter(row => !workspace?.id || String(row.workspace_id ?? '') === workspace.id)
      .map(row => ({
        id: String(row.id),
        name: String(row.name ?? 'Workflow'),
        summary: typeof row.summary === 'string' ? row.summary : 'Workflow',
        status: typeof row.last_error === 'string' && row.last_error ? 'failed' : String(row.status ?? 'active'),
        updatedAt: String(row.updated_at ?? row.created_at ?? ''),
        lastRunAt: typeof row.last_run_at === 'string' ? row.last_run_at : null,
      }));

    const installedSkills = ((skillsResult.data ?? []) as Array<Record<string, unknown>>).map(row => {
      const skill = row.skill as Record<string, unknown> | null;
      return {
        id: String(row.id),
        installedAt: String(row.installed_at ?? ''),
        name: String(skill?.name ?? 'Skill'),
        slug: String(skill?.slug ?? row.id),
        category: typeof skill?.category === 'string' ? skill.category : 'Skill',
        description: typeof skill?.description === 'string' ? skill.description : 'Installed skill',
      };
    });

    const recentEvents = ((eventsResult.data ?? []) as Array<Record<string, unknown>>).map(row => {
      const payload = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? row.payload as Record<string, unknown>
        : {};
      return {
        id: String(row.id),
        sessionId: String(row.session_id ?? ''),
        type: String(row.type ?? 'event'),
        summary: summarizeEventPayload(payload),
        createdAt: String(row.created_at ?? ''),
      };
    });

    const vaultWorkspaces = workspace ? [workspace] : workspaces;
    const vaultSecrets = [];
    for (const item of vaultWorkspaces) {
      try {
        const payload = await listVaultSecrets({ ownerAgentId: ctx.agentId, workspaceId: item.id });
        vaultSecrets.push(...payload.secrets.map(secret => ({
          id: secret.id,
          name: secret.name,
          status: secret.status,
          updatedAt: secret.updatedAt,
        })));
      } catch {
        // Ignore inaccessible vaults without leaking details.
      }
    }

    const sdkApps = ((kernelsResult.data ?? []) as Array<Record<string, unknown>>).map(row => {
      const statusPayload = row.last_status_payload && typeof row.last_status_payload === 'object' && !Array.isArray(row.last_status_payload)
        ? row.last_status_payload as Record<string, unknown>
        : {};
      return {
        product: String(row.product ?? ''),
        healthStatus: String(row.health_status ?? row.status ?? statusPayload.status ?? 'unknown'),
        statusTopic: typeof row.status_topic === 'string' ? row.status_topic : '',
        lastHeartbeatAt: typeof row.last_heartbeat_at === 'string' ? row.last_heartbeat_at : null,
        lastError: typeof row.last_error === 'string' ? row.last_error : typeof statusPayload.lastError === 'string' ? statusPayload.lastError : null,
      };
    });

    const chainMap = new Map<string, { executions: number; lastExecution: string | null }>();
    for (const row of (ffpResult.data ?? []) as Array<Record<string, unknown>>) {
      const chainId = String(row.chain_id ?? '');
      if (!chainId) continue;
      const current = chainMap.get(chainId) ?? {
        executions: 0,
        lastExecution: typeof row.executed_at === 'string' ? row.executed_at : null,
      };
      current.executions += 1;
      chainMap.set(chainId, current);
    }

    const mcpServers = ((mcpServersResult.data ?? []) as Array<Record<string, unknown>>).map(row => ({
      name: String(row.name ?? ''),
      category: typeof row.category === 'string' ? row.category : 'Connector',
    }));
    const recentMcpCalls = ((mcpCallsResult.data ?? []) as Array<Record<string, unknown>>).map(row => ({
      server: String(row.mcp_server ?? ''),
      success: row.success === true,
      timestamp: typeof row.timestamp === 'string' ? row.timestamp : null,
    }));
    const mcpActiveSet = new Set(
      recentMcpCalls
        .filter(call => call.success && call.timestamp && new Date(call.timestamp).getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000)
        .map(call => call.server),
    );

    const filteredSessions = sessions.filter(item => !workspace?.id || item.workspaceId === workspace.id);
    const filteredInstalledApps = installedApps.filter(item => !workspace?.id || item.app.workspaceId === workspace.id);

    return NextResponse.json({
      workspace: workspace ? {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        plan: workspace.plan,
      } : null,
      plan: {
        plan: plan.plan,
        label: plan.label,
        enterprise,
      },
      summary: {
        sessions: filteredSessions.length,
        projects: projects.length,
        installedApps: filteredInstalledApps.length,
        installedSkills: installedSkills.length,
        workflows: workflows.length,
        vaultSecrets: vaultSecrets.length,
        sdkApps: sdkApps.length,
        ffpChains: chainMap.size,
        mcpConnectors: mcpServers.length,
        recentEvents: recentEvents.length,
      },
      recentSessions: filteredSessions.slice(0, 6).map(session => ({
        id: session.id,
        title: session.title,
        status: session.status,
        updatedAt: session.updatedAt,
      })),
      activeProjects: projects.slice(0, 6).map(item => ({
        id: item.id,
        name: item.name,
        plan: workspace?.plan ?? 'workspace',
        href: `/studio?mode=code&project=${encodeURIComponent(item.id)}`,
        createdAt: item.createdAt,
      })),
      installedApps: filteredInstalledApps.slice(0, 8).map(item => ({
        id: item.app.id,
        name: item.app.name,
        slug: item.app.slug,
        description: item.app.description,
        healthStatus: item.app.healthStatus,
        openCount: item.installation.openCount,
        favorite: item.installation.favorite,
        href: `/appstore/${item.app.slug}`,
      })),
      installedSkills: installedSkills.slice(0, 8),
      workflows: workflows.slice(0, 8),
      vault: {
        total: vaultSecrets.length,
        active: vaultSecrets.filter(item => item.status === 'active').length,
        lastUsedAt: vaultSecrets
          .map(item => item.updatedAt)
          .sort((left, right) => right.localeCompare(left))[0] ?? null,
      },
      mcp: {
        connectorCount: mcpServers.length,
        activeConnectors: mcpActiveSet.size,
        lastCallAt: recentMcpCalls.find(call => call.timestamp)?.timestamp ?? null,
        connectors: mcpServers.slice(0, 6).map(server => ({
          name: server.name,
          category: server.category,
          status: mcpActiveSet.has(server.name) ? 'active' : 'idle',
        })),
      },
      sdkApps: enterprise ? sdkApps.slice(0, 8) : [],
      ffp: enterprise ? {
        chainCount: chainMap.size,
        chains: [...chainMap.entries()].slice(0, 6).map(([chainId, value]) => ({
          chainId,
          executions: value.executions,
          lastExecution: value.lastExecution,
        })),
      } : null,
      recentEvents,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
