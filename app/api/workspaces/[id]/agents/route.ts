import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { addWorkspaceAgent, listWorkspaceAgents, resolveWorkspaceAgentByName } from '@/src/workspaces/service';
import { NotFoundError, ValidationError, toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

function toPublicWorkspaceAgent(agent: Awaited<ReturnType<typeof listWorkspaceAgents>>[number]) {
  return {
    agentName: agent.agentName,
    addedAt: agent.addedAt,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireAgentContext(request.headers);
    const { id } = await params;
    const agents = await listWorkspaceAgents(id);
    return NextResponse.json({ agents: agents.map(toPublicWorkspaceAgent) });
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
    const body = await request.json() as { agent_id?: string; agent_name?: string };
    const agentName = typeof body.agent_name === 'string' ? body.agent_name.trim() : '';

    if (typeof body.agent_id === 'string' && body.agent_id.trim()) {
      throw new ValidationError('agent_name is required; private agent IDs are not accepted');
    }

    if (!agentName) {
      throw new ValidationError('agent_name is required');
    }

    const resolved = agentName ? await resolveWorkspaceAgentByName(agentName) : null;
    if (!resolved) {
      throw new NotFoundError('No agent found with that name');
    }

    const workspaceAgent = await addWorkspaceAgent({
      workspaceId: id,
      agentId: resolved.agentId,
      actorId: agentContext.agentId,
    });

    return NextResponse.json({ workspaceAgent: toPublicWorkspaceAgent(workspaceAgent) }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
