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
      message: 'FFP consensus history is not live in V6.6.2.',
    }, { status: 501 });
  } catch (err) {
    const errResp = toErrorResponse(err);
    return NextResponse.json({ error: errResp.message }, { status: errResp.statusCode });
  }
}
