import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { requestExecutionAction } from '@/src/execution/service';
import { createNotification } from '@/src/notifications/service';
import { toErrorResponse, ValidationError } from '@/src/utils/errors';

export const runtime = 'nodejs';

const ACTIONS = new Set(['pause', 'resume', 'retry', 'cancel', 'rollback']);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';
    if (!ACTIONS.has(action)) throw new ValidationError('Unsupported execution action');

    const execution = await requestExecutionAction({
      agentId: ctx.agentId,
      executionId: id,
      action: action as 'pause' | 'resume' | 'retry' | 'cancel' | 'rollback',
    });

    await createNotification({
      agentId: ctx.agentId,
      workspaceId: execution.workspaceId,
      sessionId: execution.sessionId,
      executionId: execution.id,
      type: 'execution_status',
      title: `Execution ${action}`,
      body: `${execution.title} is now ${execution.status}.`,
    }).catch(() => undefined);

    return NextResponse.json({ execution });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
