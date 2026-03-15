import { NextRequest, NextResponse } from 'next/server';
import { createAgentToken } from '@/src/auth/agent-identity';
import { requireAdminAccess } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    requireAdminAccess(req.headers);

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
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
