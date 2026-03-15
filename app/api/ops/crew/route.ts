import { NextResponse } from 'next/server';
import { getCrewOverview } from '@/src/ops/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const overview = await getCrewOverview();
    return NextResponse.json(overview);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
