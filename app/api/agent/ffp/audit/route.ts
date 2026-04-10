import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { getFFPClient } from '@/src/ffp/client';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// GET /api/agent/ffp/audit — agent's own audit trail
export async function GET(req: NextRequest) {
  try {
    const ctx = requireAgentContext(req.headers);
    const { searchParams } = new URL(req.url);
    const chainId = searchParams.get('chain_id') ?? undefined;
    const startTime = searchParams.get('start_time') ? Number(searchParams.get('start_time')) : undefined;
    const endTime = searchParams.get('end_time') ? Number(searchParams.get('end_time')) : undefined;

    const operations = await getFFPClient().queryOperations({
      agentId: ctx.agentId,
      chainId,
      startTime,
      endTime,
    });

    return NextResponse.json({ agentId: ctx.agentId, operations, total: operations.length });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
