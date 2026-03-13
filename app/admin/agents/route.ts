import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken, createAgentToken } from '@/src/auth/agent-identity';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return NextResponse.json(
      { error: { code: 'CONFIGURATION_ERROR', message: 'Admin token not configured' } },
      { status: 503 }
    );
  }

  const token = extractBearerToken(req.headers.get('authorization') ?? undefined);
  if (token !== adminToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid admin token' } },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (err) {
    return NextResponse.json({ error: toErrorResponse(err) }, { status: 400 });
  }

  const agentId = typeof body.agentId === 'string' ? body.agentId : `agent_${Date.now()}`;
  const allowedDomains = Array.isArray(body.allowedDomains) ? body.allowedDomains as string[] : [];

  const agentToken = createAgentToken(agentId, { allowedDomains, expiresIn: '90d' });

  return NextResponse.json({ agentId, token: agentToken, expiresIn: '90d' }, { status: 201 });
}
