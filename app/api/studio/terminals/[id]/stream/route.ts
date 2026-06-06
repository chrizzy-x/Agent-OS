import { NextRequest } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { streamStudioTerminalViaRuntime } from '@/src/studio/terminal-runtime';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.stream');
    const { id } = await params;
    const cursor = new URL(request.url).searchParams.get('cursor');
    return streamStudioTerminalViaRuntime(ctx, id, cursor);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return new Response(JSON.stringify({ code: err.code, error: err.message, message: err.message }), {
      status: err.statusCode,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
