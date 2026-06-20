import { NextRequest, NextResponse } from 'next/server';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { requireRouteCapability } from '@/src/auth/request';
import { rollbackAppVersion } from '@/src/appstore/discovery';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'apps.install');
    const { slug } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const version = typeof body.version === 'string' ? body.version : null;
    const result = await rollbackAppVersion({ agentId: ctx.agentId, slug, version });
    return NextResponse.json(omitAgentIdentifierFields(result));
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
