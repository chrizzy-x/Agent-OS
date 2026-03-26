import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, verifyAgentToken } from '@/src/auth/agent-identity';
import { getExternalAgentProfile } from '@/src/external-agents/service';
import { NotFoundError, toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('authorization') ?? request.headers.get('Authorization') ?? undefined);
    if (!token) {
      return NextResponse.json({ error: 'Authorization: Bearer <token> header required' }, { status: 401 });
    }

    const agentContext = verifyAgentToken(token);
    const profile = await getExternalAgentProfile(agentContext.agentId);
    return NextResponse.json(profile);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
