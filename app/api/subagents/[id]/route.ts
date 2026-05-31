import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { updatePrivateSubagent } from '@/src/subagents/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'subagents.manage');
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const subagent = await updatePrivateSubagent({
      ownerAgentId: ctx.agentId,
      subagentId: id,
      name: typeof body.name === 'string' ? body.name : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      instructions: typeof body.instructions === 'string' ? body.instructions : undefined,
      status: body.status === 'archived' || body.status === 'active' ? body.status : undefined,
    });
    return NextResponse.json({ subagent });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'subagents.manage');
    const { id } = await params;
    const subagent = await updatePrivateSubagent({ ownerAgentId: ctx.agentId, subagentId: id, status: 'archived' });
    return NextResponse.json({ subagent, archived: true });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
