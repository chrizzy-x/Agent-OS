import { NextRequest, NextResponse } from 'next/server';
import { ensureCrewCoverage } from '@/src/ops/service';
import { hasAdminAccess, requireAgentContext } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

function canWrite(headers: Headers) {
  if (hasAdminAccess(headers)) {
    return true;
  }

  requireAgentContext(headers);
  return true;
}

export async function POST(request: NextRequest) {
  try {
    canWrite(request.headers);
    const result = await ensureCrewCoverage();
    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
