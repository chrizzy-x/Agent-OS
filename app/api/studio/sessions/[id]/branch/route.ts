import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { createStudioSessionBranch } from '@/src/studio/persistence';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.create');
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const session = await createStudioSessionBranch({
      ownerAgentId: ctx.agentId,
      sessionId: id,
      snapshotId: typeof body.snapshotId === 'string' ? body.snapshotId : null,
      title: typeof body.title === 'string' ? body.title : undefined,
      branchLabel: typeof body.branchLabel === 'string' ? body.branchLabel : undefined,
      projectId: typeof body.projectId === 'string' ? body.projectId : null,
    });
    return NextResponse.json({ session }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
