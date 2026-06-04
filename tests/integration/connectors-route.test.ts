import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAgentToken } from '../../src/auth/agent-identity.js';
import { mockSupabase } from '../setup.js';
import { GET } from '../../app/api/connectors/route.js';

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

describe('GET /api/connectors', () => {
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

      if (table === 'mcp_servers') {
        return chain([{
          id: 'server-1',
          name: 'gmail',
          description: 'Google Mail',
          category: 'Communication',
          tools: [{ name: 'send_email', description: 'Send email' }],
          requires_consensus: true,
          consensus_threshold: 2,
          active: true,
          icon: null,
          created_at: '2026-06-01T09:00:00Z',
        }]);
      }

      if (table === 'mcp_calls') {
        return chain([{
          mcp_server: 'gmail',
          tool_name: 'send_email',
          success: true,
          error_message: null,
          timestamp: new Date().toISOString(),
        }]);
      }

      if (table === 'skills') {
        return chain([{
          id: 'skill-1',
          name: 'Inbox Actions',
          slug: 'inbox-actions',
          description: 'Automates inbox tasks',
          author_id: 'agent-enterprise',
          published: true,
          updated_at: '2026-06-01T09:30:00Z',
          source_code: 'class Skill { run() { return "mcp.gmail.send_email"; } }',
          capabilities: [{ name: 'run' }],
          primitives_required: [],
        }]);
      }

      return chain([]);
    });
  });

  it('returns connector health and tool visibility', async () => {
    const token = createAgentToken('agent-enterprise', { expiresIn: '1h' });
    const response = await GET(new NextRequest('http://localhost/api/connectors', {
      headers: { Authorization: `Bearer ${token}` },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.connectors[0].slug).toBe('gmail');
    expect(body.connectors[0].toolCount).toBe(1);
    expect(body.connectors[0].healthStatus).toBe('active');
    expect(body.connectors[0].requiresConsensus).toBe(true);
    expect(body.connectors[0].usedBy.skills[0].name).toBe('Inbox Actions');
    expect(body.connectors[0].permissionScope.skills).toBe(true);
    expect(body.connectors[0].accessSummary).toContain('1 skill');
  });
});
