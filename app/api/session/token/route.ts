import { NextRequest, NextResponse } from 'next/server';
import { createAgentToken } from '@/src/auth/agent-identity';
import { requireRouteCapability } from '@/src/auth/request';
import { getCookieRequestContext, setAgentSessionCookie } from '@/src/auth/session-cookie';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const context = await requireRouteCapability(request.headers, 'session.token.issue');
    const bearerToken = createAgentToken(context.agentId, { expiresIn: '90d' });
    const response = NextResponse.json({
      success: true,
      credentials: {
        bearerToken,
        apiKey: bearerToken,
        expiresIn: '90 days',
      },
    });
    setAgentSessionCookie(response, bearerToken, getCookieRequestContext(request));
    return response;
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
