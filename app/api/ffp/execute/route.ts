import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    requireAgentContext(req.headers);
    return NextResponse.json({
      executed: false,
      mode: 'temp',
      consensusAvailable: false,
      error: 'FFP execution is disabled and Coming Soon in AgentOS v6.6.7. Multi-agent work uses the Unified Execution Engine.',
    }, { status: 501 });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
