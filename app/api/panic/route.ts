import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { executePanicAction, getPanicStatus, type PanicAction } from '@/src/panic/service';
import { createNotification } from '@/src/notifications/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');
    const sessionId = url.searchParams.get('sessionId');
    const status = await getPanicStatus({
      agentId: ctx.agentId,
      workspaceId,
      sessionId,
    });
    return NextResponse.json(status);
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : null;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
    const action: PanicAction = body.action === 'pause' || body.action === 'lockdown' ? body.action : 'stop_all';
    const result = await executePanicAction({
      agentId: ctx.agentId,
      workspaceId,
      sessionId,
      action,
    });
    await createNotification({
      agentId: ctx.agentId,
      workspaceId,
      sessionId,
      type: 'panic',
      title: action === 'lockdown' ? 'Panic lockdown enabled' : action === 'pause' ? 'Panic pause completed' : 'Panic stop completed',
      body: action === 'lockdown'
        ? `${result.affected} active execution${result.affected === 1 ? '' : 's'} stopped. MCP and Vault runtime grants are disabled until re-authentication.`
        : `${result.affected} active execution${result.affected === 1 ? '' : 's'} ${action === 'pause' ? 'paused' : 'stopped'}.`,
      metadata: { action, affected: result.affected, vaultRuntimeGrantsRevoked: result.vaultRuntimeGrantsRevoked },
    }).catch(() => undefined);
    return NextResponse.json(result);
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
