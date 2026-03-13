import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/src/auth/agent-identity';
import { toErrorResponse } from '@/src/utils/errors';
import { getFFPClient } from '@/src/ffp/client';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const adminToken = process.env.ADMIN_TOKEN!;
  const token = extractBearerToken(req.headers.get('authorization') ?? undefined);
  if (token !== adminToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid admin token' } },
      { status: 401 }
    );
  }

  const { agentId } = await params;
  const { searchParams } = new URL(req.url);
  const chainId = searchParams.get('chain_id') ?? undefined;
  const startTime = searchParams.get('start_time') ? Number(searchParams.get('start_time')) : undefined;
  const endTime = searchParams.get('end_time') ? Number(searchParams.get('end_time')) : undefined;

  try {
    const operations = await getFFPClient().queryOperations({
      agentId: decodeURIComponent(agentId),
      chainId,
      startTime,
      endTime,
    });
    return NextResponse.json({ agentId, operations, total: operations.length });
  } catch (err) {
    const errResp = toErrorResponse(err);
    return NextResponse.json({ error: errResp }, { status: errResp.statusCode });
  }
}
