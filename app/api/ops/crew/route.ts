import { NextRequest, NextResponse } from 'next/server';
import { hasAdminAccess, hasAgentAccess } from '@/src/auth/request';
import { getCrewOverview } from '@/src/ops/service';
import { toPublicCrewOverview } from '@/src/ops/public';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const overview = await getCrewOverview();
    const canViewInternalDetails = hasAdminAccess(request.headers) || hasAgentAccess(request.headers);
    return NextResponse.json(canViewInternalDetails ? overview : toPublicCrewOverview(overview));
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
