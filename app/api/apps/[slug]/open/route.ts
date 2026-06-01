import { NextRequest, NextResponse } from 'next/server';
import { recordAgentAppOpen } from '@/src/appstore/service';
import { requireRouteCapability } from '@/src/auth/request';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'apps.install');
    const { slug } = await params;
    const result = await recordAgentAppOpen({ agentId: ctx.agentId, slug });
    return NextResponse.json({
      app: omitAgentIdentifierFields(result.app),
      installation: result.installation,
      openUrl: result.app.distribution.webUrl ?? result.app.appUrl ?? null,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
