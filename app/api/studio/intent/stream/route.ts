import { NextRequest } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { appendExecutionLog, createExecution, updateExecution } from '@/src/execution/service';
import { createNotification } from '@/src/notifications/service';
import { sanitizeErrorMessage } from '@/src/utils/output-sanitizer';

export const runtime = 'nodejs';

function encodeEvent(event: string, payload: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let executionId: string | null = null;
      try {
        const ctx = await requireRouteCapability(request.headers, 'studio.intent');
        const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
        const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : null;
        const projectId = typeof body.projectId === 'string' ? body.projectId : null;
        const message = typeof body.message === 'string' ? body.message : typeof body.instruction === 'string' ? body.instruction : 'Super AgentOS request';
        const startedAt = Date.now();
        const execution = await createExecution({
          agentId: ctx.agentId,
          workspaceId,
          projectId,
          sessionId,
          sourceType: 'super_agent',
          type: 'CHAT_EXECUTION',
          sourceId: sessionId,
          title: message.slice(0, 180),
          input: { message, approval: body.approval === true },
          metadata: { projectId },
          model: 'claude',
        });
        executionId = execution.id;
        await updateExecution({
          agentId: ctx.agentId,
          executionId,
          patch: { status: 'RUNNING', startedAt: new Date(startedAt).toISOString() },
        });
        await appendExecutionLog({
          agentId: ctx.agentId,
          executionId,
          message: 'Super AgentOS request started',
        });
        controller.enqueue(encoder.encode(encodeEvent('execution', { executionId, status: 'RUNNING' })));

        const response = await fetch(new URL('/api/studio/intent', request.url), {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
        const completedAt = Date.now();
        const failed = !response.ok || payload.kind === 'error';
        const failure = failed ? {
          whatFailed: typeof payload.reply === 'string' ? payload.reply : 'Super AgentOS request failed',
          why: typeof payload.error === 'string' ? payload.error : 'The intent route returned an error.',
          where: 'Super AgentOS intent',
          possibleFix: 'Review the prompt, permissions, and execution logs before retrying.',
        } : null;
        await updateExecution({
          agentId: ctx.agentId,
          executionId,
          patch: {
            status: failed ? 'FAILED' : payload.kind === 'approval_required' ? 'PAUSED' : 'COMPLETED',
            output: payload,
            error: failure,
            failure,
            durationMs: completedAt - startedAt,
            completedAt: new Date(completedAt).toISOString(),
          },
        });
        await appendExecutionLog({
          agentId: ctx.agentId,
          executionId,
          level: failed ? 'error' : 'info',
          message: failed ? 'Super AgentOS request failed' : 'Super AgentOS request completed',
          data: { kind: payload.kind, status: response.status },
        });
        await createNotification({
          agentId: ctx.agentId,
          workspaceId,
          sessionId,
          executionId,
          type: failed ? 'execution_failed' : payload.kind === 'approval_required' ? 'approval_request' : 'execution_completed',
          title: failed ? 'Task failed' : payload.kind === 'approval_required' ? 'Approval required' : 'Task completed',
          body: typeof payload.reply === 'string' ? payload.reply.slice(0, 500) : message.slice(0, 500),
        }).catch(() => undefined);

        controller.enqueue(encoder.encode(encodeEvent('reply', { ...payload, executionId })));
        controller.enqueue(encoder.encode(encodeEvent('done', { executionId })));
      } catch (error) {
        const message = sanitizeErrorMessage(error);
        controller.enqueue(encoder.encode(encodeEvent('error', {
          executionId,
          code: 'STREAM_FAILED',
          reply: message,
          whatFailed: message,
          why: message,
          where: 'Super AgentOS stream',
          possibleFix: 'Retry the request or inspect recovery logs.',
        })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
