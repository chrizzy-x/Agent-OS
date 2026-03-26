import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { listXQueueItemsForAgent } from '@/src/integrations/x/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const accountConnectionId = request.nextUrl.searchParams.get('accountConnectionId') ?? undefined;
    const limitRaw = request.nextUrl.searchParams.get('limit');
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    const queue = await listXQueueItemsForAgent(agentContext.agentId, { accountConnectionId, limit });
    return NextResponse.json({ queue }, { status: 200 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}