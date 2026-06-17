import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { listLibrary } from '@/src/library/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const { searchParams } = new URL(request.url);
    const payload = await listLibrary({
      ownerAgentId: ctx.agentId,
      workspaceId: searchParams.get('workspaceId'),
      projectId: searchParams.get('projectId'),
      search: searchParams.get('search') ?? searchParams.get('q'),
      limit: Number(searchParams.get('limit') ?? 100),
    });
    return NextResponse.json(payload);
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
