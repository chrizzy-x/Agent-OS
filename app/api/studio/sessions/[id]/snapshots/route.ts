import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { createStudioSnapshot, listStudioSnapshots } from '@/src/studio/persistence';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.snapshots');
    const { id } = await params;
    const snapshots = await listStudioSnapshots({
      ownerAgentId: ctx.agentId,
      sessionId: id,
    });
    return NextResponse.json({ snapshots });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.snapshots');
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const snapshot = await createStudioSnapshot({
      ownerAgentId: ctx.agentId,
      sessionId: id,
      label: typeof body.label === 'string' ? body.label : undefined,
    });
    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
