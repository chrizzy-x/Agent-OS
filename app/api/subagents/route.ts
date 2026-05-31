import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { createPrivateSubagent, listPrivateSubagents } from '@/src/subagents/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'subagents.manage');
    const subagents = await listPrivateSubagents(ctx.agentId);
    return NextResponse.json({ subagents });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'subagents.manage');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : '';
    if (!workspaceId) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'workspaceId is required', message: 'workspaceId is required' }, { status: 400 });
    }
    const subagent = await createPrivateSubagent({
      ownerAgentId: ctx.agentId,
      workspaceId,
      name: typeof body.name === 'string' ? body.name : '',
      description: typeof body.description === 'string' ? body.description : null,
      instructions: typeof body.instructions === 'string' ? body.instructions : undefined,
    });
    return NextResponse.json({ subagent }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
