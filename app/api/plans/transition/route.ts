import { NextRequest, NextResponse } from 'next/server';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await request.json().catch(() => ({}));
    return NextResponse.json({
      code: 'PLAN_REQUEST_REQUIRED',
      error: 'Self-serve billing is disabled',
      message: 'Self-serve billing is disabled. Use the request-access flow on /billing or contact sales.',
    }, { status: 409 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
