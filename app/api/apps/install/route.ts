import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { installAgentApp } from '@/src/appstore/service';
import { assertWorkspaceMembership } from '@/src/workspaces/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'apps.install');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const slug = typeof body.slug === 'string' ? body.slug : '';
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : null;
    if (!slug.trim()) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'slug is required', message: 'slug is required' }, { status: 400 });
    }
    if (workspaceId) {
      await assertWorkspaceMembership(workspaceId, ctx.agentId);
    }

    const result = await installAgentApp({
      agentId: ctx.agentId,
      slug,
      workspaceId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
