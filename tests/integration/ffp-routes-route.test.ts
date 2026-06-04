import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAgentToken } from '../../src/auth/agent-identity.js';
import { mockSupabase } from '../setup.js';
import { GET } from '../../app/api/ffp/routes/route.js';

function chain(data: unknown, error: unknown = null) {
  return {
    data,
    error,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: Array.isArray(data) ? data[0] ?? null : data, error }),
  };
}

describe('GET /api/ffp/routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'agents') {
        return chain({
          id: 'agent-enterprise',
          name: 'Enterprise',
          tier: 'enterprise_plus',
          metadata: { plan: 'enterprise_plus' },
          created_at: '2026-06-01T09:00:00Z',
        });
      }

      if (table === 'ffp_chain_executions') {
        return chain([{
          id: 'exec-1',
          chain_id: 'chain-agentos',
          proposal_id: 'proposal-1',
          tool: 'agentos.mem_get',
          input: { key: 'hello' },
          result: { value: 'world' },
          status: 'success',
          error_message: null,
          consensus_threshold: 2,
          validator_count: 3,
          input_hash: 'hash-1',
          executed_at: '2026-06-01T10:00:00Z',
        }]);
      }

      if (table === 'agent_apps') {
        return chain([{
          id: 'app-1',
          name: 'Memory Console',
          slug: 'memory-console',
          workspace_id: 'workspace-1',
          publisher_id: 'agent-enterprise',
          published: true,
          updated_at: '2026-06-01T09:15:00Z',
          manifest: { primitives: ['mem.*'] },
          default_config: {},
          permissions_required: [],
          runtime_type: 'agentos-app',
          kernel_product: null,
        }]);
      }

      if (table === 'agent_workflows') {
        return chain([{
          id: 'workflow-1',
          name: 'Cache lookup',
          summary: 'Reads memory',
          updated_at: '2026-06-01T09:20:00Z',
          steps: [{ order: 1, tool: 'agentos.mem_get', description: 'Read', input: { key: 'hello' } }],
          graph_state: null,
          code_state: null,
          canonical_doc: null,
        }]);
      }

      if (table === 'skills') {
        return chain([{
          id: 'skill-1',
          name: 'Memory Helper',
          slug: 'memory-helper',
          description: 'Reads memory',
          author_id: 'agent-enterprise',
          published: true,
          updated_at: '2026-06-01T09:25:00Z',
          source_code: 'class Skill { run() { return "ok"; } }',
          capabilities: [{ name: 'run' }],
          primitives_required: ['mem.*'],
        }]);
      }

      return chain([]);
    });
  });

  it('returns route and primitive inspection data', async () => {
    const token = createAgentToken('agent-enterprise', { expiresIn: '1h' });
    const response = await GET(new NextRequest('http://localhost/api/ffp/routes', {
      headers: { Authorization: `Bearer ${token}` },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.routes[0].id).toBe('exec-1');
    expect(body.routes[0].primitive).toBe('mem');
    expect(body.routes[0].invokedByType).toBe('ffp_chain');
    expect(body.routes[0].related.apps[0].name).toBe('Memory Console');
    expect(body.routes[0].related.workflows[0].name).toBe('Cache lookup');
    expect(body.routes[0].related.skills[0].name).toBe('Memory Helper');
    expect(body.primitives[0].primitive).toBe('mem');
    expect(body.primitives[0].executions).toBe(1);
  });
});
