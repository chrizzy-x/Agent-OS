import { NextRequest, NextResponse } from 'next/server';
import { hasAdminAccess, hasAgentAccess } from '@/src/auth/request';
import { getOpsMetrics } from '@/src/ops/service';
import { toPublicOpsMetrics } from '@/src/ops/public';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const metrics = await getOpsMetrics();
    const canViewInternalDetails = hasAdminAccess(request.headers) || hasAgentAccess(request.headers);
    return NextResponse.json(canViewInternalDetails ? metrics : toPublicOpsMetrics(metrics));
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
