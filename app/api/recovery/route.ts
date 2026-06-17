import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { listExecutions, normalizeExecutionStatus, requestExecutionAction } from '@/src/execution/service';
import { toErrorResponse, ValidationError } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    const url = new URL(request.url);
    const executions = await listExecutions({
      agentId: ctx.agentId,
      workspaceId: url.searchParams.get('workspaceId'),
      sessionId: url.searchParams.get('sessionId'),
      status: 'all',
      limit: Number(url.searchParams.get('limit') ?? 80),
    });
    const recoverable = executions.filter(item => {
      const status = normalizeExecutionStatus(item.status);
      return status === 'FAILED' || status === 'PAUSED' || status === 'CANCELLED';
    });
    return NextResponse.json({ executions: recoverable });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const executionId = typeof body.executionId === 'string' ? body.executionId : '';
    const action = typeof body.action === 'string' ? body.action : '';
    if (!executionId) throw new ValidationError('executionId is required');
    if (action !== 'resume' && action !== 'retry' && action !== 'cancel' && action !== 'rollback' && action !== 'inspect') {
      throw new ValidationError('Unsupported recovery action');
    }
    const execution = await requestExecutionAction({
      agentId: ctx.agentId,
      executionId,
      action,
    });
    return NextResponse.json({ execution });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
