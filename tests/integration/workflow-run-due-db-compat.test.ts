import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const routeMocks = vi.hoisted(() => ({
  requireRouteCapability: vi.fn(),
  createExecution: vi.fn(),
  updateExecution: vi.fn(),
  appendExecutionLog: vi.fn(),
  executeUniversalToolCall: vi.fn(),
  logOperation: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireRouteCapability: routeMocks.requireRouteCapability,
}));

vi.mock('../../src/storage/supabase.js', () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: routeMocks.from })),
  withSupabaseQueryTimeout: <T>(query: T) => query,
}));

vi.mock('../../src/execution/service.js', () => ({
  createExecution: routeMocks.createExecution,
  updateExecution: routeMocks.updateExecution,
  appendExecutionLog: routeMocks.appendExecutionLog,
}));

vi.mock('../../src/mcp/registry.js', () => ({
  executeUniversalToolCall: routeMocks.executeUniversalToolCall,
}));

vi.mock('../../src/runtime/audit.js', () => ({
  logOperation: routeMocks.logOperation,
}));

import { POST } from '../../app/api/agent/workflows/run-due/route.js';

describe('workflow run-due DB compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireRouteCapability.mockResolvedValue({ agentId: 'agent-1', tier: 'enterprise_plus', allowedDomains: [], quotas: {} });
    routeMocks.createExecution.mockResolvedValue({ id: 'execution-1' });
    routeMocks.updateExecution.mockResolvedValue({ id: 'execution-1' });
    routeMocks.appendExecutionLog.mockResolvedValue({ id: 'log-1' });
    routeMocks.executeUniversalToolCall.mockResolvedValue({ key: 'proof.key' });
    routeMocks.logOperation.mockResolvedValue('audit-1');
  });

  it('does not query UUID scheduled task workflow_id with prefixed Primeflow ids', async () => {
    const scheduledEq = vi.fn().mockReturnThis();
    routeMocks.from.mockImplementation((table: string) => {
      if (table === 'agent_workflows') {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'wf_12345678-1234-4234-9234-123456789abc',
              task_id: null,
              steps: [{ tool: 'agentos.mem_set', input: { key: 'proof.key', value: 'ok' } }],
              graph_state: { nodes: [], edges: [] },
              code_state: null,
              canonical_doc: null,
              schedule: null,
              status: 'active',
            },
            error: null,
          }),
        };
      }
      if (table === 'scheduled_tasks') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: scheduledEq,
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const response = await POST(new NextRequest('http://localhost/api/agent/workflows/run-due', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId: 'wf_12345678-1234-4234-9234-123456789abc', force: true }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ran).toBe(1);
    expect(scheduledEq).toHaveBeenCalledWith('agent_id', 'agent-1');
    expect(scheduledEq).not.toHaveBeenCalledWith('workflow_id', 'wf_12345678-1234-4234-9234-123456789abc');
  });
});
