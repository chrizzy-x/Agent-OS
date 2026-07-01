import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { getStudioSessionBundle, updateStudioSession } from '@/src/studio/persistence';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const { id } = await params;
    const bundle = await getStudioSessionBundle(ctx.agentId, id);
    return NextResponse.json(bundle);
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
    const session = await updateStudioSession({
      ownerAgentId: ctx.agentId,
      sessionId: id,
      title: typeof body.title === 'string' ? body.title : undefined,
      status: typeof body.status === 'string' ? body.status : undefined,
      visibility: body.visibility === 'private' || body.visibility === 'workspace' || body.visibility === 'public' ? body.visibility : undefined,
      linkedFilePaths: body.attachedFiles !== undefined ? stringArray(body.attachedFiles) : undefined,
      linkedMemoryRefs: body.memoryReferences !== undefined ? stringArray(body.memoryReferences) : undefined,
      statePatch: {
        ...(typeof body.instructions === 'string' ? { instructions: body.instructions } : {}),
        ...(Array.isArray(body.taskReferences) ? { taskReferences: body.taskReferences } : {}),
        ...(Array.isArray(body.executionHistory) ? { executionHistory: body.executionHistory } : {}),
      },
    });
    return NextResponse.json({ session });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
