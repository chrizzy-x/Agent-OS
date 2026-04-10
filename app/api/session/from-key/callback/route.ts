import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/src/storage/redis';
import { setAgentSessionCookie } from '@/src/auth/session-cookie';
import { APP_URL } from '@/lib/config';

export const runtime = 'nodejs';

// GET /api/session/from-key/callback?st=<token>
// Exchanges the one-time token for a browser session cookie and redirects to /dashboard
export async function GET(req: NextRequest) {
  const st = req.nextUrl.searchParams.get('st');

  if (!st || !/^[a-f0-9]{32}$/.test(st)) {
    return NextResponse.redirect(`${APP_URL}/signin?error=invalid_link`);
  }

  try {
    const redis = getRedisClient();
    const key = `session:fromkey:${st}`;
    const raw = await redis.get(key);

    if (!raw) {
      // Token missing or already used
      return NextResponse.redirect(`${APP_URL}/signin?error=link_expired`);
    }

    // Single-use — delete immediately
    await redis.del(key);

    const { apiKey } = JSON.parse(raw) as { agentId: string; apiKey: string };

    // Set the session cookie (API key IS the session JWT in this system)
    const response = NextResponse.redirect(`${APP_URL}/dashboard`);
    setAgentSessionCookie(response, apiKey);

    return response;
  } catch {
    return NextResponse.redirect(`${APP_URL}/signin?error=server_error`);
  }
}
