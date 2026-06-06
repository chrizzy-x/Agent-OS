import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { buildStudioBootstrap } from '@/src/studio/bootstrap';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    const { searchParams } = new URL(request.url);
    const payload = await buildStudioBootstrap({
      ownerAgentId: ctx.agentId,
      sessionId: searchParams.get('session'),
      projectId: searchParams.get('project'),
      mode: searchParams.get('mode') === 'code' ? 'code' : 'nl',
    });
    return NextResponse.json(payload);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
