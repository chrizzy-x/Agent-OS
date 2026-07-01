import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { executeCapabilityAction } from '@/src/capabilities/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; actionId: string }> },
) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const { id, actionId } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const result = await executeCapabilityAction({
      ctx,
      capabilityId: decodeURIComponent(id),
      actionId: decodeURIComponent(actionId),
      input: asRecord(body.input ?? body.arguments ?? body.payload),
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : null,
      projectId: typeof body.projectId === 'string' ? body.projectId : null,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
      taskId: typeof body.taskId === 'string' ? body.taskId : null,
      approvedConfirmationId: typeof body.confirmationId === 'string' ? body.confirmationId : null,
    });
    const status = result.status === 'awaiting_confirmation' ? 202 : result.status === 'needs_configuration' ? 409 : result.status === 'failed' ? 500 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
