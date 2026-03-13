import { z } from 'zod';
import { lookup } from 'dns/promises';
import { checkRateLimit } from '../runtime/resource-manager.js';
import { checkSsrf, checkDomainAllowed } from '../runtime/security.js';
import { withAudit } from '../runtime/audit.js';
import { validate, urlSchema, headersSchema } from '../utils/validation.js';
import { ValidationError } from '../utils/errors.js';
import type { AgentContext } from '../auth/permissions.js';

const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB
const REQUEST_TIMEOUT = 30_000; // 30 seconds
const USER_AGENT = 'AgentOS/1.0 by riz (+https://github.com/chrizzy-x/Agent-OS)';

interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  contentType: string;
}

// Shared logic for all HTTP methods: security checks, rate limiting, fetch, response handling
async function makeRequest(
  ctx: AgentContext,
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown
): Promise<HttpResponse> {
  // Run security checks before rate limit — no point counting blocked requests
  await checkSsrf(url);
  checkDomainAllowed(url, ctx.allowedDomains);
  await checkRateLimit(ctx);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const reqHeaders: Record<string, string> = {
      'User-Agent': USER_AGENT,
      ...headers,
    };

    const fetchOptions: RequestInit = {
      method,
      headers: reqHeaders,
      signal: controller.signal,
    };

    if (body !== undefined) {
      if (typeof body === 'string') {
        fetchOptions.body = body;
      } else {
        fetchOptions.body = JSON.stringify(body);
        reqHeaders['Content-Type'] = reqHeaders['Content-Type'] ?? 'application/json';
      }
    }

    const response = await fetch(url, fetchOptions);

    // Read response body with size limit
    const reader = response.body?.getReader();
    if (!reader) {
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: '',
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      };
    }

    let totalBytes = 0;
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.length;
      if (totalBytes > MAX_RESPONSE_SIZE) {
        reader.cancel();
        throw new ValidationError(`Response exceeds maximum size of ${MAX_RESPONSE_SIZE / 1024 / 1024}MB`);
      }
      chunks.push(value);
    }

    const bodyBuffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';

    // Return body as string — binary responses are base64-encoded
    const isText = contentType.includes('text') || contentType.includes('json') || contentType.includes('xml');
    const bodyStr = isText ? bodyBuffer.toString('utf8') : bodyBuffer.toString('base64');

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: bodyStr,
      contentType,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function netHttpGet(ctx: AgentContext, input: unknown): Promise<HttpResponse> {
  const { url, headers } = validate(
    z.object({ url: urlSchema, headers: headersSchema }),
    input
  );

  return withAudit(
    { agentId: ctx.agentId, primitive: 'net', operation: 'http_get', metadata: { url } },
    () => makeRequest(ctx, 'GET', url, headers ?? {})
  );
}

export async function netHttpPost(ctx: AgentContext, input: unknown): Promise<HttpResponse> {
  const { url, body, headers } = validate(
    z.object({ url: urlSchema, body: z.unknown(), headers: headersSchema }),
    input
  );

  return withAudit(
    { agentId: ctx.agentId, primitive: 'net', operation: 'http_post', metadata: { url } },
    () => makeRequest(ctx, 'POST', url, headers ?? {}, body)
  );
}

export async function netHttpPut(ctx: AgentContext, input: unknown): Promise<HttpResponse> {
  const { url, body, headers } = validate(
    z.object({ url: urlSchema, body: z.unknown(), headers: headersSchema }),
    input
  );

  return withAudit(
    { agentId: ctx.agentId, primitive: 'net', operation: 'http_put', metadata: { url } },
    () => makeRequest(ctx, 'PUT', url, headers ?? {}, body)
  );
}

export async function netHttpDelete(ctx: AgentContext, input: unknown): Promise<HttpResponse> {
  const { url, headers } = validate(
    z.object({ url: urlSchema, headers: headersSchema }),
    input
  );

  return withAudit(
    { agentId: ctx.agentId, primitive: 'net', operation: 'http_delete', metadata: { url } },
    () => makeRequest(ctx, 'DELETE', url, headers ?? {})
  );
}

// Resolve a hostname to its IP addresses
export async function netDnsResolve(
  ctx: AgentContext,
  input: unknown
): Promise<{ hostname: string; addresses: string[] }> {
  const { hostname } = validate(
    z.object({ hostname: z.string().min(1).max(253) }),
    input
  );

  return withAudit(
    { agentId: ctx.agentId, primitive: 'net', operation: 'dns_resolve', metadata: { hostname } },
    async () => {
      await checkRateLimit(ctx);

      const results = await lookup(hostname, { all: true });
      return {
        hostname,
        addresses: results.map(r => r.address),
      };
    }
  );
}
