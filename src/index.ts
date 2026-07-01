import type { IncomingMessage, ServerResponse } from 'http';
import { createServer } from 'http';
import { createAgentToken, extractBearerToken, verifyAgentToken } from './auth/agent-identity.js';
import type { AgentContext } from './auth/permissions.js';
import { getFFPClient } from './ffp/client.js';
import { assertExternalAgentToolAccess, trackExternalAgentCall } from './external-agents/service.js';
import { executeUniversalToolCall, listUniversalMcpTools } from './mcp/registry.js';
import {
  buildCanonicalToolError,
  normalizeCanonicalToolInput,
  normalizeCanonicalToolName,
  normalizeCanonicalToolResult,
} from './mcp/canonical.js';
import { handleAgentMe } from './routes/agent-me.js';
import { readJsonBody, sendJson } from './routes/http.js';
import { handleRegister } from './routes/register.js';
import { APP_VERSION } from './config/release.js';
import {
  closeStudioTerminal,
  createStudioTerminal,
  getStudioTerminal,
  listStudioTerminalEvents,
  sendStudioTerminalInput,
} from './runtime/studio-terminal.js';
import { TOOLS } from './tools.js';
import { toErrorResponse } from './utils/errors.js';
import { sanitizeErrorMessage, sanitizeOutput } from './utils/output-sanitizer.js';

const REQUIRED_ENV: string[] = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'REDIS_URL',
  'JWT_SECRET',
  'ADMIN_TOKEN',
];

