import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { listTrustedDevices } from '@/src/auth/browser-sessions';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = requireAgentContext(request.headers);
    const devices = await listTrustedDevices(ctx.agentId);
    return NextResponse.json({ devices });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
