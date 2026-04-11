import { NotFoundError, SecurityError, toErrorResponse } from '../utils/errors.js';

function stripToolPrefix(tool: string): string {
  return tool.startsWith('agentos.') ? tool.slice('agentos.'.length) : tool;
}

function decodeBase64(data: string): string {
  try {
    return Buffer.from(data, 'base64').toString('utf8');
  } catch {
    return data;
  }
}

export function normalizeCanonicalToolName(tool: string): string {
  return stripToolPrefix(tool.trim());
}

export function normalizeCanonicalToolInput(tool: string, input: Record<string, unknown>): Record<string, unknown> {
  const normalizedTool = stripToolPrefix(tool);

  switch (normalizedTool) {
    case 'mem_incr':
      return {
        ...input,
        amount: typeof input.amount === 'number' ? input.amount : input.by,
      };
    case 'mem_expire':
      return {
        ...input,
        seconds: typeof input.seconds === 'number' ? input.seconds : input.ttl,
      };
    case 'fs_write': {
      if (typeof input.data === 'string') {
        return input;
      }

      const content = typeof input.content === 'string' ? input.content : '';
      return {
        path: input.path,
        data: Buffer.from(content, 'utf8').toString('base64'),
        contentType: typeof input.contentType === 'string' ? input.contentType : 'text/plain',
      };
    }
    case 'db_transaction': {
      if (Array.isArray(input.queries)) {
        return input;
      }

      if (Array.isArray(input.statements)) {
        return {
          queries: input.statements
            .filter((statement): statement is string => typeof statement === 'string' && statement.trim().length > 0)
            .map(statement => ({ sql: statement, params: [] })),
        };
      }

      return input;
    }
    case 'events_publish':
      return {
        ...input,
        message: input.message ?? input.data ?? input.payload,
      };
    case 'proc_execute':
      return {
        ...input,
        timeout: typeof input.timeout === 'number' ? input.timeout : input.timeoutMs,
      };
    case 'proc_kill':
      return {
        processId: input.processId ?? input.pid,
      };
    default:
      return input;
  }
}

export function normalizeCanonicalToolResult(tool: string, result: unknown): unknown {
  const normalizedTool = stripToolPrefix(tool);

  if (!result || typeof result !== 'object') {
    return result;
  }

  const payload = result as Record<string, unknown>;

  switch (normalizedTool) {
    case 'mem_get':
      return { value: payload.value ?? null };
    case 'mem_list':
      return { result: Array.isArray(payload.keys) ? payload.keys : [] };
    case 'fs_read':
      return {
        content: typeof payload.data === 'string' ? decodeBase64(payload.data) : '',
        contentType: payload.contentType ?? 'application/octet-stream',
        size: payload.sizeBytes ?? 0,
      };
    case 'fs_stat':
      return {
        size: payload.sizeBytes ?? 0,
        modified: payload.updatedAt ?? null,
        exists: true,
      };
    case 'fs_list':
      return {
        files: Array.isArray(payload.entries)
          ? payload.entries
              .map(entry => {
                if (!entry || typeof entry !== 'object') {
                  return null;
                }
                const item = entry as Record<string, unknown>;
                return typeof item.path === 'string' ? item.path : typeof item.name === 'string' ? item.name : null;
              })
              .filter((entry): entry is string => Boolean(entry))
          : [],
      };
    case 'db_query':
      return { rows: Array.isArray(payload.rows) ? payload.rows : [] };
    case 'db_create_table':
      return { success: true, table: payload.table ?? null };
    case 'db_insert':
      return {
        ...(payload.row && typeof payload.row === 'object' ? payload.row as Record<string, unknown> : {}),
        ...(payload.row && typeof payload.row === 'object' && 'id' in (payload.row as Record<string, unknown>)
          ? { id: (payload.row as Record<string, unknown>).id }
          : { success: true }),
      };
    case 'db_update':
    case 'db_delete':
    case 'db_transaction':
      return { success: true, ...payload };
    case 'events_publish':
      return { success: true, topic: payload.topic ?? null, messageId: payload.messageId ?? null };
    case 'events_list_topics':
      return {
        topics: Array.isArray(payload.topics)
          ? payload.topics
              .map(topic => {
                if (typeof topic === 'string') {
                  return topic;
                }
                if (topic && typeof topic === 'object' && 'topic' in topic) {
                  const item = topic as Record<string, unknown>;
                  return typeof item.topic === 'string' ? item.topic : null;
                }
                return null;
              })
              .filter((topic): topic is string => Boolean(topic))
          : [],
      };
    case 'events_unsubscribe':
      return { success: payload.unsubscribed === true };
    case 'proc_execute':
      return {
        output: typeof payload.stdout === 'string' ? payload.stdout : '',
        exitCode: typeof payload.exitCode === 'number' ? payload.exitCode : 0,
        stderr: typeof payload.stderr === 'string' ? payload.stderr : '',
      };
    case 'proc_spawn':
      return {
        pid: payload.childAgentId ?? payload.processId ?? payload.pid ?? null,
      };
    case 'proc_kill':
      return {
        success: payload.killed === true,
      };
    default:
      return payload;
  }
}

export function buildCanonicalToolError(tool: string, error: unknown): { status: number; body: Record<string, unknown> } {
  const normalizedTool = stripToolPrefix(tool);

  if (normalizedTool === 'mem_get' && error instanceof NotFoundError) {
    return {
      status: 200,
      body: {
        success: true,
        result: { value: null },
      },
    };
  }

  if (normalizedTool === 'fs_read' && error instanceof NotFoundError) {
    return {
      status: 404,
      body: {
        error: 'not_found',
        message: error.message,
      },
    };
  }

  if (normalizedTool === 'fs_stat' && error instanceof NotFoundError) {
    return {
      status: 404,
      body: {
        error: 'not_found',
        message: error.message,
        exists: false,
      },
    };
  }

  if (normalizedTool.startsWith('net_http_') && error instanceof SecurityError && error.message.toLowerCase().includes('ssrf')) {
    return {
      status: 400,
      body: {
        error: 'blocked',
        reason: 'ssrf',
        message: error.message,
      },
    };
  }

  const err = toErrorResponse(error);
  return {
    status: err.statusCode,
    body: {
      error: err,
      code: err.code,
      message: err.message,
    },
  };
}