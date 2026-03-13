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

  try {
    const proposals = await getFFPClient().queryConsensusHistory(decodeURIComponent(agentId));
    return NextResponse.json({ agentId, proposals, total: proposals.length });
  } catch (err) {
    const errResp = toErrorResponse(err);
    return NextResponse.json({ error: errResp }, { status: errResp.statusCode });
  }
}
