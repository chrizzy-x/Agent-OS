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
      error: 'FFP execution is not live in V6.6.2. Multi-agent work routes through the temporary abstraction layer into the Unified Execution Engine.',
    }, { status: 501 });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
