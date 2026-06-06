import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import {
  closeStudioTerminalSessionViaRuntime,
  getStudioTerminalSessionViaRuntime,
} from '@/src/studio/terminal-runtime';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    const { id } = await params;
    const session = await getStudioTerminalSessionViaRuntime(ctx, id);
    return NextResponse.json({ session });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const { id } = await params;
    const result = await closeStudioTerminalSessionViaRuntime(ctx, id);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
