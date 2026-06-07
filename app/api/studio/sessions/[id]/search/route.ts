import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { searchStudioSessionMessages } from '@/src/studio/search';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    const { id } = await params;
    const query = new URL(request.url).searchParams.get('q') ?? '';
    const matches = await searchStudioSessionMessages({
      viewerAgentId: ctx.agentId,
      sessionId: id,
      query,
    });
    return NextResponse.json({ query, total: matches.length, matches });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
