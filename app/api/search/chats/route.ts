import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { searchAccessibleChatMessages } from '@/src/studio/search';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    const url = new URL(request.url);
    const query = url.searchParams.get('q') ?? '';
    const scope = (url.searchParams.get('scope') ?? 'all') as 'current' | 'workspace' | 'all';
    const currentSessionId = url.searchParams.get('sessionId');
    const matches = await searchAccessibleChatMessages({
      viewerAgentId: ctx.agentId,
      query,
      scope,
      currentSessionId,
    });
    return NextResponse.json({ query, scope, total: matches.length, matches });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
