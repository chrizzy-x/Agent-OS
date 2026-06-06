import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { deleteProject, getProject, summarizeProjectActivity, updateProject } from '@/src/projects/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = requireAgentContext(request.headers);
    const { id } = await params;
    const [project, activity] = await Promise.all([
      getProject({ ownerAgentId: ctx.agentId, projectId: id }),
      summarizeProjectActivity({ ownerAgentId: ctx.agentId, projectId: id }),
    ]);
    return NextResponse.json({ project, activity });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = requireAgentContext(request.headers);
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
    const ctx = requireAgentContext(request.headers);
    const { id } = await params;
    await deleteProject({ ownerAgentId: ctx.agentId, projectId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
