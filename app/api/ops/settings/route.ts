import { NextRequest, NextResponse } from 'next/server';
import { getCrewSettings, updateCrewSettings } from '@/src/ops/service';
import { requireOpsAdminAccess } from '@/src/auth/request';
import { isFfpEnabled } from '@/src/config/env';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const settings = await getCrewSettings();
    return NextResponse.json({ settings, ffpEnabled: isFfpEnabled() });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireOpsAdminAccess(request.headers);
    const body = await request.json() as {
      operationMode?: 'single_agent' | 'multi_agent';
      consensusModeEnabled?: boolean;
    };

    const settings = await updateCrewSettings(body);
    return NextResponse.json({ success: true, settings, ffpEnabled: isFfpEnabled() });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}