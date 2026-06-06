import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { sendStudioTerminalInputViaRuntime } from '@/src/studio/terminal-runtime';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const input = typeof body.input === 'string' ? body.input : '';
    if (!input.trim()) {
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', error: 'input_required', message: 'input is required' },
        { status: 400 },
      );
    }

    const result = await sendStudioTerminalInputViaRuntime(ctx, id, {
      input,
      advancedMode: body.advancedMode === true,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
