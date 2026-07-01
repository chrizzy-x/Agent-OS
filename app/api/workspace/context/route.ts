import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { buildWorkspaceContextPackage } from '@/src/workspace-context/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const { searchParams } = new URL(request.url);
    const context = await buildWorkspaceContextPackage({
      ctx,
      workspaceId: searchParams.get('workspaceId'),
      projectId: searchParams.get('projectId'),
    });
    return NextResponse.json(context);
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
