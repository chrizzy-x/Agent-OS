import { NextRequest, NextResponse } from 'next/server';
import { performFailover } from '@/src/ops/service';
import { requireOpsAdminAccess } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    await requireOpsAdminAccess(request.headers);
    const body = await request.json() as { featureSlug?: string; reason?: string };
    if (!body.featureSlug) {
      return NextResponse.json({ error: 'featureSlug is required' }, { status: 400 });
    }

    const result = await performFailover(body.featureSlug, body.reason ?? 'Manual failover requested', 'manual');
    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}