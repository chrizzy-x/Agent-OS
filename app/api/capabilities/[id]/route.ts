import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { getCapabilityNode } from '@/src/capabilities/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const capability = await getCapabilityNode({
      ownerAgentId: ctx.agentId,
      capabilityId: decodeURIComponent(id),
      workspaceId: searchParams.get('workspaceId'),
      projectId: searchParams.get('projectId'),
    });
    return NextResponse.json({ capability });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
