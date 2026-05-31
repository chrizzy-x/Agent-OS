import { NextRequest } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { listStudioEventsSince } from '@/src/studio/persistence';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

function encodeEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.stream');
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    let cursor = searchParams.get('cursor') ?? new Date(0).toISOString();
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let polling = false;
        let timer: ReturnType<typeof setInterval> | null = null;

        const push = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(encodeEvent(event, data)));
        };

        const close = () => {
          if (closed) return;
          closed = true;
          if (timer) clearInterval(timer);
          try {
            controller.close();
          } catch {
            // no-op
          }
        };

        const poll = async () => {
          if (closed || polling) return;
          polling = true;
          try {
            const events = await listStudioEventsSince({
              ownerAgentId: ctx.agentId,
              sessionId: id,
              since: cursor,
              limit: 200,
            });
            for (const event of events) {
              cursor = event.createdAt;
              push('studio_event', event);
            }
          } catch (error) {
            const err = toErrorResponse(error);
            push('error', { code: err.code, error: err.message, message: err.message });
            close();
          } finally {
            polling = false;
          }
        };

        push('connected', { sessionId: id, cursor });
        void poll();
        timer = setInterval(() => {
          void poll();
        }, 1500);

        request.signal.addEventListener('abort', close);
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return new Response(
      JSON.stringify({ code: err.code, error: err.message, message: err.message }),
      {
        status: err.statusCode,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      },
    );
  }
}
