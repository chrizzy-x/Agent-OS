import { NextRequest, NextResponse } from 'next/server';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { requireAgentContext } from '@/src/auth/request';
import { resolveVisibleExternalAgentRef } from '@/src/external-agents/service';
import { getAgentActivity } from '@/src/activity/service';
import { toErrorResponse, NotFoundError } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = requireAgentContext(request.headers);
    const { id } = await params;

    const registration = await resolveVisibleExternalAgentRef(ctx.agentId, id);
    if (!registration) {
      throw new NotFoundError('Agent not found');
    }

    const activity = await getAgentActivity(registration.agent_id, 50);
    return NextResponse.json({ activity: omitAgentIdentifierFields(activity) });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
