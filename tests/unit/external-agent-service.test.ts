import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertExternalAgentToolAccess,
  normalizeRequestedToolName,
  registerExternalAgent,
} from '../../src/external-agents/service.js';
import { mockSupabase } from '../setup.js';
import { PermissionError, ValidationError } from '../../src/utils/errors.js';

function maybeSingleBuilder(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
}

describe('external agent service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a new external agent with wildcard domains and default primitives', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });

    mockSupabase.from
      .mockReturnValueOnce(maybeSingleBuilder(null))
      .mockReturnValueOnce({ insert });

    const result = await registerExternalAgent({
      agentId: 'test-agent-1',
      name: 'Test Agent',
    });

    expect(result.agentId).toBe('test-agent-1');
    expect(result.token).toBeTruthy();
    expect(result.allowedDomains).toEqual(['*']);
    expect(result.allowedTools).toContain('agentos.mem_set');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      agent_id: 'test-agent-1',
      allowed_domains: ['*'],
    }));
  });

  it('rejects invalid agent IDs', async () => {
    await expect(registerExternalAgent({
      agentId: 'INVALID NAME!!',
      name: 'Broken',
    })).rejects.toThrow(ValidationError);
  });

  it('permits explicit and wildcard tool permissions for external agents', async () => {
    mockSupabase.from.mockReturnValue(maybeSingleBuilder({
      agent_id: 'test-agent-1',
      name: 'Test Agent',
      allowed_tools: ['agentos.mem_get', 'mcp.*'],
      allowed_domains: ['*'],
      status: 'active',
      total_calls: 0,
      last_active_at: null,
      created_at: '2026-03-22T00:00:00Z',
    }));

    await expect(assertExternalAgentToolAccess('test-agent-1', 'mem_get')).resolves.toBeUndefined();
    await expect(assertExternalAgentToolAccess('test-agent-1', 'mcp.gmail.send_email')).resolves.toBeUndefined();
    await expect(assertExternalAgentToolAccess('test-agent-1', 'agentos.mem_set')).rejects.toThrow(PermissionError);
  });

  it('normalizes legacy primitive aliases to universal tool names', () => {
    expect(normalizeRequestedToolName('mem_set')).toBe('agentos.mem_set');
    expect(normalizeRequestedToolName('mcp.gmail.send_email')).toBe('mcp.gmail.send_email');
  });
});

