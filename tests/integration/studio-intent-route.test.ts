import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAgentToken } from '../../src/auth/agent-identity.js';

const intentRouteMocks = vi.hoisted(() => ({
  callClaude: vi.fn(),
  tokenSet: vi.fn(),
  tokenGet: vi.fn(),
  tokenDel: vi.fn(),
  executeUniversalToolCall: vi.fn(),
  registerExternalAgent: vi.fn(),
}));

vi.mock('../../src/studio/planner.js', () => ({
  callClaude: intentRouteMocks.callClaude,
  tokenSet: intentRouteMocks.tokenSet,
  tokenGet: intentRouteMocks.tokenGet,
  tokenDel: intentRouteMocks.tokenDel,
  TOKEN_TTL_SECONDS: 1800,
}));

vi.mock('../../src/mcp/registry.js', () => ({
  executeUniversalToolCall: intentRouteMocks.executeUniversalToolCall,
}));

vi.mock('../../src/external-agents/service.js', () => ({
  registerExternalAgent: intentRouteMocks.registerExternalAgent,
}));

import { POST } from '../../app/api/studio/intent/route.js';

describe('POST /api/studio/intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    intentRouteMocks.tokenDel.mockResolvedValue(undefined);
  });

  it('redacts secret-like tool output before returning confirmed intent results', async () => {
    intentRouteMocks.tokenGet.mockResolvedValue(JSON.stringify({
      summary: 'Read memory',
      steps: [{ order: 1, tool: 'agentos.mem_get', input: { key: 'demo' }, description: 'Read memory' }],
      schedule: null,
      workflowName: 'Read memory',
      agentId: 'agent-1',
    }));
    intentRouteMocks.executeUniversalToolCall.mockResolvedValue('OPENAI_API_KEY=sk-live-secret-value');

    const token = createAgentToken('agent-1', { expiresIn: '1h' });
    const request = new NextRequest('http://localhost/api/studio/intent', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        confirm: true,
        confirmToken: 'confirm-token',
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.executed).toBe(true);
    expect(body.results[0].result).toBe('OPENAI_API_KEY=[redacted]');
    expect(String(body.answer)).toContain('[redacted]');
    expect(String(body.answer)).not.toContain('sk-live-secret-value');
  });
});
