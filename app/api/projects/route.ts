import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { executeAgentOSAction } from '@/src/actions/service';
import { listProjects } from '@/src/projects/service';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

type ProjectSummaryItem = {
  id: string;
  kind: 'project';
  name: string;
  description: string;
  status: string;
  visibility: string;
  updatedAt: string;
  runs: number;
  users: number;
  href: string;
  workspaceId: string;
};

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.trim() ?? '';
    const workspaceId = url.searchParams.get('workspace');
    const projects = await listProjects({
      ownerAgentId: ctx.agentId,
      workspaceId,
      search,
      status: 'all',
    });

    const ids = projects.map(project => project.id);
    const [sessionsResult, workflowsResult] = await Promise.all([
      ids.length
        ? getSupabaseAdmin()
          .from('nl_studio_sessions')
          .select('id,project_id,updated_at')
          .eq('owner_agent_id', ctx.agentId)
          .in('project_id', ids)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? getSupabaseAdmin()
          .from('agent_workflows')
          .select('id,project_id,last_run_at,updated_at')
          .eq('agent_id', ctx.agentId)
          .in('project_id', ids)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const sessionCounts = new Map<string, number>();
    for (const row of ((sessionsResult.data ?? []) as Array<Record<string, unknown>>)) {
      const projectId = typeof row.project_id === 'string' ? row.project_id : '';
      if (!projectId) continue;
      sessionCounts.set(projectId, (sessionCounts.get(projectId) ?? 0) + 1);
    }

    const workflowCounts = new Map<string, number>();
    for (const row of ((workflowsResult.data ?? []) as Array<Record<string, unknown>>)) {
      const projectId = typeof row.project_id === 'string' ? row.project_id : '';
      if (!projectId) continue;
      workflowCounts.set(projectId, (workflowCounts.get(projectId) ?? 0) + 1);
    }

    const projectItems: ProjectSummaryItem[] = projects.map(project => ({
      id: project.id,
      kind: 'project',
      name: project.name,
      description: project.description ?? 'Workspace project',
      status: project.status,
      visibility: 'workspace',
      updatedAt: project.updatedAt,
      runs: workflowCounts.get(project.id) ?? 0,
      users: sessionCounts.get(project.id) ?? 0,
      href: `/projects/${encodeURIComponent(project.id)}`,
      workspaceId: project.workspaceId,
    }));

    const chart = projectItems
      .slice(0, 7)
      .reverse()
      .map(item => ({ label: item.name, value: item.runs }));

    return NextResponse.json({
      summary: {
        totalProjects: projectItems.length,
        activeProjects: projectItems.filter(item => item.status === 'active').length,
        totalRuns: projectItems.reduce((sum, item) => sum + item.runs, 0),
        totalInstalls: 0,
        totalUsers: projectItems.reduce((sum, item) => sum + item.users, 0),
      },
      projects: projectItems,
      favorites: projectItems.filter(item => item.status === 'active').slice(0, 3),
      chart,
    });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : '';
    const name = typeof body.name === 'string' ? body.name : '';

    if (!workspaceId || !name.trim()) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'workspaceId and name are required', message: 'workspaceId and name are required' }, { status: 400 });
    }

    const result = await executeAgentOSAction(ctx, {
      action: 'create_project',
      source: 'manual_ui',
      workspaceId,
      payload: {
        name,
        workspaceId,
        description: typeof body.description === 'string' ? body.description : null,
        metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
          ? body.metadata as Record<string, unknown>
          : undefined,
      },
    });
    const project = (result.result as { project: unknown }).project;

    return NextResponse.json({ project, execution: result.execution }, { status: 201 });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
