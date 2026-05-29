import { NextRequest, NextResponse } from 'next/server';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { requireAdminAccess } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';
import { getFFPClient } from '@/src/ffp/client';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ privateRef: string }> }
) {
  try {
    requireAdminAccess(req.headers);

    const { privateRef } = await params;

    const proposals = await getFFPClient().queryConsensusHistory(decodeURIComponent(privateRef));
    return NextResponse.json({ proposals: omitAgentIdentifierFields(proposals), total: proposals.length });
  } catch (err) {
    const errResp = toErrorResponse(err);
    return NextResponse.json({ error: errResp }, { status: errResp.statusCode });
  }
}
