import type { IncomingMessage, ServerResponse } from 'http';
import { createServer } from 'http';
import { verifyAgentToken, extractBearerToken, createAgentToken } from './auth/agent-identity.js';
import { checkRateLimit } from './runtime/resource-manager.js';
import { toErrorResponse } from './utils/errors.js';
import { AuthError, ValidationError } from './utils/errors.js';

// Primitives
import { memSet, memGet, memDelete, memList, memIncr, memExpire } from './primitives/mem.js';
import { fsWrite, fsRead, fsList, fsDelete, fsMkdir, fsStat } from './primitives/fs.js';
import { dbQuery, dbTransaction, dbCreateTable, dbInsert, dbUpdate, dbDelete } from './primitives/db.js';
import { netHttpGet, netHttpPost, netHttpPut, netHttpDelete, netDnsResolve } from './primitives/net.js';
import { eventsPublish, eventsSubscribe, eventsUnsubscribe, eventsListTopics } from './primitives/events.js';
import { procExecute, procSchedule, procSpawn, procKill, procList } from './primitives/proc.js';
import type { AgentContext } from './auth/permissions.js';

// Tool registry — maps MCP tool names to their handler functions
type ToolHandler = (ctx: AgentContext, input: unknown) => Promise<unknown>;

const TOOLS: Record<string, ToolHandler> = {
  // Memory primitive
  mem_set: memSet,
  mem_get: memGet,
  mem_delete: memDelete,
  mem_list: memList,
  mem_incr: memIncr,
  mem_expire: memExpire,

  // Filesystem primitive
  fs_write: fsWrite,
  fs_read: fsRead,
  fs_list: fsList,
  fs_delete: fsDelete,
  fs_mkdir: fsMkdir,
  fs_stat: fsStat,

  // Database primitive
  db_query: dbQuery,
  db_transaction: dbTransaction,
  db_create_table: dbCreateTable,
  db_insert: dbInsert,
  db_update: dbUpdate,
  db_delete: dbDelete,

  // Network primitive
  net_http_get: netHttpGet,
  net_http_post: netHttpPost,
  net_http_put: netHttpPut,
  net_http_delete: netHttpDelete,
  net_dns_resolve: netDnsResolve,

  // Events primitive
  events_publish: eventsPublish,
  events_subscribe: eventsSubscribe,
  events_unsubscribe: eventsUnsubscribe,
  events_list_topics: eventsListTopics,

  // Process primitive
  proc_execute: procExecute,
  proc_schedule: procSchedule,
  proc_spawn: procSpawn,
  proc_kill: procKill,
  proc_list: procList,
};

// Parse the request body as JSON
async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new ValidationError('Request body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Send a JSON response
function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

// Handle POST /mcp — execute an MCP tool call
async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Authenticate
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    sendJson(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Authorization: Bearer <token> header required' } });
    return;
  }

  let ctx: AgentContext;
  try {
    ctx = verifyAgentToken(token);
  } catch (err) {
    const errResp = toErrorResponse(err);
    sendJson(res, errResp.statusCode, { error: errResp });
    return;
  }

  // Parse request body
  let body: unknown;
  try {
    body = await readBody(req);
  } catch (err) {
    const errResp = toErrorResponse(err);
    sendJson(res, 400, { error: errResp });
    return;
  }

  // Extract tool name and input from MCP request format
  const mcpReq = body as Record<string, unknown>;
  const tool = typeof mcpReq.tool === 'string' ? mcpReq.tool : undefined;
  const input = mcpReq.input ?? mcpReq.arguments ?? {};

  if (!tool) {
    sendJson(res, 400, { error: { code: 'VALIDATION_ERROR', message: 'Request must include "tool" field' } });
    return;
  }

  const handler = TOOLS[tool];
  if (!handler) {
    sendJson(res, 404, { error: { code: 'NOT_FOUND', message: `Unknown tool: ${tool}. Available tools: ${Object.keys(TOOLS).join(', ')}` } });
    return;
  }

  try {
    const result = await handler(ctx, input);
    sendJson(res, 200, { result });
  } catch (err) {
    const errResp = toErrorResponse(err);
    sendJson(res, errResp.statusCode, { error: errResp });
  }
}

// Handle GET /health — basic liveness check
function handleHealth(req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, {
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    tools: Object.keys(TOOLS).length,
  });
}

// Handle POST /admin/agents — create a new agent (admin only)
async function handleCreateAgent(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    sendJson(res, 503, { error: { code: 'CONFIGURATION_ERROR', message: 'Admin token not configured' } });
    return;
  }

  const authHeader = req.headers.authorization;
  const token = extractBearerToken(authHeader);

  if (token !== adminToken) {
    sendJson(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Invalid admin token' } });
    return;
  }

  let body: unknown;
  try {
    body = await readBody(req);
  } catch (err) {
    sendJson(res, 400, { error: toErrorResponse(err) });
    return;
  }

  const req2 = body as Record<string, unknown>;
  const agentId = typeof req2.agentId === 'string' ? req2.agentId : `agent_${Date.now()}`;
  const allowedDomains = Array.isArray(req2.allowedDomains) ? req2.allowedDomains as string[] : [];

  const agentToken = createAgentToken(agentId, { allowedDomains, expiresIn: '90d' });

  sendJson(res, 201, {
    agentId,
    token: agentToken,
    expiresIn: '90d',
  });
}

// Main HTTP request router
async function router(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  try {
    if (url === '/health' && method === 'GET') {
      handleHealth(req, res);
    } else if (url === '/mcp' && method === 'POST') {
      await handleMcp(req, res);
    } else if (url === '/admin/agents' && method === 'POST') {
      await handleCreateAgent(req, res);
    } else if (url === '/tools' && method === 'GET') {
      // List available tools with their descriptions
      sendJson(res, 200, { tools: Object.keys(TOOLS) });
    } else {
      sendJson(res, 404, { error: { code: 'NOT_FOUND', message: `${method} ${url} not found` } });
    }
  } catch (err) {
    console.error('[router] unhandled error:', err);
    sendJson(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
}

// Export handler for Vercel serverless deployment
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return router(req, res);
}

// Also support running as a standalone Node.js server for local development
if (process.env.NODE_ENV !== 'production' || process.env.STANDALONE === 'true') {
  const PORT = parseInt(process.env.PORT ?? '3000');
  const server = createServer(router);
  server.listen(PORT, () => {
    console.log(`AgentOS server running on port ${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  });
}
