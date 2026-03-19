import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, verifyAgentTokenClaims } from '@/src/auth/agent-identity';
import { requireAgentContext } from '@/src/auth/request';
import { clearAgentSessionCookie, extractSessionTokenFromCookie } from '@/src/auth/session-cookie';
import { getSupabaseAdmin } from '@/src/storage/supabase';

export const runtime = 'nodejs';

function readSessionToken(headers: Headers | globalThis.Headers): string | undefined {
  const authHeader = headers.get('authorization') ?? headers.get('Authorization') ?? undefined;
  const cookieHeader = headers.get('cookie') ?? headers.get('Cookie') ?? undefined;
  return extractBearerToken(authHeader) ?? extractSessionTokenFromCookie(cookieHeader);
}

export async function GET(request: NextRequest) {
  try {
    const context = requireAgentContext(request.headers);
    const token = readSessionToken(request.headers);
    const claims = token ? verifyAgentTokenClaims(token) : null;
    const supabase = getSupabaseAdmin();
    const { data: agent } = await supabase
      .from('agents')
      .select('id, name')
      .eq('id', context.agentId)
      .maybeSingle();

    return NextResponse.json({
      authenticated: true,
      session: {
        agentId: context.agentId,
        agentName: agent?.name ?? null,
        expiresAt: claims?.exp ? new Date(claims.exp * 1000).toISOString() : null,
      },
    });
  } catch (error) {
    const response = NextResponse.json({ authenticated: false, error: 'Not signed in' }, { status: 401 });
    clearAgentSessionCookie(response);
    return response;
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  clearAgentSessionCookie(response);
  return response;
}
