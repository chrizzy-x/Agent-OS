import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { deleteProjectFile, readProjectFile, writeProjectFile } from '@/src/studio/files';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    const { id } = await params;
    const filePath = new URL(request.url).searchParams.get('path') ?? '';
    const file = await readProjectFile({
      ownerAgentId: ctx.agentId,
      projectId: id,
      path: filePath,
    });
    return NextResponse.json(file);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const file = await writeProjectFile({
      ownerAgentId: ctx.agentId,
      projectId: id,
      path: typeof body.path === 'string' ? body.path : '',
      content: typeof body.content === 'string' ? body.content : '',
      encoding: body.encoding === 'base64' ? 'base64' : 'utf8',
      contentType: typeof body.contentType === 'string' ? body.contentType : null,
    });
    return NextResponse.json(file);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const queryPath = new URL(request.url).searchParams.get('path');
    const file = await deleteProjectFile({
      ownerAgentId: ctx.agentId,
      projectId: id,
      path: typeof body.path === 'string' ? body.path : queryPath ?? '',
    });
    return NextResponse.json(file);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