function validateEnv(): void {
  const missing = REQUIRED_ENV.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[startup] Missing required environment variables: ${missing.join(', ')}`);
    console.error('[startup] Set these in your .env file or Vercel project settings.');
    process.exit(1);
  }
  console.log('[startup] Environment validated');
}

async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    sendJson(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Authorization: Bearer <token> header required' }, message: 'Authorization: Bearer <token> header required' });
    return;
  }

  let agentContext;
  try {
    agentContext = verifyAgentToken(token);
  } catch (error) {
    const err = toErrorResponse(error);
    sendJson(res, err.statusCode, { error: err, code: err.code, message: err.message });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    const err = toErrorResponse(error);
    sendJson(res, 400, { error: err, code: err.code, message: err.message });
    return;
  }

  const requestedTool = typeof body.tool === 'string' ? body.tool : '';
  if (!requestedTool) {
    sendJson(res, 400, { error: 'validation_error', message: 'Request must include "tool" field' });
    return;
  }

  const toolName = normalizeCanonicalToolName(requestedTool);
  const normalizedInput = normalizeCanonicalToolInput(toolName, (body.input ?? body.arguments ?? {}) as Record<string, unknown>);

  try {
    await assertExternalAgentToolAccess(agentContext.agentId, requestedTool);
    const result = await executeUniversalToolCall({
      agentContext,
      name: toolName,
      server: typeof body.server === 'string' ? body.server : undefined,
      arguments: normalizedInput,
    });

    void trackExternalAgentCall(agentContext.agentId).catch(() => {});

    sendJson(res, 200, { success: true, result: sanitizeOutput(normalizeCanonicalToolResult(toolName, result)) });
  } catch (error) {
    const failure = buildCanonicalToolError(requestedTool, error);
    sendJson(res, failure.status, failure.body);
  }
}

function encodeSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function requireRuntimeAgentContext(req: IncomingMessage, res: ServerResponse): Promise<AgentContext | null> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    sendJson(res, 401, {
      error: { code: 'UNAUTHORIZED', message: 'Authorization: Bearer <token> header required' },
      message: 'Authorization: Bearer <token> header required',
    });
    return null;
  }

  try {
    return verifyAgentToken(token);
  } catch (error) {
    const err = toErrorResponse(error);
    sendJson(res, err.statusCode, { error: err, code: err.code, message: err.message });
    return null;
  }
}

async function handleStudioTerminalCreate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const agentContext = await requireRuntimeAgentContext(req, res);
  if (!agentContext) return;

  try {
    const body = await readJsonBody(req);
    const session = await createStudioTerminal({
      ownerAgentId: agentContext.agentId,
      projectId: typeof body.projectId === 'string' ? body.projectId : '',
      advancedMode: body.advancedMode === true,
    });
    sendJson(res, 201, { session });
  } catch (error) {
    const err = toErrorResponse(error);
    sendJson(res, err.statusCode, { error: err, code: err.code, message: err.message });
  }
}

async function handleStudioTerminalGet(req: IncomingMessage, res: ServerResponse, sessionId: string): Promise<void> {
  const agentContext = await requireRuntimeAgentContext(req, res);
  if (!agentContext) return;

  try {
    const session = await getStudioTerminal({
      ownerAgentId: agentContext.agentId,
      sessionId,
    });
    sendJson(res, 200, { session });
  } catch (error) {
    const err = toErrorResponse(error);
    sendJson(res, err.statusCode, { error: err, code: err.code, message: err.message });
  }
}

async function handleStudioTerminalInput(req: IncomingMessage, res: ServerResponse, sessionId: string): Promise<void> {
  const agentContext = await requireRuntimeAgentContext(req, res);
  if (!agentContext) return;

  try {
    const body = await readJsonBody(req);
    const result = await sendStudioTerminalInput({
      ownerAgentId: agentContext.agentId,
      sessionId,
      input: typeof body.input === 'string' ? body.input : '',
      advancedMode: body.advancedMode === true,
    });
    sendJson(res, 200, result);
  } catch (error) {
    const err = toErrorResponse(error);
    sendJson(res, err.statusCode, { error: err, code: err.code, message: err.message });
  }
}

async function handleStudioTerminalDelete(req: IncomingMessage, res: ServerResponse, sessionId: string): Promise<void> {
  const agentContext = await requireRuntimeAgentContext(req, res);
  if (!agentContext) return;

  try {
    const result = await closeStudioTerminal({
      ownerAgentId: agentContext.agentId,
      sessionId,
    });
    sendJson(res, 200, result);
  } catch (error) {
    const err = toErrorResponse(error);
    sendJson(res, err.statusCode, { error: err, code: err.code, message: err.message });
  }
}

async function handleStudioTerminalStream(req: IncomingMessage, res: ServerResponse, sessionId: string): Promise<void> {
  const agentContext = await requireRuntimeAgentContext(req, res);
  if (!agentContext) return;

  const urlObj = new URL(req.url ?? '/', 'http://localhost');
  let cursor = urlObj.searchParams.get('cursor') ?? '0';
  let closed = false;
  let polling = false;

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    res.end();
  };

  const push = (event: string, data: unknown) => {
    if (closed) return;
    res.write(encodeSseEvent(event, data));
  };

  const poll = async () => {
    if (closed || polling) return;
    polling = true;
    try {
      const events = await listStudioTerminalEvents({
        ownerAgentId: agentContext.agentId,
        sessionId,
        cursor,
      });
      for (const event of events) {
        cursor = event.id;
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

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  push('connected', { sessionId, cursor });
  void poll();
  const timer = setInterval(() => {
    void poll();
  }, 1000);

  req.on('close', close);
  req.on('aborted', close);
}

function handleRoot(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, {
    name: 'AgentOS',
    version: APP_VERSION,
    description: 'AgentOS runtime for tools, sessions, files, and Code Studio terminal execution.',
    status: 'ok',
    endpoints: {
      'GET  /': 'API info (this response)',
      'GET  /health': 'Liveness check',
      'GET  /tools': 'List universal MCP tools',
      'POST /mcp': 'Execute a universal MCP tool call (Bearer token required)',
      'POST /register': 'Register an external agent and receive a bearer token',
      'GET  /agent/me': 'Inspect the current external agent registration',
      'POST /admin/agents': 'Create a new bearer token (Admin token required)',
      'GET  /ffp/status': 'FFP mode and config summary',
      'POST /studio/terminals': 'Create a persistent Code Studio terminal',
      'GET  /studio/terminals/:id': 'Read a Code Studio terminal session',
      'POST /studio/terminals/:id/input': 'Send terminal input',
      'GET  /studio/terminals/:id/stream': 'Stream terminal output as SSE',
      'DELETE /studio/terminals/:id': 'Close a Code Studio terminal',
    },
  });
}

function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, {
    status: 'ok',
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    tools: Object.keys(TOOLS).length,
  });
}

async function handleCreateAgent(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    sendJson(res, 400, { error: 'configuration_error', message: 'Admin token not configured' });
    return;
  }

  const token = extractBearerToken(req.headers.authorization);
  if (token !== adminToken) {
    sendJson(res, 401, { error: 'unauthorized', message: 'Invalid admin token' });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    const err = toErrorResponse(error);
    sendJson(res, 400, { error: err, code: err.code, message: err.message });
    return;
  }

  const agentId = typeof body.agentId === 'string' ? body.agentId : `agent_${Date.now()}`;
  const allowedDomains = Array.isArray(body.allowedDomains) ? body.allowedDomains as string[] : [];
  const agentToken = createAgentToken(agentId, { allowedDomains, expiresIn: '90d' });

  sendJson(res, 201, {
    token: agentToken,
    expiresIn: '90d',
  });
}

async function handleTools(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const tools = await listUniversalMcpTools();
    sendJson(res, 200, { tools });
  } catch (error) {
    const err = toErrorResponse(error);
    sendJson(res, err.statusCode, { error: err, code: err.code, message: err.message });
  }
}

async function handleFFPAudit(req: IncomingMessage, res: ServerResponse, privateRef: string): Promise<void> {
  const adminToken = process.env.ADMIN_TOKEN;
  const token = extractBearerToken(req.headers.authorization);
  if (token !== adminToken) {
    sendJson(res, 401, { error: 'unauthorized', message: 'Invalid admin token' });
    return;
  }

  try {
    const urlObj = new URL(req.url ?? '/', 'http://localhost');
    const chainId = urlObj.searchParams.get('chain_id') ?? undefined;
    const startTime = urlObj.searchParams.get('start_time') ? Number(urlObj.searchParams.get('start_time')) : undefined;
    const endTime = urlObj.searchParams.get('end_time') ? Number(urlObj.searchParams.get('end_time')) : undefined;

    const operations = await getFFPClient().queryOperations({ agentId: privateRef, chainId, startTime, endTime });
    sendJson(res, 200, { operations: sanitizeOutput(operations), total: operations.length });
  } catch (error) {
    const err = toErrorResponse(error);
    sendJson(res, err.statusCode, { error: err, code: err.code, message: err.message });
  }
}

async function handleFFPConsensus(req: IncomingMessage, res: ServerResponse, privateRef: string): Promise<void> {
  const adminToken = process.env.ADMIN_TOKEN;
  const token = extractBearerToken(req.headers.authorization);
  if (token !== adminToken) {
    sendJson(res, 401, { error: 'unauthorized', message: 'Invalid admin token' });
    return;
  }

  sendJson(res, 501, {
    proposals: [],
    total: 0,
    mode: 'temp',
    consensusAvailable: false,
    message: `FFP consensus history is disabled and Coming Soon in v6.6.7 for ${privateRef}.`,
  });
}

function handleFFPStatus(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, {
    enabled: false,
    mode: 'temp',
    chainId: null,
    nodeUrl: null,
    requireConsensus: false,
    consensusAvailable: false,
    message: 'FFP is disabled and Coming Soon in v6.6.7. All runtime execution bypasses FFP.',
  });
}

async function router(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? '/';
  const pathname = new URL(url, 'http://localhost').pathname;
  const method = req.method ?? 'GET';
  const ffpAuditMatch = pathname.match(/^\/ffp\/audit\/([^/?]+)/);
  const ffpConsensusMatch = pathname.match(/^\/ffp\/consensus\/([^/?]+)/);
  const studioTerminalMatch = pathname.match(/^\/studio\/terminals\/([^/?]+)$/);
  const studioTerminalInputMatch = pathname.match(/^\/studio\/terminals\/([^/?]+)\/input$/);
  const studioTerminalStreamMatch = pathname.match(/^\/studio\/terminals\/([^/?]+)\/stream$/);

  try {
    if ((pathname === '/' || pathname === '') && method === 'GET') {
      handleRoot(req, res);
      return;
    }

    if (pathname === '/health' && method === 'GET') {
      handleHealth(req, res);
      return;
    }

    if (pathname === '/mcp' && method === 'POST') {
      await handleMcp(req, res);
      return;
    }

    if (pathname === '/register' && method === 'POST') {
      await handleRegister(req, res);
      return;
    }

    if (pathname === '/agent/me' && method === 'GET') {
      await handleAgentMe(req, res);
      return;
    }

    if (pathname === '/admin/agents' && method === 'POST') {
      await handleCreateAgent(req, res);
      return;
    }

    if (pathname === '/tools' && method === 'GET') {
      await handleTools(req, res);
      return;
    }

    if (pathname === '/studio/terminals' && method === 'POST') {
      await handleStudioTerminalCreate(req, res);
      return;
    }

    if (studioTerminalMatch && method === 'GET') {
      await handleStudioTerminalGet(req, res, decodeURIComponent(studioTerminalMatch[1]));
      return;
    }

    if (studioTerminalMatch && method === 'DELETE') {
      await handleStudioTerminalDelete(req, res, decodeURIComponent(studioTerminalMatch[1]));
      return;
    }

    if (studioTerminalInputMatch && method === 'POST') {
      await handleStudioTerminalInput(req, res, decodeURIComponent(studioTerminalInputMatch[1]));
      return;
    }

    if (studioTerminalStreamMatch && method === 'GET') {
      await handleStudioTerminalStream(req, res, decodeURIComponent(studioTerminalStreamMatch[1]));
      return;
    }

    if (pathname === '/ffp/status' && method === 'GET') {
      handleFFPStatus(req, res);
      return;
    }

    if (ffpAuditMatch && method === 'GET') {
      await handleFFPAudit(req, res, decodeURIComponent(ffpAuditMatch[1]));
      return;
    }

    if (ffpConsensusMatch && method === 'GET') {
      await handleFFPConsensus(req, res, decodeURIComponent(ffpConsensusMatch[1]));
      return;
    }

    sendJson(res, 404, { error: 'not_found', message: `${method} ${pathname} not found` });
  } catch (error) {
    const err = toErrorResponse(error);
    console.error('[router] unhandled error:', sanitizeErrorMessage(error));
    sendJson(res, err.statusCode, { error: err, code: err.code, message: err.message });
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return router(req, res);
}

if (process.env.NODE_ENV !== 'test') {
  validateEnv();
}

if ((process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') || process.env.STANDALONE === 'true') {
  const PORT = parseInt(process.env.PORT ?? '3000', 10);
  const server = createServer(router);
  server.listen(PORT, () => {
    console.log(`[startup] AgentOS server running on port ${PORT}`);
    console.log(`[startup] Health:    http://localhost:${PORT}/health`);
    console.log(`[startup] MCP:       http://localhost:${PORT}/mcp`);
    console.log(`[startup] Register:  http://localhost:${PORT}/register`);
    console.log(`[startup] Tools:     http://localhost:${PORT}/tools`);
  });

  process.on('SIGTERM', () => {
    console.log('[shutdown] SIGTERM received - closing server');
    server.close(() => process.exit(0));
  });

  process.on('SIGINT', () => {
    console.log('[shutdown] SIGINT received - closing server');
    server.close(() => process.exit(0));
  });
}
