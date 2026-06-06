import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAgentToken } from '../../src/auth/agent-identity.js';
import { mockSupabase } from '../setup.js';
import { GET } from '../../app/api/dashboard/route.js';

function chain(data: unknown, error: unknown = null) {
  return {
    data,
    error,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: Array.isArray(data) ? data[0] ?? null : data, error }),
  };
}

describe('GET /api/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns retail-safe workspace data without enterprise leakage', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'agents') {
        return chain({
          id: 'agent-retail',
          name: 'Retail User',
          tier: 'retail_pro',
          metadata: { plan: 'retail_pro' },
          created_at: '2026-06-01T09:00:00Z',
        });
      }

      if (table === 'workspace_members') {
        return chain([{
          role: 'owner',
          workspaces: {
            id: 'workspace-1',
            name: 'Workspace',
            slug: 'workspace',
            owner_id: 'agent-retail',
            plan: 'retail_pro',
            created_at: '2026-06-01T09:00:00Z',
          },
        }]);
      }

      if (table === 'nl_studio_sessions') {
        return chain([{
          id: 'session-1',
          workspace_id: 'workspace-1',
          owner_agent_id: 'agent-retail',
          super_agent_id: 'super-1',
          title: 'Studio session',
          status: 'active',
          state: {},
          created_at: '2026-06-01T09:00:00Z',
          updated_at: '2026-06-01T10:00:00Z',
        }]);
      }

      if (table === 'app_installations') {
        return chain([{
          id: 'install-1',
          app_id: 'app-1',
          agent_id: 'agent-retail',
          workspace_id: 'workspace-1',
          status: 'active',
          favorite: true,
          permissions_approved: [],
          open_count: 2,
          last_opened_at: '2026-06-01T10:00:00Z',
          installed_at: '2026-06-01T09:00:00Z',
          updated_at: '2026-06-01T10:00:00Z',
        }]);
      }

      if (table === 'agent_apps') {
        return chain([{
          id: 'app-1',
          workspace_id: 'workspace-1',
          name: 'Research Kit',
          slug: 'research-kit',
          category: 'Research',
          description: 'SDK research app',
          long_description: 'SDK research app',
          publisher_id: 'agent-retail',
          publisher_name: 'Retail User',
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
          created_at: '2026-06-01T09:00:00Z',
          updated_at: '2026-06-01T10:00:00Z',
        }]);
      }

      if (table === 'private_subagents') {
        return chain([{
          id: 'subagent-1',
          workspace_id: 'workspace-1',
          owner_agent_id: 'agent-retail',
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
          last_run_at: '2026-06-01T10:00:00Z',
          last_error: null,
          updated_at: '2026-06-01T10:00:00Z',
          created_at: '2026-06-01T09:00:00Z',
        }]);
      }

      if (table === 'skill_installations') {
        return chain([{
          id: 'skill-install-1',
          installed_at: '2026-06-01T09:00:00Z',
          skill: {
            id: 'skill-1',
            name: 'Research Notes',
            slug: 'research-notes',
            category: 'Research',
            description: 'Captures notes',
          },
        }]);
      }

      if (table === 'nl_studio_events') {
        return chain([{
          id: 'event-1',
          session_id: 'session-1',
          type: 'task_completed',
          payload: { workflowId: 'workflow-1' },
          created_at: '2026-06-01T10:00:00Z',
        }]);
      }

      if (table === 'vaults') {
        return chain({
          id: 'vault-1',
          workspace_id: 'workspace-1',
          owner_agent_id: 'agent-retail',
          created_at: '2026-06-01T09:00:00Z',
        });
      }

      if (table === 'vault_secrets') {
        return chain([{
          id: 'secret-1',
          vault_id: 'vault-1',
          workspace_id: 'workspace-1',
          name: 'OPENAI_API_KEY',
          masked_value: '****1234',
          status: 'active',
          version: 1,
          created_at: '2026-06-01T09:00:00Z',
          updated_at: '2026-06-01T10:00:00Z',
          last_accessed_at: null,
        }]);
      }

      return chain([]);
    });

    const token = createAgentToken('agent-retail', { expiresIn: '1h' });
    const response = await GET(new NextRequest('http://localhost/api/dashboard', {
      headers: { Authorization: `Bearer ${token}` },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.installedApps).toBe(1);
    expect(body.summary.mcpConnectors).toBe(0);
    expect(body.sdkApps).toEqual([]);
    expect(body.ffp).toBeNull();
    expect(body.subagents).toBeUndefined();
    expect(body.vault.names).toBeUndefined();
  });
});
