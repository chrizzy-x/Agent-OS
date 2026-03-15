import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';
import { getFFPClient } from '@/src/ffp/client';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    requireAdminAccess(req.headers);

    const { agentId } = await params;

    const proposals = await getFFPClient().queryConsensusHistory(decodeURIComponent(agentId));
    return NextResponse.json({ agentId, proposals, total: proposals.length });
  } catch (err) {
    const errResp = toErrorResponse(err);
    return NextResponse.json({ error: errResp }, { status: errResp.statusCode });
  }
}
