import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { getExternalAgentRegistration } from '@/src/external-agents/service';
import { getAgentActivity } from '@/src/activity/service';
import { toErrorResponse, NotFoundError, PermissionError } from '@/src/utils/errors';

export const runtime = 'nodejs';

async function ownsAgent(agentId: string, ownerAgentId: string): Promise<boolean> {
  const owner = ownerAgentId.toLowerCase();
  let current = await getExternalAgentRegistration(agentId);
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current.owner_email === owner) return true;
    if (!current.owner_email) return false;
    current = await getExternalAgentRegistration(current.owner_email);
  }
  return false;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = requireAgentContext(request.headers);
    const { id } = await params;

    const registration = await getExternalAgentRegistration(id);
    if (!registration) {
      throw new NotFoundError(`Agent '${id}' not found`);
    }
    if (!await ownsAgent(id, ctx.agentId)) {
      throw new PermissionError('Access denied');
    }

    const activity = await getAgentActivity(id, 50);
    return NextResponse.json({ agentId: id, activity });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
