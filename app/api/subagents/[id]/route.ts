import { NextRequest, NextResponse } from 'next/server';
import { listPermissionGrants } from '@/src/access/service';
import { requireAgentContextWithTier, requireRouteCapability } from '@/src/auth/request';
import { listAccessibleMemoryEntries } from '@/src/memory/service';
import { getAgentActivity } from '@/src/activity/service';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { getPrivateSubagent, updatePrivateSubagent } from '@/src/subagents/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const { id } = await params;
    const subagent = await getPrivateSubagent(ctx.agentId, id);

    const [skillsResult, assignmentsResult, activity, memory, grants, fileStats, workflowsResult] = await Promise.all([
      getSupabaseAdmin()
        .from('skill_installations')
        .select(`
          id,
          installed_at,
          skill:skills(id,name,slug,category,description,icon,pricing_model,price_per_call,capabilities,primitives_required,total_calls,rating,verified)
        `)
        .eq('agent_id', ctx.agentId)
        .order('installed_at', { ascending: false }),
      getSupabaseAdmin()
        .from('vault_assignments')
        .select('id,secret_id,subject_type,subject_id,status,created_at,revoked_at,secret:vault_secrets(name,masked_value)')
        .eq('owner_agent_id', ctx.agentId)
        .eq('subject_type', 'subagent')
        .eq('subject_id', id)
        .order('created_at', { ascending: false }),
      getAgentActivity(ctx.agentId, 20),
      listAccessibleMemoryEntries({
        viewerAgentId: ctx.agentId,
        namespaceType: 'subagent',
        namespaceId: id,
        limit: 20,
      }),
      listPermissionGrants({
        actorAgentId: ctx.agentId,
        sourceType: 'subagent',
        sourceId: id,
        includeRevoked: true,
      }).catch(() => []),
      getSupabaseAdmin()
        .from('agent_files')
        .select('id', { count: 'exact', head: true })
        .eq('subagent_id', id),
      getSupabaseAdmin()
        .from('agent_workflows')
        .select('id,name,summary,status')
        .eq('agent_id', ctx.agentId)
        .eq('workspace_id', subagent.workspaceId)
        .order('updated_at', { ascending: false }),
    ]);

    return NextResponse.json({
      subagent,
      profile: {
        model: ctx.tier === 'enterprise_max' ? 'claude-sonnet' : 'gpt-4.1-mini',
        temperature: 0.2,
        behavior: 'focused',
        allowedApps: [],
        allowedTools: [
          'agentos.mem_get',
          'agentos.mem_set',
          'agentos.fs_read',
          'agentos.fs_write',
          'agentos.net_http_get',
          'agentos.db_query',
        ],
        permissions: {
          vault: true,
          workspace: true,
          app: true,
          network: true,
        },
      },
      installedSkills: skillsResult.data ?? [],
      vaultAssignments: assignmentsResult.data ?? [],
      memory,
      grants,
      fileCount: fileStats.count ?? 0,
      activity,
      workflows: workflowsResult.data ?? [],
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'subagents.manage');
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const subagent = await updatePrivateSubagent({
      ownerAgentId: ctx.agentId,
      subagentId: id,
      name: typeof body.name === 'string' ? body.name : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      instructions: typeof body.instructions === 'string' ? body.instructions : undefined,
      projectId: typeof body.projectId === 'string' ? body.projectId : undefined,
      visibility: body.visibility === 'workspace' || body.visibility === 'public' ? body.visibility : body.visibility === 'private' ? 'private' : undefined,
      exposedCapabilities: Array.isArray(body.exposedCapabilities)
        ? body.exposedCapabilities.filter((item): item is string => typeof item === 'string')
        : undefined,
      status: body.status === 'archived' || body.status === 'active' ? body.status : undefined,
    });
    return NextResponse.json({ subagent });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'subagents.manage');
    const { id } = await params;
    const subagent = await updatePrivateSubagent({ ownerAgentId: ctx.agentId, subagentId: id, status: 'archived' });
    return NextResponse.json({ subagent, archived: true });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
