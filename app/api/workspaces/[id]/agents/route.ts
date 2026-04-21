import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { addWorkspaceAgent, listWorkspaceAgents } from '@/src/workspaces/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireAgentContext(request.headers);
    const { id } = await params;
    const agents = await listWorkspaceAgents(id);
    return NextResponse.json({ agents });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const { id } = await params;
    const body = await request.json() as { agent_id?: string };

    if (typeof body.agent_id !== 'string' || !body.agent_id.trim()) {
      return NextResponse.json({ error: 'validation_error', message: 'agent_id is required' }, { status: 400 });
    }

    const workspaceAgent = await addWorkspaceAgent({
      workspaceId: id,
      agentId: body.agent_id.trim(),
      actorId: agentContext.agentId,
    });

    return NextResponse.json({ workspaceAgent }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
