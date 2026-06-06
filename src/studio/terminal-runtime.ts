import { createAgentToken } from '../auth/agent-identity.js';
import type { AgentContext } from '../auth/permissions.js';
import { getAgentOSRuntimeUrl } from '../config/env.js';
import {
  closeStudioTerminal,
  createStudioTerminal,
  getStudioTerminal,
  listStudioTerminalEvents,
  sendStudioTerminalInput,
} from '../runtime/studio-terminal.js';
import type { StudioTerminalSession } from './types.js';
import { NotFoundError, PermissionError, ValidationError, toErrorResponse } from '../utils/errors.js';

function buildRuntimeHeaders(ctx: AgentContext): HeadersInit {
  const token = createAgentToken(ctx.agentId, {
    allowedDomains: ctx.allowedDomains,
    quotas: ctx.quotas,
    expiresIn: '5m',
  });

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function parseRuntimeJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

function throwRuntimeError(status: number, payload: Record<string, unknown>, fallback: string): never {
  const message = String(payload.message ?? payload.error ?? fallback);
  if (status === 403) {
    throw new PermissionError(message);
  }
  if (status === 404) {
    throw new NotFoundError(message);
  }
  if (status >= 400 && status < 500) {
    throw new ValidationError(message);
  }
  throw new Error(message);
}

async function runtimeFetch(
  ctx: AgentContext,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const runtimeUrl = getAgentOSRuntimeUrl();
  if (!runtimeUrl) {
    throw new Error('missing_runtime_url');
  }

  return fetch(`${runtimeUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      ...buildRuntimeHeaders(ctx),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
}

function encodeEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function buildLocalTerminalStream(ctx: AgentContext, sessionId: string, cursor: string | null): Response {
  const encoder = new TextEncoder();
  let currentCursor = cursor ?? '0';

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let polling = false;
      let timer: ReturnType<typeof setInterval> | null = null;

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

      const push = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeEvent(event, data)));
      };

      const poll = async () => {
        if (closed || polling) return;
        polling = true;
        try {
          const events = await listStudioTerminalEvents({
            ownerAgentId: ctx.agentId,
            sessionId,
            cursor: currentCursor,
          });
          for (const event of events) {
            currentCursor = event.id;
            push('terminal_event', event);
          }
        } catch (error) {
          const err = toErrorResponse(error);
          push('error', { code: err.code, error: err.message, message: err.message });
          close();
        } finally {
          polling = false;
        }
      };

      push('connected', { sessionId, cursor: currentCursor });
      void poll();
      timer = setInterval(() => {
        void poll();
      }, 1000);
    },

    cancel() {
      // no-op
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
}

export async function createStudioTerminalSessionViaRuntime(
  ctx: AgentContext,
  params: { projectId: string; advancedMode: boolean },
): Promise<StudioTerminalSession> {
  const runtimeUrl = getAgentOSRuntimeUrl();
  if (!runtimeUrl) {
    return createStudioTerminal({
      ownerAgentId: ctx.agentId,
      projectId: params.projectId,
      advancedMode: params.advancedMode,
    });
  }

  const response = await runtimeFetch(ctx, '/studio/terminals', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  const payload = await parseRuntimeJson(response);
  if (!response.ok) {
    throwRuntimeError(response.status, payload, 'Failed to create terminal session');
  }
  return payload.session as StudioTerminalSession;
}

export async function getStudioTerminalSessionViaRuntime(
  ctx: AgentContext,
  sessionId: string,
): Promise<StudioTerminalSession> {
  const runtimeUrl = getAgentOSRuntimeUrl();
  if (!runtimeUrl) {
    return getStudioTerminal({
      ownerAgentId: ctx.agentId,
      sessionId,
    });
  }

  const response = await runtimeFetch(ctx, `/studio/terminals/${encodeURIComponent(sessionId)}`);
  const payload = await parseRuntimeJson(response);
  if (!response.ok) {
    throwRuntimeError(response.status, payload, 'Failed to load terminal session');
  }
  return payload.session as StudioTerminalSession;
}

export async function sendStudioTerminalInputViaRuntime(
  ctx: AgentContext,
  sessionId: string,
  params: { input: string; advancedMode: boolean },
): Promise<{ accepted: boolean; marker?: string; session: StudioTerminalSession }> {
  const runtimeUrl = getAgentOSRuntimeUrl();
  if (!runtimeUrl) {
    return sendStudioTerminalInput({
      ownerAgentId: ctx.agentId,
      sessionId,
      input: params.input,
      advancedMode: params.advancedMode,
    });
  }

  const response = await runtimeFetch(ctx, `/studio/terminals/${encodeURIComponent(sessionId)}/input`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
  const payload = await parseRuntimeJson(response);
  if (!response.ok) {
    throwRuntimeError(response.status, payload, 'Failed to send terminal input');
  }
  return payload as { accepted: boolean; marker?: string; session: StudioTerminalSession };
}

export async function closeStudioTerminalSessionViaRuntime(
  ctx: AgentContext,
  sessionId: string,
): Promise<{ closed: boolean }> {
  const runtimeUrl = getAgentOSRuntimeUrl();
  if (!runtimeUrl) {
    return closeStudioTerminal({
      ownerAgentId: ctx.agentId,
      sessionId,
    });
  }

  const response = await runtimeFetch(ctx, `/studio/terminals/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
  const payload = await parseRuntimeJson(response);
  if (!response.ok) {
    throwRuntimeError(response.status, payload, 'Failed to close terminal session');
  }
  return payload as { closed: boolean };
}

export async function streamStudioTerminalViaRuntime(
  ctx: AgentContext,
  sessionId: string,
  cursor: string | null,
): Promise<Response> {
  const runtimeUrl = getAgentOSRuntimeUrl();
  if (!runtimeUrl) {
    return buildLocalTerminalStream(ctx, sessionId, cursor);
  }

  const search = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const response = await runtimeFetch(ctx, `/studio/terminals/${encodeURIComponent(sessionId)}/stream${search}`, {
    method: 'GET',
    headers: buildRuntimeHeaders(ctx),
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'text/event-stream; charset=utf-8',
      'Cache-Control': response.headers.get('cache-control') ?? 'no-cache, no-transform',
      Connection: response.headers.get('connection') ?? 'keep-alive',
    },
  });
}
