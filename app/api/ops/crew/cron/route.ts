import { NextRequest, NextResponse } from 'next/server';
import { runCrewCron } from '@/src/ops/service';
import { requireCronAccess } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    requireCronAccess(request.headers);
    const result = await runCrewCron();
    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
