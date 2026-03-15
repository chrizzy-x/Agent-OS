import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';
import {
  buildPrimitiveToolCatalog,
  listUniversalMcpTools,
} from '../../src/mcp/registry.js';
import { NotFoundError } from '../../src/utils/errors.js';
import { executeUniversalToolCall } from '../../src/mcp/registry.js';

function createQueryResult(data: unknown) {
  return {
    data,
    error: null,
    select() { return this; },
    eq() { return this; },
    order() { return this; },
  };
}

describe('universal MCP registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'skills') {
        return createQueryResult([
          {
            slug: 'pdf-processor',
            name: 'PDF Processor',
            description: 'Extract text from PDF files.',
            capabilities: [{ name: 'read_pdf', description: 'Read a PDF file' }],
          },
        ]);
      }

      if (table === 'mcp_servers') {
        return createQueryResult([
          {
            name: 'gmail',
            description: 'Send and read Gmail emails',
            requires_consensus: true,
            consensus_threshold: 0.67,
            tools: [{ name: 'send_email', description: 'Send an email', input_schema: { type: 'object' } }],
          },
        ]);
      }

      return createQueryResult([]);
    });
  });

  it('publishes standardized primitive tool names with legacy aliases', () => {
    const tools = buildPrimitiveToolCatalog();
    const memSet = tools.find(tool => tool.name === 'agentos.mem_set');
    expect(memSet).toBeDefined();
    expect(memSet?.aliases).toContain('mem_set');
  });

  it('merges primitive, skill, and external tool catalogs into one registry', async () => {
    const tools = await listUniversalMcpTools();
    expect(tools.some(tool => tool.name === 'agentos.mem_set')).toBe(true);
    expect(tools.some(tool => tool.name === 'agentos.skill.pdf-processor.read_pdf')).toBe(true);
    expect(tools.some(tool => tool.name === 'mcp.gmail.send_email')).toBe(true);
  });

  it('rejects unknown tool identifiers before dispatch', async () => {
    await expect(executeUniversalToolCall({
      agentContext: {
        agentId: 'agent-test',
        allowedDomains: [],
        quotas: {
          storageQuotaBytes: 1,
          memoryQuotaBytes: 1,
          rateLimitPerMin: 1,
        },
      },
      name: 'agentos.unknown_tool',
      arguments: {},
    })).rejects.toThrow(NotFoundError);
  });
});
