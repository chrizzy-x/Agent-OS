import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { createAgentTask, listAgentTasks, type AgentTaskStatus } from '@/src/tasks/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const { searchParams } = new URL(request.url);
    const tasks = await listAgentTasks({
      userId: ctx.agentId,
      workspaceId: searchParams.get('workspaceId'),
      sessionId: searchParams.get('sessionId'),
      status: (searchParams.get('status') ?? 'all') as AgentTaskStatus | 'all',
      limit: Number(searchParams.get('limit') ?? 100),
    });
    return NextResponse.json({ tasks });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const title = typeof body.title === 'string'
      ? body.title
      : typeof body.originalPrompt === 'string'
        ? body.originalPrompt.slice(0, 120)
        : 'Super AgentOS task';
    const task = await createAgentTask({
      userId: ctx.agentId,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : null,
      projectId: typeof body.projectId === 'string' ? body.projectId : null,
      title,
      originalPrompt: typeof body.originalPrompt === 'string' ? body.originalPrompt : title,
      status: body.status === 'planning' || body.status === 'awaiting_confirmation' || body.status === 'running' || body.status === 'paused' || body.status === 'completed' || body.status === 'failed' || body.status === 'cancelled' || body.status === 'needs_configuration'
        ? body.status
        : 'queued',
      plan: recordArray(body.plan),
      capabilityIds: stringArray(body.capabilityIds),
      requiredPermissions: stringArray(body.requiredPermissions),
      confirmationStatus: body.confirmationStatus === 'pending' || body.confirmationStatus === 'approved' || body.confirmationStatus === 'rejected'
        ? body.confirmationStatus
        : 'not_required',
      progress: typeof body.progress === 'number' ? body.progress : 0,
      metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {},
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
