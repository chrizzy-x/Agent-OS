import { MCPRouter } from '../../lib/mcp-router.js';
import { runInstalledSkill } from '../skills/service.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { TOOLS, type ToolHandler } from '../tools.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import type { AgentContext } from '../auth/permissions.js';

export type StandardToolDefinition = {
  name: string;
  title: string;
  description: string;
  server: string;
  source: 'primitive' | 'skill' | 'external';
  category: string;
  aliases: string[];
  requires_consensus: boolean;
  consensus_threshold: number | null;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
};

type PrimitiveMetadata = {
  description: string;
  inputSchema: Record<string, unknown>;
};

type ExternalServerRow = {
  name: string;
  description: string | null;
  requires_consensus: boolean | null;
  consensus_threshold: number | null;
  tools: unknown;
};

type SkillRow = {
  slug: string;
  name: string;
  description: string | null;
  capabilities: unknown;
};

type SkillCapability = { name?: string; description?: string };

type NormalizedToolCall =
  | { kind: 'primitive'; toolName: string }
  | { kind: 'skill'; skillSlug: string; capability: string }
  | { kind: 'external'; server: string; toolName: string };

const router = new MCPRouter();

const genericOutputSchema = {
  type: 'object',
  additionalProperties: true,
  description: 'Tool-specific JSON result payload.',
};

function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
  description?: string,
): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: true,
    ...(description ? { description } : {}),
    properties,
    required,
  };
}

