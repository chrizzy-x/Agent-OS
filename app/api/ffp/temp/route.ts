import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { getFfpTempSettings } from '@/src/ffp/temp';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    const url = new URL(request.url);
    const settings = await getFfpTempSettings({
      ownerAgentId: ctx.agentId,
      workspaceId: url.searchParams.get('workspaceId'),
    });
    return NextResponse.json(settings);
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function PATCH(request: NextRequest) {
  void request;
  return NextResponse.json({
    code: 'METHOD_NOT_ALLOWED',
    error: 'FFP is disabled',
    message: 'FFP is Coming Soon and cannot be enabled in AgentOS v6.6.4.',
  }, { status: 405, headers: { Allow: 'GET' } });
}
