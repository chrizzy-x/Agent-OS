import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { blockXDraftForAgent } from '@/src/integrations/x/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const reason = typeof body.reason === 'string' && body.reason.trim().length > 0
      ? body.reason.trim()
      : 'Blocked by operator';
    const result = await blockXDraftForAgent(agentContext.agentId, id, reason);
    return NextResponse.json({ success: true, result }, { status: 200 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}