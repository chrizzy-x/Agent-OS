import { NextRequest, NextResponse } from 'next/server';
import { ensureCrewCoverage } from '@/src/ops/service';
import { requireOpsAdminAccess } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await requireOpsAdminAccess(request.headers);
    const result = await ensureCrewCoverage();
    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}