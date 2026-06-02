import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { listAgentApps } from '@/src/appstore/service';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { listPrivateSubagents } from '@/src/subagents/service';
import { toErrorResponse } from '@/src/utils/errors';
import { listWorkspaces } from '@/src/workspaces/service';

export const runtime = 'nodejs';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function dayLabel(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
}

export async function GET(request: NextRequest) {
  try {
    const ctx = requireAgentContext(request.headers);
    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const type = url.searchParams.get('type')?.trim().toLowerCase() ?? 'all';

    const [workspaces, apps, subagents, workflowsResult, skillsResult] = await Promise.all([
      listWorkspaces(ctx.agentId),
      listAgentApps({
        viewerAgentId: ctx.agentId,
        includeHidden: true,
        sort: 'recent',
      }),
      listPrivateSubagents(ctx.agentId),
      getSupabaseAdmin()
        .from('agent_workflows')
        .select('*')
        .eq('agent_id', ctx.agentId)
        .order('updated_at', { ascending: false }),
      getSupabaseAdmin()
        .from('skills')
        .select('id,name,slug,category,description,published,total_installs,total_calls,updated_at,created_at')
        .eq('author_id', ctx.agentId)
        .order('updated_at', { ascending: false }),
    ]);

    const workflows = ((workflowsResult.data ?? []) as Array<Record<string, unknown>>).map(row => ({
      id: String(row.id),
      kind: 'workflow',
      name: String(row.name ?? 'Untitled workflow'),
      description: typeof row.summary === 'string' ? row.summary : 'Workflow',
      workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : null,
      status: typeof row.status === 'string' ? row.status : 'active',
      visibility: typeof row.visibility === 'string' ? row.visibility : 'private',
      updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
      runs: typeof row.last_run_at === 'string' ? 1 : 0,
      users: 1,
      href: `/workflows/${String(row.id)}`,
    }));

    const skills = ((skillsResult.data ?? []) as Array<Record<string, unknown>>).map(row => ({
      id: String(row.id),
      kind: 'skill',
      name: String(row.name ?? 'Skill'),
      description: typeof row.description === 'string' ? row.description : 'Skill',
      workspaceId: null,
      status: row.published === true ? 'published' : 'draft',
      visibility: row.published === true ? 'public' : 'private',
      updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
      runs: Number(row.total_calls ?? 0),
      users: Number(row.total_installs ?? 0),
      href: `/skills/${String(row.slug ?? row.id)}`,
    }));

    const projects = [
      ...workspaces.map(workspace => ({
        id: workspace.id,
        kind: 'project',
        name: workspace.name,
        description: `${workspace.plan} workspace`,
        workspaceId: workspace.id,
        status: workspace.plan,
        visibility: 'workspace',
        updatedAt: workspace.createdAt,
        runs: workflows.filter(item => item.workspaceId === workspace.id).reduce((sum, item) => sum + item.runs, 0),
        users: 1,
        href: `/projects`,
      })),
      ...apps.map(app => ({
        id: app.id,
        kind: 'app',
        name: app.name,
        description: app.description,
        workspaceId: app.workspaceId,
        status: app.source === 'external_sdk' ? 'sdk' : 'internal',
        visibility: app.visibility,
        updatedAt: app.updatedAt,
        runs: app.openCount,
        users: app.installCount,
        href: `/appstore/${app.slug}`,
      })),
      ...workflows,
      ...subagents.map(subagent => ({
        id: subagent.id,
        kind: 'agent',
        name: subagent.name,
        description: subagent.description ?? 'Private subagent',
        workspaceId: subagent.workspaceId,
        status: subagent.status,
        visibility: 'private',
        updatedAt: subagent.updatedAt,
        runs: 0,
        users: 1,
        href: `/subagents/${subagent.id}`,
      })),
      ...skills,
    ]
      .filter(item => type === 'all' || item.kind === type)
      .filter(item => {
        if (!search) return true;
        return `${item.name} ${item.description} ${item.status} ${item.visibility}`.toLowerCase().includes(search);
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    const runsByDay = new Map<string, number>();
    for (const item of workflows) {
      const day = dayLabel(item.updatedAt);
      runsByDay.set(day, (runsByDay.get(day) ?? 0) + item.runs);
    }

    return NextResponse.json({
      summary: {
        totalProjects: workspaces.length,
        activeProjects: workspaces.length,
        totalRuns: workflows.reduce((sum, item) => sum + item.runs, 0),
        totalInstalls: apps.reduce((sum, item) => sum + item.installCount, 0),
        totalUsers: skills.reduce((sum, item) => sum + item.users, 0),
      },
      projects,
      favorites: [],
      chart: [...runsByDay.entries()].map(([label, value]) => ({ label, value })),
    });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