const primitiveMetadata: Record<string, PrimitiveMetadata> = {
  mem_set: {
    description: 'Store a JSON value under a key with an optional TTL.',
    inputSchema: objectSchema({ key: { type: 'string' }, value: {}, ttl: { type: 'number', minimum: 1 } }, ['key', 'value']),
  },
  mem_get: {
    description: 'Read a JSON value from memory by key.',
    inputSchema: objectSchema({ key: { type: 'string' } }, ['key']),
  },
  mem_delete: {
    description: 'Delete a memory key.',
    inputSchema: objectSchema({ key: { type: 'string' } }, ['key']),
  },
  mem_list: {
    description: 'List memory keys by prefix.',
    inputSchema: objectSchema({ prefix: { type: 'string' } }),
  },
  mem_incr: {
    description: 'Atomically increment a numeric memory key.',
    inputSchema: objectSchema({ key: { type: 'string' }, amount: { type: 'number' } }, ['key']),
  },
  mem_expire: {
    description: 'Set or update the TTL for a memory key.',
    inputSchema: objectSchema({ key: { type: 'string' }, seconds: { type: 'number', minimum: 1 } }, ['key', 'seconds']),
  },
  fs_write: {
    description: 'Write a file into the agent filesystem.',
    inputSchema: objectSchema({ path: { type: 'string' }, content: { type: 'string' } }, ['path', 'content']),
  },
  fs_read: {
    description: 'Read a file from the agent filesystem.',
    inputSchema: objectSchema({ path: { type: 'string' } }, ['path']),
  },
  fs_list: {
    description: 'List files and directories under a path.',
    inputSchema: objectSchema({ path: { type: 'string' } }),
  },
  fs_delete: {
    description: 'Delete a file from the agent filesystem.',
    inputSchema: objectSchema({ path: { type: 'string' } }, ['path']),
  },
  fs_mkdir: {
    description: 'Create a directory in the agent filesystem.',
    inputSchema: objectSchema({ path: { type: 'string' } }, ['path']),
  },
  fs_stat: {
    description: 'Read metadata for a file or directory.',
    inputSchema: objectSchema({ path: { type: 'string' } }, ['path']),
  },
  db_query: {
    description: 'Run a parameterized SQL query in the agent schema.',
    inputSchema: objectSchema({ sql: { type: 'string' }, params: { type: 'array' } }, ['sql']),
  },
  db_transaction: {
    description: 'Run multiple parameterized SQL statements atomically.',
    inputSchema: objectSchema({ queries: { type: 'array', items: objectSchema({ sql: { type: 'string' }, params: { type: 'array' } }, ['sql']) } }, ['queries']),
  },
  db_create_table: {
    description: 'Create a table in the agent schema.',
    inputSchema: objectSchema({ table: { type: 'string' }, schema: { type: 'array', items: objectSchema({ column: { type: 'string' }, type: { type: 'string' } }, ['column', 'type']) } }, ['table', 'schema']),
  },
  db_insert: {
    description: 'Insert a row into a table in the agent schema.',
    inputSchema: objectSchema({ table: { type: 'string' }, row: { type: 'object' } }, ['table', 'row']),
  },
  db_update: {
    description: 'Update rows in a table in the agent schema.',
    inputSchema: objectSchema({ table: { type: 'string' }, values: { type: 'object' }, where: { type: 'object' } }, ['table', 'values', 'where']),
  },
  db_delete: {
    description: 'Delete rows in a table in the agent schema.',
    inputSchema: objectSchema({ table: { type: 'string' }, where: { type: 'object' } }, ['table', 'where']),
  },
  net_http_get: {
    description: 'Send an outbound HTTP GET request with SSRF protection.',
    inputSchema: objectSchema({ url: { type: 'string' }, headers: { type: 'object' } }, ['url']),
  },
  net_http_post: {
    description: 'Send an outbound HTTP POST request with SSRF protection.',
    inputSchema: objectSchema({ url: { type: 'string' }, headers: { type: 'object' }, body: {} }, ['url']),
  },
  net_http_put: {
    description: 'Send an outbound HTTP PUT request with SSRF protection.',
    inputSchema: objectSchema({ url: { type: 'string' }, headers: { type: 'object' }, body: {} }, ['url']),
  },
  net_http_delete: {
    description: 'Send an outbound HTTP DELETE request with SSRF protection.',
    inputSchema: objectSchema({ url: { type: 'string' }, headers: { type: 'object' } }, ['url']),
  },
  net_dns_resolve: {
    description: 'Resolve a hostname to IP addresses.',
    inputSchema: objectSchema({ hostname: { type: 'string' } }, ['hostname']),
  },
  events_publish: {
    description: 'Publish a message to a topic.',
    inputSchema: objectSchema({ topic: { type: 'string' }, payload: {} }, ['topic', 'payload']),
  },
  events_subscribe: {
    description: 'Read recent messages from a topic subscription.',
    inputSchema: objectSchema({ topic: { type: 'string' }, limit: { type: 'number', minimum: 1 } }, ['topic']),
  },
  events_unsubscribe: {
    description: 'Remove a topic subscription.',
    inputSchema: objectSchema({ topic: { type: 'string' } }, ['topic']),
  },
  events_list_topics: {
    description: 'List topics that have recent events.',
    inputSchema: objectSchema({ prefix: { type: 'string' } }),
  },
  proc_execute: {
    description: 'Execute JavaScript, Python, or Bash in the isolated runtime sandbox.',
    inputSchema: objectSchema({ code: { type: 'string' }, language: { type: 'string', enum: ['javascript', 'python', 'bash'] }, timeoutMs: { type: 'number', minimum: 1 } }, ['code', 'language']),
  },
  proc_schedule: {
    description: 'Register a scheduled task in the process runtime.',
    inputSchema: objectSchema({ name: { type: 'string' }, schedule: { type: 'string' }, code: { type: 'string' }, language: { type: 'string', enum: ['javascript', 'python', 'bash'] } }, ['name', 'schedule', 'code', 'language']),
  },
  proc_spawn: {
    description: 'Spawn a child agent process with isolated credentials.',
    inputSchema: objectSchema({ agentId: { type: 'string' }, task: {} }, ['agentId']),
  },
  proc_kill: {
    description: 'Stop a running or scheduled process.',
    inputSchema: objectSchema({ processId: { type: 'string' } }, ['processId']),
  },
  proc_list: {
    description: 'List running and scheduled processes.',
    inputSchema: objectSchema({ includeCompleted: { type: 'boolean' } }),
  },
};

