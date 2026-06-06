import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { listRefreshSessions, listSessionAuditLogs, revokeAllRefreshSessions, revokeRefreshSession } from '@/src/auth/browser-sessions';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = requireAgentContext(request.headers);
    const [sessions, audit] = await Promise.all([
      listRefreshSessions(ctx.agentId),
      listSessionAuditLogs(ctx.agentId),
    ]);
    return NextResponse.json({ sessions, audit });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = requireAgentContext(request.headers);
    const sessionId = new URL(request.url).searchParams.get('sessionId');
    if (sessionId) {
      await revokeRefreshSession({ agentId: ctx.agentId, sessionId });
      return NextResponse.json({ success: true, revoked: sessionId });
    }
    await revokeAllRefreshSessions(ctx.agentId);
    return NextResponse.json({ success: true, revoked: 'all' });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
