import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { createProjectDirectory } from '@/src/studio/files';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const directory = await createProjectDirectory({
      ownerAgentId: ctx.agentId,
      projectId: id,
      path: typeof body.path === 'string' ? body.path : '',
    });
    return NextResponse.json(directory, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
