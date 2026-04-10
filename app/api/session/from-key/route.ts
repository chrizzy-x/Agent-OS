import { NextRequest, NextResponse } from 'next/server';
import { verifyAgentTokenClaims } from '@/src/auth/agent-identity';
import { getRedisClient } from '@/src/storage/redis';
import { toErrorResponse } from '@/src/utils/errors';
import { APP_URL } from '@/lib/config';

export const runtime = 'nodejs';

// POST /api/session/from-key
// Body: { apiKey: string }
// Returns: { loginUrl: string } — one-time login link valid for 5 minutes
export async function POST(req: NextRequest) {
  try {
    let body: { apiKey?: string };
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { apiKey } = body;
    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json({ error: 'apiKey is required' }, { status: 400 });
    }

    // Validate the API key — it's a JWT, so this verifies signature + expiry
    let claims: ReturnType<typeof verifyAgentTokenClaims>;
    try {
      claims = verifyAgentTokenClaims(apiKey);
    } catch {
      return NextResponse.json({ error: 'Invalid or expired API key' }, { status: 401 });
    }

    const agentId = claims.sub;

    // Store a one-time session token in Redis (5 min TTL)
    const st = crypto.randomUUID().replace(/-/g, '');
    const redis = getRedisClient();
    // Store the raw API key so the callback can set it as the session cookie
    await redis.setex(`session:fromkey:${st}`, 300, JSON.stringify({ agentId, apiKey }));

    const loginUrl = `${APP_URL}/api/session/from-key/callback?st=${st}`;

    return NextResponse.json({ loginUrl, expiresIn: 300 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
