import type { IncomingMessage, ServerResponse } from 'http';
import { createServer } from 'http';
import { createAgentToken, extractBearerToken, verifyAgentToken } from './auth/agent-identity.js';
import { getFFPClient } from './ffp/client.js';
import { assertExternalAgentToolAccess, trackExternalAgentCall } from './external-agents/service.js';
import { executeUniversalToolCall, listUniversalMcpTools } from './mcp/registry.js';
import { handleAgentMe } from './routes/agent-me.js';
import { readJsonBody, sendJson } from './routes/http.js';
import { handleRegister } from './routes/register.js';
import { TOOLS } from './tools.js';
import { toErrorResponse } from './utils/errors.js';

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
    sendJson(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Authorization: Bearer <token> header required' } });
    return;
  }

  let agentContext;
  try {
    agentContext = verifyAgentToken(token);
  } catch (error) {
    const err = toErrorResponse(error);
    sendJson(res, err.statusCode, { error: err });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    const err = toErrorResponse(error);
    sendJson(res, 400, { error: err });
    return;
  }

  const toolName = typeof body.tool === 'string' ? body.tool : '';
  if (!toolName) {
    sendJson(res, 400, { error: { code: 'VALIDATION_ERROR', message: 'Request must include "tool" field' } });
    return;
  }

  try {
    await assertExternalAgentToolAccess(agentContext.agentId, toolName);
    const result = await executeUniversalToolCall({
      agentContext,
      name: toolName,
      server: typeof body.server === 'string' ? body.server : undefined,
      arguments: (body.input ?? body.arguments ?? {}) as Record<string, unknown>,
    });

    void trackExternalAgentCall(agentContext.agentId).catch(() => {});

    sendJson(res, 200, { success: true, result });
  } catch (error) {
    const err = toErrorResponse(error);
    sendJson(res, err.statusCode, { error: err });
  }
}

function handleRoot(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, {
    name: 'AgentOS',
    version: '1.0.0',
    description: 'Universal MCP, primitives, marketplace skills, and external agent connectivity over one endpoint.',
    status: 'ok',
    endpoints: {
      'GET  /': 'API info (this response)',
      'GET  /health': 'Liveness check',
      'GET  /tools': 'List universal MCP tools',
      'POST /mcp': 'Execute a universal MCP tool call (Bearer token required)',
      'POST /register': 'Register an external agent and receive a bearer token',
      'GET  /agent/me': 'Inspect the current external agent registration',
      'POST /admin/agents': 'Create a new agent token (Admin token required)',
      'GET  /ffp/status': 'FFP mode and config summary',
    },
  });
}

function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, {
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    tools: Object.keys(TOOLS).length,
  });
}

async function handleCreateAgent(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    sendJson(res, 503, { error: { code: 'CONFIGURATION_ERROR', message: 'Admin token not configured' } });
    return;
  }

  const token = extractBearerToken(req.headers.authorization);
  if (token !== adminToken) {
    sendJson(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Invalid admin token' } });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: toErrorResponse(error) });
    return;
  }

  const agentId = typeof body.agentId === 'string' ? body.agentId : `agent_${Date.now()}`;
  const allowedDomains = Array.isArray(body.allowedDomains) ? body.allowedDomains as string[] : [];
  const agentToken = createAgentToken(agentId, { allowedDomains, expiresIn: '90d' });

  sendJson(res, 201, {
    agentId,
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
    sendJson(res, err.statusCode, { error: err });
  }
}

async function handleFFPAudit(req: IncomingMessage, res: ServerResponse, agentId: string): Promise<void> {
  const adminToken = process.env.ADMIN_TOKEN;
  const token = extractBearerToken(req.headers.authorization);
  if (token !== adminToken) {
    sendJson(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Invalid admin token' } });
    return;
  }

  try {
    const urlObj = new URL(req.url ?? '/', 'http://localhost');
    const chainId = urlObj.searchParams.get('chain_id') ?? undefined;
    const startTime = urlObj.searchParams.get('start_time') ? Number(urlObj.searchParams.get('start_time')) : undefined;
    const endTime = urlObj.searchParams.get('end_time') ? Number(urlObj.searchParams.get('end_time')) : undefined;

    const operations = await getFFPClient().queryOperations({ agentId, chainId, startTime, endTime });
    sendJson(res, 200, { agentId, operations, total: operations.length });
  } catch (error) {
    const err = toErrorResponse(error);
    sendJson(res, err.statusCode, { error: err });
  }
}

async function handleFFPConsensus(req: IncomingMessage, res: ServerResponse, agentId: string): Promise<void> {
  const adminToken = process.env.ADMIN_TOKEN;
  const token = extractBearerToken(req.headers.authorization);
  if (token !== adminToken) {
    sendJson(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Invalid admin token' } });
    return;
  }

  try {
    const proposals = await getFFPClient().queryConsensusHistory(agentId);
    sendJson(res, 200, { agentId, proposals, total: proposals.length });
  } catch (error) {
    const err = toErrorResponse(error);
    sendJson(res, err.statusCode, { error: err });
  }
}

function handleFFPStatus(_req: IncomingMessage, res: ServerResponse): void {
  const ffp = getFFPClient();
  sendJson(res, 200, {
    enabled: ffp.config.enabled,
    chainId: ffp.config.chainId || null,
    nodeUrl: ffp.config.nodeUrl || null,
    requireConsensus: ffp.config.requireConsensus,
  });
}

async function router(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? '/';
  const pathname = new URL(url, 'http://localhost').pathname;
  const method = req.method ?? 'GET';
  const ffpAuditMatch = pathname.match(/^\/ffp\/audit\/([^/?]+)/);
  const ffpConsensusMatch = pathname.match(/^\/ffp\/consensus\/([^/?]+)/);

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

    sendJson(res, 404, { error: { code: 'NOT_FOUND', message: `${method} ${pathname} not found` } });
  } catch (error) {
    console.error('[router] unhandled error:', error);
    sendJson(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
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
