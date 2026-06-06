import { NextRequest, NextResponse } from 'next/server';
import { rotateBrowserSession } from '@/src/auth/browser-auth';
import { extractRefreshTokenFromCookie } from '@/src/auth/session-cookie';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie') ?? request.headers.get('Cookie') ?? undefined;
    const refreshToken = extractRefreshTokenFromCookie(cookieHeader);
    if (!refreshToken) {
      return NextResponse.json({ authenticated: false, code: 'UNAUTHORIZED', error: 'refresh_required', message: 'Refresh session is required' });
    }

    const response = NextResponse.json({ authenticated: true });
    const rotated = await rotateBrowserSession(response, {
      rawRefreshToken: refreshToken,
      request,
    });

    return NextResponse.json({
      authenticated: true,
      accessTokenExpiresIn: '1 day',
      agentId: rotated.agentId,
    }, { headers: response.headers });
  } catch (error) {
    const err = toErrorResponse(error);
    if (err.statusCode === 401 || err.code === 'UNAUTHORIZED') {
      return NextResponse.json({ authenticated: false, code: err.code, error: 'refresh_required', message: err.message });
    }
    return NextResponse.json({ authenticated: false, code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
