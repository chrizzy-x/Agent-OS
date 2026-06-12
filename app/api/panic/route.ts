import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { panicStopActiveExecutions } from '@/src/execution/service';
import { createNotification } from '@/src/notifications/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : null;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
    const result = await panicStopActiveExecutions({
      agentId: ctx.agentId,
      workspaceId,
      sessionId,
    });
    await createNotification({
      agentId: ctx.agentId,
      workspaceId,
      sessionId,
      type: 'panic',
      title: 'Panic stop completed',
      body: `${result.stopped} active execution${result.stopped === 1 ? '' : 's'} stopped and temporary runtime access should be reviewed.`,
      metadata: { stopped: result.stopped },
    }).catch(() => undefined);
    return NextResponse.json(result);
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
