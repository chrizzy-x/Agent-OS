import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { getSuperAgentProfile, updateSuperAgentInstructions } from '@/src/agentos/super-agent';
import { listInstalledAgentApps } from '@/src/appstore/service';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { listStudioSessions } from '@/src/studio/persistence';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'super-agent.manage');
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId') ?? undefined;
    const profile = await getSuperAgentProfile({
      ownerAgentId: ctx.agentId,
      workspaceId,
    });
    const [sessions, installedApps, skillsResult, workflowsResult, eventsResult] = await Promise.all([
      listStudioSessions(ctx.agentId, { status: 'active' }),
      listInstalledAgentApps(ctx.agentId).catch(() => []),
      getSupabaseAdmin()
        .from('skill_installations')
        .select('id,installed_at,skill:skills(name,slug,category)')
        .eq('agent_id', ctx.agentId)
        .order('installed_at', { ascending: false }),
      getSupabaseAdmin()
        .from('agent_workflows')
        .select('id,name,summary,status,workspace_id,updated_at')
        .eq('agent_id', ctx.agentId)
        .order('updated_at', { ascending: false }),
      getSupabaseAdmin()
        .from('nl_studio_events')
        .select('id,type,payload,created_at,session_id,workspace_id')
        .eq('owner_agent_id', ctx.agentId)
        .order('created_at', { ascending: false })
        .limit(8),
    ]);

    const filteredSessions = sessions.filter(session => !workspaceId || session.workspaceId === workspaceId);
    const filteredApps = installedApps.filter(item => !workspaceId || item.app.workspaceId === workspaceId);
    const filteredWorkflows = ((workflowsResult.data ?? []) as Array<Record<string, unknown>>)
      .filter(row => !workspaceId || String(row.workspace_id ?? '') === workspaceId)
      .map(row => ({
        id: String(row.id),
        name: String(row.name ?? 'Workflow'),
        summary: typeof row.summary === 'string' ? row.summary : 'Workflow',
        status: String(row.status ?? 'active'),
        updatedAt: String(row.updated_at ?? ''),
      }));
    const recentActions = ((eventsResult.data ?? []) as Array<Record<string, unknown>>)
      .filter(row => !workspaceId || String(row.workspace_id ?? '') === workspaceId)
      .map(row => ({
        id: String(row.id),
        type: String(row.type ?? 'event'),
        summary: typeof row.payload === 'object' && row.payload && !Array.isArray(row.payload)
          ? Object.keys(row.payload as Record<string, unknown>).slice(0, 4).join(', ') || 'No details'
          : 'No details',
        createdAt: String(row.created_at ?? ''),
        sessionId: typeof row.session_id === 'string' ? row.session_id : null,
      }));

    return NextResponse.json({
      superAgent: profile,
      summary: {
        activeSessions: filteredSessions.length,
        installedSkills: (skillsResult.data ?? []).length,
        connectedApps: filteredApps.length,
        privateWorkflows: filteredWorkflows.length,
        recentActions,
      },
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'super-agent.manage');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const profile = await updateSuperAgentInstructions({
      ownerAgentId: ctx.agentId,
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : undefined,
      instructions: typeof body.instructions === 'string' ? body.instructions : '',
    });
    return NextResponse.json({ superAgent: profile });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
