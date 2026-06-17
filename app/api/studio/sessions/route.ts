import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { resolveProjectForWorkspace } from '@/src/projects/service';
import { reconcileAgentOSProvisioning } from '@/src/agentos/provisioning';
import { createStudioSession, listStudioSessions } from '@/src/studio/persistence';
import { resolveDefaultWorkspaceForAgent } from '@/src/workspaces/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    await reconcileAgentOSProvisioning(ctx.agentId);
    const status = new URL(request.url).searchParams.get('status') ?? undefined;
    const sessions = await listStudioSessions(ctx.agentId, {
      status: status === 'all' ? 'all' : status ?? undefined,
    });
    return NextResponse.json({ sessions });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.create');
    await reconcileAgentOSProvisioning(ctx.agentId);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const workspaceId = typeof body.workspaceId === 'string' && body.workspaceId.trim()
      ? body.workspaceId
      : (await resolveDefaultWorkspaceForAgent(ctx.agentId))?.id ?? '';
    const requestedProjectId = typeof body.projectId === 'string' ? body.projectId : null;
    if (!workspaceId) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'workspace_required', message: 'workspaceId is required' }, { status: 400 });
    }
    const project = await resolveProjectForWorkspace({
      ownerAgentId: ctx.agentId,
      workspaceId,
      projectId: requestedProjectId,
    });

    const session = await createStudioSession({
      ownerAgentId: ctx.agentId,
      workspaceId,
      projectId: project.id,
      superAgentId: typeof body.superAgentId === 'string' ? body.superAgentId : null,
      visibility: body.visibility === 'workspace' || body.visibility === 'public' ? body.visibility : 'private',
      linkedSubagentId: typeof body.linkedSubagentId === 'string' ? body.linkedSubagentId : null,
      linkedWorkflowId: typeof body.linkedWorkflowId === 'string' ? body.linkedWorkflowId : null,
      linkedAppId: typeof body.linkedAppId === 'string' ? body.linkedAppId : null,
      linkedFilePaths: Array.isArray(body.linkedFilePaths)
        ? body.linkedFilePaths.filter((item): item is string => typeof item === 'string')
        : undefined,
      linkedMemoryRefs: Array.isArray(body.linkedMemoryRefs)
        ? body.linkedMemoryRefs.filter((item): item is string => typeof item === 'string')
        : undefined,
      title: typeof body.title === 'string' ? body.title : undefined,
    });
    return NextResponse.json({ session }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
