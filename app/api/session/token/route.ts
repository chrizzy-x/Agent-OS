import { NextRequest, NextResponse } from 'next/server';
import { createAgentToken } from '@/src/auth/agent-identity';
import { requireAgentContext } from '@/src/auth/request';
import { setAgentSessionCookie } from '@/src/auth/session-cookie';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const context = requireAgentContext(request.headers);
    const bearerToken = createAgentToken(context.agentId, { expiresIn: '90d' });
    const response = NextResponse.json({
      success: true,
      credentials: {
        agentId: context.agentId,
        bearerToken,
        apiKey: bearerToken,
        expiresIn: '90 days',
      },
    });
    setAgentSessionCookie(response, bearerToken);
    return response;
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
