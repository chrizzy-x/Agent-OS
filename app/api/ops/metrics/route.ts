import { NextResponse } from 'next/server';
import { getOpsMetrics } from '@/src/ops/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const metrics = await getOpsMetrics();
    return NextResponse.json(metrics);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
