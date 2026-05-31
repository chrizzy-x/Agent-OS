import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { getSuperAgentProfile, updateSuperAgentInstructions } from '@/src/agentos/super-agent';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'super-agent.manage');
    const { searchParams } = new URL(request.url);
    const profile = await getSuperAgentProfile({
      ownerAgentId: ctx.agentId,
      workspaceId: searchParams.get('workspaceId') ?? undefined,
    });
    return NextResponse.json({ superAgent: profile });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'super-agent.manage');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const profile = await updateSuperAgentInstructions({
      ownerAgentId: ctx.agentId,
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : undefined,
      instructions: typeof body.instructions === 'string' ? body.instructions : '',
    });
    return NextResponse.json({ superAgent: profile });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
