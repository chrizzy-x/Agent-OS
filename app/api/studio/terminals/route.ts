import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { createStudioTerminalSessionViaRuntime } from '@/src/studio/terminal-runtime';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const projectId = typeof body.projectId === 'string' ? body.projectId : '';
    if (!projectId) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', error: 'project_required', message: 'projectId is required' },
        { status: 400 },
      );
    }

    const session = await createStudioTerminalSessionViaRuntime(ctx, {
      projectId,
      advancedMode: body.advancedMode === true,
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
