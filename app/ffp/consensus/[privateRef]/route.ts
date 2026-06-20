import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    requireAdminAccess(req.headers);
    return NextResponse.json({
      proposals: [],
      total: 0,
      mode: 'temp',
      consensusAvailable: false,
      message: 'FFP consensus history is Coming Soon in AgentOS v6.6.4.',
    }, { status: 501 });
  } catch (err) {
    const errResp = toErrorResponse(err);
    return NextResponse.json({ error: errResp.message }, { status: errResp.statusCode });
  }
}
