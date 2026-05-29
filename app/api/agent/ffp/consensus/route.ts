import { NextRequest, NextResponse } from 'next/server';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { requireAgentContext } from '@/src/auth/request';
import { getFFPClient } from '@/src/ffp/client';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// GET /api/agent/ffp/consensus — agent's own consensus history
export async function GET(req: NextRequest) {
  try {
    const ctx = requireAgentContext(req.headers);

    const proposals = await getFFPClient().queryConsensusHistory(ctx.agentId);

    return NextResponse.json({ proposals: omitAgentIdentifierFields(proposals), total: proposals.length });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
