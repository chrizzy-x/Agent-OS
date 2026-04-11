import { z } from 'zod';
import { lookup } from 'dns/promises';
import { checkRateLimit } from '../runtime/resource-manager.js';
import { checkSsrf, checkDomainAllowed } from '../runtime/security.js';
import { withAudit } from '../runtime/audit.js';
import { validate, urlSchema, headersSchema } from '../utils/validation.js';
import { ValidationError } from '../utils/errors.js';
import { getFFPClient } from '../ffp/client.js';
import type { AgentContext } from '../auth/permissions.js';

const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;
const REQUEST_TIMEOUT = 30_000;
const USER_AGENT = 'AgentOS/1.0 by riz (+https://github.com/chrizzy-x/Agent-OS)';

interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  contentType: string;
}

async function makeRequest(
  ctx: AgentContext,
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<HttpResponse> {
  await checkSsrf(url);
  checkDomainAllowed(url, ctx.allowedDomains);
  await checkRateLimit(ctx);

  const ffp = getFFPClient();
  if (ffp.isCriticalUrl(url)) {
    const approved = await ffp.consensus({
      operation: `net.${method.toLowerCase()}`,
      params: { url, method },
      confidence: 0.95,
    });
    if (!approved) {
      throw new ValidationError(`FFP consensus rejected outbound ${method} to ${url}`);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const requestHeaders: Record<string, string> = {
      'User-Agent': USER_AGENT,
      ...headers,
    };

    const fetchOptions: RequestInit = {
      method,
      headers: requestHeaders,
      signal: controller.signal,
    };

    if (body !== undefined) {
      if (typeof body === 'string') {
        fetchOptions.body = body;
      } else {
        requestHeaders['Content-Type'] = requestHeaders['Content-Type'] ?? 'application/json';
        fetchOptions.body = JSON.stringify(body);
      }
    }

    let response: Response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : 'Outbound request failed');
    }

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
      if (done) {
        break;
      }

      totalBytes += value.length;
      if (totalBytes > MAX_RESPONSE_SIZE) {
        reader.cancel();
        throw new ValidationError(`Response exceeds maximum size of ${MAX_RESPONSE_SIZE / 1024 / 1024}MB`);
      }
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    const isText = contentType.includes('text') || contentType.includes('json') || contentType.includes('xml');

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: isText ? buffer.toString('utf8') : buffer.toString('base64'),
      contentType,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function netHttpGet(ctx: AgentContext, input: unknown): Promise<HttpResponse> {
  const { url, headers } = validate(z.object({ url: urlSchema, headers: headersSchema }), input);
  return withAudit({ agentId: ctx.agentId, primitive: 'net', operation: 'http_get', metadata: { url } }, async () => {
    const result = await makeRequest(ctx, 'GET', url, headers ?? {});
    void getFFPClient().log({ primitive: 'net', action: 'http_get', params: { url }, result: { status: result.status }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function netHttpPost(ctx: AgentContext, input: unknown): Promise<HttpResponse> {
  const { url, body, headers } = validate(z.object({ url: urlSchema, body: z.unknown(), headers: headersSchema }), input);
  return withAudit({ agentId: ctx.agentId, primitive: 'net', operation: 'http_post', metadata: { url } }, async () => {
    const result = await makeRequest(ctx, 'POST', url, headers ?? {}, body);
    void getFFPClient().log({ primitive: 'net', action: 'http_post', params: { url }, result: { status: result.status }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function netHttpPut(ctx: AgentContext, input: unknown): Promise<HttpResponse> {
  const { url, body, headers } = validate(z.object({ url: urlSchema, body: z.unknown(), headers: headersSchema }), input);
  return withAudit({ agentId: ctx.agentId, primitive: 'net', operation: 'http_put', metadata: { url } }, async () => {
    const result = await makeRequest(ctx, 'PUT', url, headers ?? {}, body);
    void getFFPClient().log({ primitive: 'net', action: 'http_put', params: { url }, result: { status: result.status }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function netHttpDelete(ctx: AgentContext, input: unknown): Promise<HttpResponse> {
  const { url, headers } = validate(z.object({ url: urlSchema, headers: headersSchema }), input);
  return withAudit({ agentId: ctx.agentId, primitive: 'net', operation: 'http_delete', metadata: { url } }, async () => {
    const result = await makeRequest(ctx, 'DELETE', url, headers ?? {});
    void getFFPClient().log({ primitive: 'net', action: 'http_delete', params: { url }, result: { status: result.status }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function netDnsResolve(
  ctx: AgentContext,
  input: unknown,
): Promise<{ hostname: string; addresses: string[] }> {
  const { hostname } = validate(z.object({ hostname: z.string().min(1).max(253) }), input);
  return withAudit({ agentId: ctx.agentId, primitive: 'net', operation: 'dns_resolve', metadata: { hostname } }, async () => {
    await checkRateLimit(ctx);
    try {
      const results = await lookup(hostname, { all: true });
      return { hostname, addresses: results.map(result => result.address) };
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : 'DNS lookup failed');
    }
  });
}
