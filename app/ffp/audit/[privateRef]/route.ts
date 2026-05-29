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
    const { searchParams } = new URL(req.url);
    const chainId = searchParams.get('chain_id') ?? undefined;
    const startTime = searchParams.get('start_time') ? Number(searchParams.get('start_time')) : undefined;
    const endTime = searchParams.get('end_time') ? Number(searchParams.get('end_time')) : undefined;

    const operations = await getFFPClient().queryOperations({
      agentId: decodeURIComponent(privateRef),
      chainId,
      startTime,
      endTime,
    });
    return NextResponse.json({ operations: omitAgentIdentifierFields(operations), total: operations.length });
  } catch (err) {
    const errResp = toErrorResponse(err);
    return NextResponse.json({ error: errResp }, { status: errResp.statusCode });
  }
}
