import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAgentToken } from '../../src/auth/agent-identity.js';
import { mockSupabase } from '../setup.js';
import { GET } from '../../app/api/search/route.js';

function chain(data: unknown, error: unknown = null) {
  return {
    data,
    error,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: Array.isArray(data) ? data[0] ?? null : data, error }),
  };
}

describe('GET /api/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'agent_apps') {
        return chain([{
          id: 'app-1',
          workspace_id: 'workspace-1',
          name: 'Research Kit',
          slug: 'research-kit',
          category: 'Research',
          description: 'SDK research app',
          long_description: 'SDK research app',
          publisher_id: 'agent-enterprise',
          publisher_name: 'Publisher',
          app_url: 'https://apps.example.com/research-kit',
          repository_url: null,
          device_targets: ['AgentOS Cloud'],
          manifest: {
            schemaVersion: 'agentos.app.v1',
            version: '1.0.0',
            runtime: 'external-app',
            entrypoint: 'agentos://kernel/research-kit',
            commands: [],
            permissions: [],
            skills: [],
            requiredSecrets: [],
            primitives: [],
          },
          default_config: {},
          permissions_required: [],
          required_secrets: [],
          screenshots: [],
          publish_state: 'published',
          source: 'external_sdk',
          visibility: 'public',
          runtime_type: 'external-app',
          kernel_product: 'research-kit',
          kernel_command_topic: 'kernel.research.commands',
          kernel_status_topic: 'kernel.research.status',
          last_heartbeat_at: '2026-06-01T10:00:00Z',
          last_command_at: null,
          last_error: null,
          health_status: 'online',
          endpoint_status: 'healthy',
          disabled: false,
          heartbeat_count: 2,
          open_count: 4,
          web_open_count: 4,
          android_download_count: 0,
          ios_download_count: 0,
          install_count: 3,
          verified: false,
          published: true,
          created_at: '2026-06-01T10:00:00Z',
          updated_at: '2026-06-01T10:00:00Z',
        }]);
      }

      if (table === 'kernel_registry') {
        return chain([]);
      }

      if (table === 'mcp_servers') {
        return chain([{
          id: 'connector-1',
          name: 'gmail',
          description: 'Mail connector',
          category: 'Communication',
          tools: [{ name: 'send_email' }],
          active: true,
          created_at: '2026-06-01T10:00:00Z',
        }]);
      }

      if (table === 'workspace_members') {
        return chain([{
          workspaces: {
            id: 'workspace-1',
            name: 'Workspace',
            slug: 'workspace',
            owner_id: 'agent-enterprise',
            plan: 'enterprise_plus',
            created_at: '2026-06-01T09:00:00Z',
          },
        }]);
      }

      if (table === 'nl_studio_sessions') {
        return chain([{
          id: 'session-1',
          workspace_id: 'workspace-1',
          project_id: 'project-1',
          owner_agent_id: 'agent-enterprise',
          super_agent_id: 'super-1',
          title: 'Research session',
          status: 'active',
          state: {},
          created_at: '2026-06-01T09:00:00Z',
          updated_at: '2026-06-01T10:00:00Z',
        }]);
      }

      if (table === 'private_subagents') {
        return chain([{
          id: 'subagent-1',
          workspace_id: 'workspace-1',
          project_id: 'project-1',
          owner_agent_id: 'agent-enterprise',
          name: 'Research helper',
          description: 'Finds sources',
          instructions: '',
          status: 'active',
          created_at: '2026-06-01T09:00:00Z',
          updated_at: '2026-06-01T10:00:00Z',
        }]);
      }

      if (table === 'agent_workflows') {
        return chain([{
          id: 'workflow-1',
          name: 'Research flow',
          summary: 'Runs the research pipeline',
          status: 'active',
          workspace_id: 'workspace-1',
          project_id: 'project-1',
          created_at: '2026-06-01T09:00:00Z',
          updated_at: '2026-06-01T10:00:00Z',
        }]);
      }

      if (table === 'projects') {
        return chain([{
          id: 'project-1',
          workspace_id: 'workspace-1',
          owner_agent_id: 'agent-enterprise',
          name: 'Research Workspace',
          slug: 'research-workspace',
          description: 'Workspace research project',
          status: 'active',
          metadata: {},
          created_at: '2026-06-01T09:00:00Z',
          updated_at: '2026-06-01T10:00:00Z',
        }]);
      }

      if (table === 'ffp_chain_executions') {
        return chain([{
          id: 'route-1',
          chain_id: 'chain-agentos',
          tool: 'agentos.mem_get',
          status: 'success',
          error_message: null,
          executed_at: '2026-06-01T10:00:00Z',
        }]);
      }

      if (table === 'skills') {
        return chain([{
          id: 'skill-1',
          name: 'Research Notes',
          slug: 'research-notes',
          category: 'Research',
          description: 'Captures notes',
          published: true,
          created_at: '2026-06-01T09:00:00Z',
          updated_at: '2026-06-01T10:00:00Z',
        }]);
      }

      if (table === 'vaults') {
        return chain({
          id: 'vault-1',
          workspace_id: 'workspace-1',
          owner_agent_id: 'agent-enterprise',
          created_at: '2026-06-01T09:00:00Z',
        });
      }

      if (table === 'vault_secrets') {
        return chain([{
          id: 'secret-1',
          vault_id: 'vault-1',
          workspace_id: 'workspace-1',
          name: 'OPENAI_API_KEY',
          masked_value: 'sk-live-should-not-leak',
          status: 'active',
          version: 1,
          created_at: '2026-06-01T09:00:00Z',
          updated_at: '2026-06-01T10:00:00Z',
          last_accessed_at: null,
        }]);
      }

      return chain([]);
    });
  });

  it('returns grouped workspace results and only vault secret names', async () => {
    const token = createAgentToken('agent-enterprise', { expiresIn: '1h' });
    const response = await GET(new NextRequest('http://localhost/api/search?q=', {
      headers: { Authorization: `Bearer ${token}` },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.groups.vault[0].title).toBe('OPENAI_API_KEY');
    expect(Array.isArray(body.groups.subagent)).toBe(true);
    expect(body.groups.project[0].href).toBe('/projects/project-1');
    expect(body.groups.project[0].actionLabel).toBe('Open Project');
    expect(body.groups.connector[0].title).toBe('gmail');
    expect(body.groups.ffp_route[0].title).toContain('chain-agentos');
    expect(body.groups.ffp_primitive[0].title).toBe('MEM');
    expect(JSON.stringify(body)).not.toContain('sk-live-should-not-leak');
  });
});
