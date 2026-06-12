import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { getStudioSessionBundle, updateStudioSession } from '@/src/studio/persistence';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    const { id } = await params;
    const bundle = await getStudioSessionBundle(ctx.agentId, id);
    return NextResponse.json(bundle);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const session = await updateStudioSession({
      ownerAgentId: ctx.agentId,
      sessionId: id,
      title: typeof body.title === 'string' ? body.title : undefined,
      status: typeof body.status === 'string' ? body.status : undefined,
      pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
      deleted: body.deleted === true ? true : undefined,
      visibility: body.visibility === 'workspace' || body.visibility === 'public' ? body.visibility : body.visibility === 'private' ? 'private' : undefined,
      linkedSubagentId: typeof body.linkedSubagentId === 'string' ? body.linkedSubagentId : body.linkedSubagentId === null ? null : undefined,
      linkedWorkflowId: typeof body.linkedWorkflowId === 'string' ? body.linkedWorkflowId : body.linkedWorkflowId === null ? null : undefined,
      linkedAppId: typeof body.linkedAppId === 'string' ? body.linkedAppId : body.linkedAppId === null ? null : undefined,
      linkedFilePaths: Array.isArray(body.linkedFilePaths)
        ? body.linkedFilePaths.filter((item): item is string => typeof item === 'string')
        : undefined,
      linkedMemoryRefs: Array.isArray(body.linkedMemoryRefs)
        ? body.linkedMemoryRefs.filter((item): item is string => typeof item === 'string')
        : undefined,
      statePatch: body.statePatch && typeof body.statePatch === 'object' && !Array.isArray(body.statePatch)
        ? body.statePatch as Record<string, unknown>
        : undefined,
    });
    return NextResponse.json({ session });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const { id } = await params;
    const mode = new URL(request.url).searchParams.get('mode');
    const deleteMode = mode === 'delete';
    const session = await updateStudioSession({
      ownerAgentId: ctx.agentId,
      sessionId: id,
      status: deleteMode ? undefined : 'archived',
      deleted: deleteMode ? true : undefined,
    });
    return NextResponse.json({ session, archived: !deleteMode, deleted: deleteMode });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
