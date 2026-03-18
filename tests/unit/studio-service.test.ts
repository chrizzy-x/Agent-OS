import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { mockSupabase, mockRedis } from '../setup.js';
import { PermissionError, ValidationError } from '../../src/utils/errors.js';

const studioMocks = vi.hoisted(() => ({
  listUniversalMcpTools: vi.fn(),
  executeUniversalToolCall: vi.fn(),
  runInstalledSkill: vi.fn(),
}));

vi.mock('../../src/mcp/registry.js', () => ({
  listUniversalMcpTools: studioMocks.listUniversalMcpTools,
  executeUniversalToolCall: studioMocks.executeUniversalToolCall,
}));

vi.mock('../../src/skills/service.js', () => ({
  runInstalledSkill: studioMocks.runInstalledSkill,
}));

import { executeStudioCommand, isMutatingStudioCommand, parseStudioCommand } from '../../src/studio/service.js';

function createSelectBuilder(data: unknown, error: unknown = null) {
  return {
    data,
    error,
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    limit() { return this; },
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

describe('studio service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    studioMocks.listUniversalMcpTools.mockResolvedValue([
      { name: 'agentos.mem_get', source: 'primitive' },
      { name: 'mcp.gmail.send_email', source: 'external' },
    ]);
    studioMocks.executeUniversalToolCall.mockResolvedValue({ ok: true });
    studioMocks.runInstalledSkill.mockResolvedValue({ result: { ok: true }, executionTimeMs: 42, stderr: '' });
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.get.mockReset();
    mockRedis.del.mockResolvedValue(1);
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'skill_installations') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          data: [{ id: 'install-1' }],
          error: null,
        };
      }

      if (table === 'skills') {
        return createSelectBuilder({
          id: 'skill-1',
          slug: 'pdf-processor',
          name: 'PDF Processor',
          category: 'Docs',
          description: 'Extract text from PDFs.',
          pricing_model: 'free',
          total_installs: 3,
          published: true,
        });
      }

      if (table === 'mcp_servers') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [{ name: 'gmail', description: 'Mail', category: 'Communication' }],
            error: null,
          }),
        };
      }

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        data: [],
        error: null,
      };
    });
  });

  it('parses supported guided commands', () => {
    expect(parseStudioCommand('help')).toEqual({ type: 'help' });
    expect(parseStudioCommand('agent status')).toEqual({ type: 'agent-status' });
    expect(parseStudioCommand('tool run agentos.mem_get --json {"key":"hello"}')).toEqual({
      type: 'tool-run',
      toolName: 'agentos.mem_get',
      input: { key: 'hello' },
    });
  });

  it('rejects shell syntax and unsupported commands', () => {
    expect(() => parseStudioCommand('tool run agentos.mem_get | cat')).toThrow(ValidationError);
    expect(() => parseStudioCommand('rm -rf /')).toThrow(ValidationError);
  });

  it('classifies guided reads as non-mutating and external actions as mutating', () => {
    expect(isMutatingStudioCommand(parseStudioCommand('tool run agentos.mem_get --json {"key":"hello"}'))).toBe(false);
    expect(isMutatingStudioCommand(parseStudioCommand('mcp call gmail send_email --json {"to":"a@example.com"}'))).toBe(true);
  });

  it('returns a preview first and consumes the confirm token exactly once for mutating commands', async () => {
    const preview = await executeStudioCommand({
      agentContext: { agentId: 'agent-1', allowedDomains: [], quotas: { storageQuotaBytes: 1, memoryQuotaBytes: 1, rateLimitPerMin: 1 } },
      command: 'skills install pdf-processor',
    });

    expect(preview.kind).toBe('preview');
    expect(preview.confirmToken).toBeTruthy();

    const payload = jwt.verify(preview.confirmToken!, process.env.JWT_SECRET!) as { hash: string };
    mockRedis.get.mockResolvedValueOnce(payload.hash).mockResolvedValueOnce(null);

    const result = await executeStudioCommand({
      agentContext: { agentId: 'agent-1', allowedDomains: [], quotas: { storageQuotaBytes: 1, memoryQuotaBytes: 1, rateLimitPerMin: 1 } },
      command: 'skills install pdf-processor',
      confirmToken: preview.confirmToken,
    });

    expect(result.kind).toBe('result');
    expect(result.summary).toContain('Installed');

    await expect(executeStudioCommand({
      agentContext: { agentId: 'agent-1', allowedDomains: [], quotas: { storageQuotaBytes: 1, memoryQuotaBytes: 1, rateLimitPerMin: 1 } },
      command: 'skills install pdf-processor',
      confirmToken: preview.confirmToken,
    })).rejects.toThrow(ValidationError);
  });

  it('requires advanced mode before sandbox commands can be previewed', async () => {
    await expect(executeStudioCommand({
      agentContext: { agentId: 'agent-1', allowedDomains: [], quotas: { storageQuotaBytes: 1, memoryQuotaBytes: 1, rateLimitPerMin: 1 } },
      command: 'advanced run python --code print("hello")',
    })).rejects.toThrow(PermissionError);
  });
});
