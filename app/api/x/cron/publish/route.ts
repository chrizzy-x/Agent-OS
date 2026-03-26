import { NextRequest, NextResponse } from 'next/server';
import { requireCronAccess } from '@/src/auth/request';
import { runXPublishCron } from '@/src/integrations/x/jobs';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    requireCronAccess(request.headers);
    const result = await runXPublishCron();
    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}