import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { createStudioSession, listStudioSessions } from '@/src/studio/persistence';
import { resolveDefaultWorkspaceForAgent } from '@/src/workspaces/service';
import { resolveProjectForWorkspace } from '@/src/projects/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const { searchParams } = new URL(request.url);
    const sessions = await listStudioSessions(ctx.agentId, {
      status: searchParams.get('status') ?? 'active',
    });
    return NextResponse.json({ sessions });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const workspaceId = typeof body.workspaceId === 'string'
      ? body.workspaceId
      : (await resolveDefaultWorkspaceForAgent(ctx.agentId))?.id;
    const project = workspaceId
      ? await resolveProjectForWorkspace({
        ownerAgentId: ctx.agentId,
        workspaceId,
        projectId: typeof body.projectId === 'string' ? body.projectId : null,
      })
      : null;
    const session = await createStudioSession({
      ownerAgentId: ctx.agentId,
      workspaceId: workspaceId ?? '',
      projectId: project?.id ?? null,
      title: typeof body.title === 'string' ? body.title : 'Super AgentOS Session',
      visibility: body.visibility === 'workspace' || body.visibility === 'public' ? body.visibility : 'private',
      linkedFilePaths: Array.isArray(body.attachedFiles) ? body.attachedFiles.filter((item): item is string => typeof item === 'string') : [],
      linkedMemoryRefs: Array.isArray(body.memoryReferences) ? body.memoryReferences.filter((item): item is string => typeof item === 'string') : [],
      initialState: {
        mode: 'SUPER_AGENTOS',
        instructions: typeof body.instructions === 'string' ? body.instructions : '',
        taskReferences: Array.isArray(body.taskReferences) ? body.taskReferences : [],
        executionHistory: [],
      },
    });
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
