import { NextRequest, NextResponse } from 'next/server';
import { listInstalledAgentApps } from '@/src/appstore/service';
import { getPlanDescriptor } from '@/src/auth/capabilities';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { normalizePlan } from '@/src/auth/tiers';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { listStudioSessions } from '@/src/studio/persistence';
import { listPrivateSubagents } from '@/src/subagents/service';
import { toErrorResponse } from '@/src/utils/errors';
import { listVaultSecrets } from '@/src/vault/service';
import { listWorkspaces, resolveDefaultWorkspaceForAgent } from '@/src/workspaces/service';

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
    const plan = getPlanDescriptor(normalizePlan(ctx.tier));
    const enterprise = plan.enterprise;
    const workspace = await resolveDefaultWorkspaceForAgent(ctx.agentId);

    const [workspaces, sessions, installedApps, subagents, workflowsResult, skillsResult, eventsResult, kernelsResult, ffpResult] = await Promise.all([
      listWorkspaces(ctx.agentId),
      listStudioSessions(ctx.agentId),
      listInstalledAgentApps(ctx.agentId).catch(() => []),
      listPrivateSubagents(ctx.agentId),
      getSupabaseAdmin()
        .from('agent_workflows')
        .select('id,name,summary,status,updated_at,created_at,last_run_at,last_error')
        .eq('agent_id', ctx.agentId)
        .order('updated_at', { ascending: false }),
      getSupabaseAdmin()
        .from('skill_installations')
        .select('id,installed_at,skill:skills(id,name,slug,category,description)')
        .eq('agent_id', ctx.agentId)
        .order('installed_at', { ascending: false }),
      getSupabaseAdmin()
        .from('nl_studio_events')
        .select('id,session_id,type,payload,created_at')
        .eq('owner_agent_id', ctx.agentId)
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
    ]);

    const workflows = ((workflowsResult.data ?? []) as Array<Record<string, unknown>>).map(row => ({
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
        sessions: sessions.length,
        projects: workspaces.length,
        installedApps: installedApps.length,
        installedSkills: installedSkills.length,
        workflows: workflows.length,
        subagents: subagents.length,
        vaultSecrets: vaultSecrets.length,
        sdkApps: sdkApps.length,
        ffpChains: chainMap.size,
        recentEvents: recentEvents.length,
      },
      recentSessions: sessions.slice(0, 6).map(session => ({
        id: session.id,
        title: session.title,
        status: session.status,
        updatedAt: session.updatedAt,
      })),
      activeProjects: workspaces.slice(0, 6).map(item => ({
        id: item.id,
        name: item.name,
        plan: item.plan,
        href: '/projects',
        createdAt: item.createdAt,
      })),
      installedApps: installedApps.slice(0, 8).map(item => ({
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
      subagents: subagents.slice(0, 8).map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
        status: item.status,
        updatedAt: item.updatedAt,
      })),
      vault: {
        total: vaultSecrets.length,
        active: vaultSecrets.filter(item => item.status === 'active').length,
        names: vaultSecrets.slice(0, 5).map(item => item.name),
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
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
