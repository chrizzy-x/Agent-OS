import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { listInstalledAgentApps } from '@/src/appstore/service';
import { listAccessibleFiles } from '@/src/files/service';
import { listAccessibleMemoryEntries } from '@/src/memory/service';
import { deleteProject, getProject, summarizeProjectActivity, updateProject } from '@/src/projects/service';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { listAccessibleSubagents } from '@/src/subagents/service';
import { toErrorResponse } from '@/src/utils/errors';
import { listVaultSecrets } from '@/src/vault/service';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const { id } = await params;
    const project = await getProject({ ownerAgentId: ctx.agentId, projectId: id });
    const supabase = getSupabaseAdmin();
    const [activity, chatsResult, workflowsResult, apps, skillsResult, subagents, memory, files, vault, mcpResult] = await Promise.all([
      summarizeProjectActivity({ ownerAgentId: ctx.agentId, projectId: id }),
      supabase
        .from('nl_studio_sessions')
        .select('id,title,status,visibility,updated_at,created_at')
        .eq('owner_agent_id', ctx.agentId)
        .eq('project_id', id)
        .order('updated_at', { ascending: false }),
      supabase
        .from('agent_workflows')
        .select('id,name,summary,status,visibility,updated_at,created_at')
        .eq('agent_id', ctx.agentId)
        .eq('project_id', id)
        .order('updated_at', { ascending: false }),
      listInstalledAgentApps(ctx.agentId).catch(() => []),
      supabase
        .from('skill_installations')
        .select('id,installed_at,skill:skills(id,name,slug,category,description)')
        .eq('agent_id', ctx.agentId)
        .order('installed_at', { ascending: false }),
      listAccessibleSubagents({
        viewerAgentId: ctx.agentId,
        workspaceId: project.workspaceId,
        projectId: id,
      }).catch(() => []),
      listAccessibleMemoryEntries({
        viewerAgentId: ctx.agentId,
        workspaceId: project.workspaceId,
        search: id,
        visibility: 'all',
        limit: 50,
      }).catch(() => []),
      listAccessibleFiles({
        viewerAgentId: ctx.agentId,
        workspaceId: project.workspaceId,
        limit: 50,
      }).catch(() => []),
      listVaultSecrets({
        ownerAgentId: ctx.agentId,
        workspaceId: project.workspaceId,
      }).catch(() => ({ vaultId: '', workspaceId: project.workspaceId, secrets: [] })),
      supabase
        .from('mcp_servers')
        .select('id,name,description,category,active,requires_consensus,created_at')
        .eq('active', true)
        .order('name', { ascending: true }),
    ]);
    const tabs = {
      overview: activity,
      chats: chatsResult.data ?? [],
      files,
      apps: apps.filter(item => !item.installation.workspaceId || item.installation.workspaceId === project.workspaceId),
      skills: skillsResult.data ?? [],
      workflows: workflowsResult.data ?? [],
      subagents,
      memory,
      secrets: vault.secrets,
      mcp: mcpResult.data ?? [],
    };
    return NextResponse.json({
      project,
      activity,
      tabs,
      summary: Object.fromEntries(Object.entries(tabs).map(([key, value]) => [key, Array.isArray(value) ? value.length : 1])),
    });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const project = await updateProject({
      ownerAgentId: ctx.agentId,
      projectId: id,
      name: typeof body.name === 'string' ? body.name : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      status: body.status === 'archived' ? 'archived' : body.status === 'active' ? 'active' : undefined,
      metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? body.metadata as Record<string, unknown>
        : undefined,
    });
    return NextResponse.json({ project });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const { id } = await params;
    await deleteProject({ ownerAgentId: ctx.agentId, projectId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
