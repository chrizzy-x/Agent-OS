import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    requireAgentContext(req.headers);
    return NextResponse.json({
      proposals: [],
      total: 0,
      mode: 'temp',
      consensusAvailable: false,
      message: 'FFP consensus is Coming Soon in AgentOS v6.6.3.',
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