function humanizeToolName(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function inferCategory(toolName: string): string {
  const prefix = toolName.split('_')[0] ?? 'misc';
  return prefix === 'proc' ? 'Process' : prefix.toUpperCase();
}

function getPrimitiveMetadata(toolName: string): PrimitiveMetadata {
  return primitiveMetadata[toolName] ?? {
    description: `Execute the ${humanizeToolName(toolName)} primitive through the Agent OS runtime.`,
    inputSchema: objectSchema({}, [], 'Tool-specific arguments. Future primitives are exposed here automatically.'),
  };
}

function normalizeCapabilityName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseSkillCapabilities(raw: unknown): SkillCapability[] {
  return Array.isArray(raw) ? raw as SkillCapability[] : [];
}

function parseExternalTools(raw: unknown): Array<Record<string, unknown>> {
  return Array.isArray(raw)
    ? raw.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

export function buildPrimitiveToolCatalog(): StandardToolDefinition[] {
  return Object.keys(TOOLS)
    .sort((left, right) => left.localeCompare(right))
    .map(toolName => {
      const metadata = getPrimitiveMetadata(toolName);
      return {
        name: `agentos.${toolName}`,
        title: humanizeToolName(toolName),
        description: metadata.description,
        server: 'agentos',
        source: 'primitive',
        category: inferCategory(toolName),
        aliases: [toolName],
        requires_consensus: false,
        consensus_threshold: null,
        inputSchema: metadata.inputSchema,
        outputSchema: genericOutputSchema,
        input_schema: metadata.inputSchema,
        output_schema: genericOutputSchema,
      };
    });
}

export async function buildSkillToolCatalog(): Promise<StandardToolDefinition[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('skills')
    .select('slug,name,description,capabilities')
    .eq('published', true)
    .order('name', { ascending: true });

  return ((data ?? []) as SkillRow[]).flatMap(skill => {
    return parseSkillCapabilities(skill.capabilities)
      .filter(capability => typeof capability?.name === 'string' && capability.name.trim().length > 0)
      .map(capability => {
        const capabilityName = normalizeCapabilityName(capability.name as string);
        const description = capability.description?.trim() || skill.description?.trim() || `Execute ${skill.name} capability ${capabilityName}.`;
        const inputSchema = objectSchema({ params: { type: 'object', additionalProperties: true } }, [], 'Capability parameters for installed skill execution.');

        return {
          name: `agentos.skill.${skill.slug}.${capabilityName}`,
          title: `${skill.name} / ${capabilityName}`,
          description,
          server: 'agentos',
          source: 'skill',
          category: 'Skills',
          aliases: [`skill.${skill.slug}.${capabilityName}`],
          requires_consensus: false,
          consensus_threshold: null,
          inputSchema,
          outputSchema: genericOutputSchema,
          input_schema: inputSchema,
          output_schema: genericOutputSchema,
        };
      });
  });
}

export async function buildExternalToolCatalog(): Promise<StandardToolDefinition[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('mcp_servers')
    .select('name,description,requires_consensus,consensus_threshold,tools')
    .eq('active', true)
    .order('name', { ascending: true });

  return ((data ?? []) as ExternalServerRow[]).flatMap(server => {
    return parseExternalTools(server.tools).map(tool => {
      const rawName = typeof tool.name === 'string' ? tool.name : 'tool';
      const description = typeof tool.description === 'string' && tool.description.trim().length > 0
        ? tool.description
        : server.description || `Call ${rawName} on the ${server.name} MCP server.`;
      const inputSchema = (tool.inputSchema && typeof tool.inputSchema === 'object'
        ? tool.inputSchema
        : tool.input_schema && typeof tool.input_schema === 'object'
          ? tool.input_schema
          : objectSchema({}, [], 'Tool-specific arguments.')) as Record<string, unknown>;

      return {
        name: `mcp.${server.name}.${rawName}`,
        title: `${server.name} / ${rawName}`,
        description,
        server: server.name,
        source: 'external',
        category: 'External MCP',
        aliases: [rawName],
        requires_consensus: Boolean(server.requires_consensus),
        consensus_threshold: server.consensus_threshold ?? null,
        inputSchema,
        outputSchema: genericOutputSchema,
        input_schema: inputSchema,
        output_schema: genericOutputSchema,
      };
    });
  });
}

export async function listUniversalMcpTools(): Promise<StandardToolDefinition[]> {
  const [primitives, skills, external] = await Promise.all([
    Promise.resolve(buildPrimitiveToolCatalog()),
    buildSkillToolCatalog(),
    buildExternalToolCatalog(),
  ]);

  const ordered = [...primitives, ...skills, ...external].sort((left, right) => left.name.localeCompare(right.name));
  const unique = new Map<string, StandardToolDefinition>();
  for (const tool of ordered) {
    if (!unique.has(tool.name)) {
      unique.set(tool.name, tool);
    }
  }

  return [...unique.values()];
}

function normalizeToolCall(params: { name: string; server?: string }): NormalizedToolCall {
  const toolName = params.name.trim();
  const server = params.server?.trim();

  if (!toolName) {
    throw new ValidationError('Tool name is required');
  }

  if (toolName.startsWith('agentos.skill.')) {
    const parts = toolName.split('.');
    if (parts.length < 4) {
      throw new ValidationError(`Invalid skill tool '${toolName}'`);
    }

    return { kind: 'skill', skillSlug: parts[2], capability: parts.slice(3).join('.') };
  }

  if (toolName.startsWith('agentos.')) {
    const primitiveName = toolName.slice('agentos.'.length);
    if (primitiveName in TOOLS) {
      return { kind: 'primitive', toolName: primitiveName };
    }
  }

  if (toolName.startsWith('mcp.')) {
    const parts = toolName.split('.');
    if (parts.length < 3) {
      throw new ValidationError(`Invalid external MCP tool '${toolName}'`);
    }

    return { kind: 'external', server: parts[1], toolName: parts.slice(2).join('.') };
  }

  if (toolName in TOOLS) {
    return { kind: 'primitive', toolName };
  }

  if (toolName.startsWith('skill.')) {
    const parts = toolName.split('.');
    if (parts.length >= 3) {
      return { kind: 'skill', skillSlug: parts[1], capability: parts.slice(2).join('.') };
    }
  }

  if (server && server !== 'agentos') {
    return { kind: 'external', server, toolName };
  }

  throw new NotFoundError(`Unknown tool '${toolName}'`);
}

export async function executeUniversalToolCall(params: {
  agentContext: AgentContext;
  name: string;
  server?: string;
  arguments?: Record<string, unknown>;
}): Promise<unknown> {
  const normalized = normalizeToolCall({ name: params.name, server: params.server });
  const input = params.arguments ?? {};

  if (normalized.kind === 'primitive') {
    const handler = TOOLS[normalized.toolName] as ToolHandler | undefined;
    if (!handler) {
      throw new NotFoundError(`Unknown primitive tool '${normalized.toolName}'`);
    }
    return handler(params.agentContext, input);
  }

  if (normalized.kind === 'skill') {
    const execution = await runInstalledSkill({
      agentId: params.agentContext.agentId,
      skillSlug: normalized.skillSlug,
      capability: normalized.capability,
      input: 'params' in input && typeof input.params === 'object' && input.params !== null ? input.params : input,
    });

    return {
      result: execution.result,
      execution_time_ms: execution.executionTimeMs,
      stderr: execution.stderr,
    };
  }

  return router.routeMCPCall({
    agentId: params.agentContext.agentId,
    server: normalized.server,
    tool: normalized.toolName,
    arguments: input,
  });
}

