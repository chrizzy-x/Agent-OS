import { NextRequest, NextResponse } from 'next/server';
import { listInstalledAgentApps } from '@/src/appstore/service';
import { requireRouteCapability } from '@/src/auth/request';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'apps.install');
    const installed = await listInstalledAgentApps(ctx.agentId);
    return NextResponse.json({
      installedApps: omitAgentIdentifierFields(installed.map(entry => ({
        ...entry.app,
        installation: entry.installation,
      }))),
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
