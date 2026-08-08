import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '../setup.js';
import { PermissionError } from '../../src/utils/errors.js';

const serviceMocks = vi.hoisted(() => ({
  assertWorkspaceMembership: vi.fn(),
  logSuperAgentAudit: vi.fn(),
  supabaseRestRows: vi.fn(),
}));

vi.mock('../../src/workspaces/service.js', () => ({
  assertWorkspaceMembership: serviceMocks.assertWorkspaceMembership,
}));

vi.mock('../../src/audit/super-agent.js', () => ({
  logSuperAgentAudit: serviceMocks.logSuperAgentAudit,
}));

vi.mock('../../src/storage/supabase-rest.js', () => ({
  supabaseRestRows: serviceMocks.supabaseRestRows,
}));

import {
  assertIntelligenceConnectionAccess,
  createIntelligenceConnection,
  getStudioSessionIntelligence,
  listIntelligenceConnections,
  recordIntelligenceInvocation,
  setIntelligenceDefault,
  setStudioSessionIntelligence,
} from '../../src/intelligence/service.js';

function maybeSingleBuilder(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
}

function insertBuilder(capture: (row: Record<string, unknown>) => void) {
  return {
    insert: vi.fn((row: Record<string, unknown>) => {
      capture(row);
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: row, error: null }),
        }),
      };
    }),
  };
}

function upsertBuilder(capture: (row: Record<string, unknown>) => void) {
  return {
    upsert: vi.fn((row: Record<string, unknown>) => {
      capture(row);
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: row, error: null }),
        }),
      };
    }),
  };
}

function updateBuilder(capture: (row: Record<string, unknown>) => void, data?: Record<string, unknown>) {
  return {
    update: vi.fn((row: Record<string, unknown>) => {
      capture(row);
      return {
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: data ?? row, error: null }),
        }),
      };
    }),
  };
}

function listBuilder(data: Record<string, unknown>[]) {
  return {
    data,
    error: null,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
  };
}

describe('intelligence service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.assertWorkspaceMembership.mockResolvedValue({
      workspace: { id: 'workspace-1' },
      role: 'owner',
    });
    serviceMocks.logSuperAgentAudit.mockResolvedValue('audit-1');
  });

  it('creates a connection only after validating the owned workspace Vault secret', async () => {
    let inserted: Record<string, unknown> | null = null;
    const vaultLookup = maybeSingleBuilder({
      id: 'secret-1',
      vault_id: 'vault-1',
      workspace_id: 'workspace-1',
      owner_agent_id: 'agent-1',
      name: 'OPENAI_KEY',
      status: 'active',
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'vault_secrets') return vaultLookup;
      if (table === 'intelligence_connections') return insertBuilder(row => { inserted = row; });
      throw new Error(`unexpected table ${table}`);
    });

    const connection = await createIntelligenceConnection({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      vaultSecretId: 'secret-1',
      vendor: 'openai',
      displayName: 'OpenAI Production',
      selectedModelId: 'gpt-5',
      availableModels: ['gpt-5'],
      status: 'active',
    });

    expect(serviceMocks.assertWorkspaceMembership).toHaveBeenCalledWith('workspace-1', 'agent-1');
    expect(vaultLookup.select).toHaveBeenCalledWith('id,vault_id,workspace_id,owner_agent_id,name,status');
    expect(inserted).toMatchObject({
      owner_agent_id: 'agent-1',
      workspace_id: 'workspace-1',
      vault_secret_id: 'secret-1',
      vendor: 'openai',
      selected_model_id: 'gpt-5',
      status: 'active',
    });
    expect(JSON.stringify(inserted)).not.toContain('encrypted_value');
    expect(connection.vaultSecretId).toBe('secret-1');
    expect(serviceMocks.logSuperAgentAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'intelligence.connection_created',
      success: true,
    }));
  });

  it('rejects a connection when the Vault secret is missing or disabled', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'vault_secrets') return maybeSingleBuilder(null);
      throw new Error(`unexpected table ${table}`);
    });

    await expect(createIntelligenceConnection({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      vaultSecretId: 'missing-secret',
      vendor: 'anthropic',
      displayName: 'Anthropic Production',
      selectedModelId: 'claude-opus-4-1',
    })).rejects.toThrow(PermissionError);
  });

  it('lists owner-scoped connections before relying on workspace membership repair', async () => {
    const connections = listBuilder([
      {
        id: 'connection-1',
        owner_agent_id: 'agent-1',
        workspace_id: 'workspace-1',
        vault_secret_id: 'secret-1',
        vendor: 'openai',
        display_name: 'OpenAI Production',
        status: 'active',
        selected_model_id: 'gpt-5-mini',
        available_models: ['gpt-5-mini'],
        capabilities: {},
        health: {},
      },
    ]);
    serviceMocks.supabaseRestRows.mockRejectedValue(new Error('rest unavailable'));
    serviceMocks.assertWorkspaceMembership.mockRejectedValue(new PermissionError('Workspace not found or not accessible'));
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'intelligence_connections') return connections;
      throw new Error(`unexpected table ${table}`);
    });

    const result = await listIntelligenceConnections({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      includeRevoked: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0].selectedModelId).toBe('gpt-5-mini');
    expect(serviceMocks.assertWorkspaceMembership).not.toHaveBeenCalled();
  });

  it('lists Supabase REST connection rows before using the primary client', async () => {
    serviceMocks.supabaseRestRows.mockResolvedValue([
      {
        id: 'connection-1',
        owner_agent_id: 'agent-1',
        workspace_id: 'workspace-1',
        vault_secret_id: 'secret-1',
        vendor: 'openai',
        display_name: 'OpenAI Production',
        status: 'active',
        selected_model_id: 'gpt-5-mini',
        available_models: ['gpt-5-mini'],
        capabilities: {},
        health: {},
      },
    ]);
    const result = await listIntelligenceConnections({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
    });

    expect(result[0].selectedModelId).toBe('gpt-5-mini');
    expect(serviceMocks.supabaseRestRows).toHaveBeenCalledWith('intelligence_connections', expect.objectContaining({
      owner_agent_id: 'eq.agent-1',
      workspace_id: 'eq.workspace-1',
      status: 'neq.revoked',
      order: 'updated_at.desc',
    }), expect.any(Number));
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('validates connection access through Supabase REST before using the primary client', async () => {
    serviceMocks.supabaseRestRows.mockResolvedValue([
      {
        id: 'connection-1',
        owner_agent_id: 'agent-1',
        workspace_id: 'workspace-1',
        vault_secret_id: 'secret-1',
        vendor: 'openai',
        display_name: 'OpenAI',
        status: 'active',
        selected_model_id: 'gpt-5',
        available_models: ['gpt-5'],
        capabilities: {},
        health: {},
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const connection = await assertIntelligenceConnectionAccess({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      connectionId: 'connection-1',
      requireActive: true,
    });

    expect(connection.id).toBe('connection-1');
    expect(serviceMocks.supabaseRestRows).toHaveBeenCalledWith('intelligence_connections', expect.objectContaining({
      id: 'eq.connection-1',
      owner_agent_id: 'eq.agent-1',
      workspace_id: 'eq.workspace-1',
      limit: '1',
    }), expect.any(Number));
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('persists session selection only for an owned active connection in the same workspace', async () => {
    let storedSelection: Record<string, unknown> | null = null;
    let sessionPatch: Record<string, unknown> | null = null;

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'nl_studio_sessions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'session-1', workspace_id: 'workspace-1', owner_agent_id: 'agent-1' },
            error: null,
          }),
          update: vi.fn((row: Record<string, unknown>) => {
            sessionPatch = row;
            return { eq: vi.fn().mockReturnThis() };
          }),
        };
      }
      if (table === 'intelligence_connections') {
        return maybeSingleBuilder({
          id: 'connection-1',
          owner_agent_id: 'agent-1',
          workspace_id: 'workspace-1',
          vault_secret_id: 'secret-1',
          vendor: 'gemini',
          display_name: 'Gemini Production',
          status: 'active',
          selected_model_id: 'gemini-2.5-pro',
          available_models: ['gemini-2.5-pro'],
          capabilities: {},
          health: {},
        });
      }
      if (table === 'studio_session_intelligence') {
        return upsertBuilder(row => { storedSelection = row; });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await setStudioSessionIntelligence({
      ownerAgentId: 'agent-1',
      sessionId: 'session-1',
      selection: {
        mode: 'single',
        connectionId: 'connection-1',
        modelId: 'gemini-2.5-pro',
        consensusConfigurationId: null,
        selectionSource: 'session',
      },
    });

    expect(storedSelection).toMatchObject({
      session_id: 'session-1',
      owner_agent_id: 'agent-1',
      workspace_id: 'workspace-1',
      mode: 'single',
      connection_id: 'connection-1',
      model_id: 'gemini-2.5-pro',
      selection_source: 'session',
    });
    expect(sessionPatch?.intelligence_selection).toMatchObject({
      mode: 'single',
      connectionId: 'connection-1',
      modelId: 'gemini-2.5-pro',
    });
    expect(result.selection.mode).toBe('single');
  });

  it('loads session intelligence after recovering session ownership through Supabase REST', async () => {
    serviceMocks.supabaseRestRows.mockResolvedValueOnce([
      {
        id: 'session-1',
        workspace_id: 'workspace-1',
        owner_agent_id: 'agent-1',
        state: {},
        created_at: '2026-08-08T00:00:00Z',
        updated_at: '2026-08-08T00:00:00Z',
      },
    ]);

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'nl_studio_sessions') {
        return maybeSingleBuilder(null, { message: 'timeout' });
      }
      if (table === 'studio_session_intelligence') {
        return maybeSingleBuilder({
          session_id: 'session-1',
          owner_agent_id: 'agent-1',
          workspace_id: 'workspace-1',
          mode: 'single',
          connection_id: 'connection-1',
          model_id: 'gpt-5-mini',
          consensus_configuration_id: null,
          selection_source: 'session',
          created_at: '2026-08-08T00:00:00Z',
          updated_at: '2026-08-08T00:00:00Z',
        });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await getStudioSessionIntelligence({
      ownerAgentId: 'agent-1',
      sessionId: 'session-1',
    });

    expect(result.selection).toMatchObject({
      mode: 'single',
      connectionId: 'connection-1',
      modelId: 'gpt-5-mini',
    });
    expect(serviceMocks.supabaseRestRows).toHaveBeenCalledWith('nl_studio_sessions', expect.objectContaining({
      id: 'eq.session-1',
      owner_agent_id: 'eq.agent-1',
      deleted_at: 'is.null',
    }), expect.any(Number));
  });

  it('updates workspace defaults through lookup then update instead of partial-index upsert', async () => {
    let defaultPatch: Record<string, unknown> | null = null;

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'intelligence_connections') {
        return maybeSingleBuilder({
          id: 'connection-1',
          owner_agent_id: 'agent-1',
          workspace_id: 'workspace-1',
          vault_secret_id: 'secret-1',
          vendor: 'openai',
          display_name: 'OpenAI Production',
          status: 'active',
          selected_model_id: 'gpt-5',
          available_models: ['gpt-5'],
          capabilities: {},
          health: {},
        });
      }
      if (table === 'intelligence_defaults') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'default-1' }, error: null }),
          ...updateBuilder(row => { defaultPatch = row; }, {
            id: 'default-1',
            owner_agent_id: 'agent-1',
            workspace_id: 'workspace-1',
            scope: 'workspace',
            mode: 'single',
            connection_id: 'connection-1',
            model_id: 'gpt-5',
            consensus_configuration_id: null,
            selection_source: 'workspace',
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await setIntelligenceDefault({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      scope: 'workspace',
      selection: {
        mode: 'single',
        connectionId: 'connection-1',
        modelId: 'gpt-5',
        consensusConfigurationId: null,
        selectionSource: 'workspace',
      },
    });

    expect(defaultPatch).toMatchObject({
      owner_agent_id: 'agent-1',
      workspace_id: 'workspace-1',
      scope: 'workspace',
      mode: 'single',
      connection_id: 'connection-1',
      model_id: 'gpt-5',
      selection_source: 'workspace',
    });
    expect(result.selection).toMatchObject({
      mode: 'single',
      connectionId: 'connection-1',
      modelId: 'gpt-5',
    });
  });

  it('redacts invocation manifests and stores selected connection metadata without secret material', async () => {
    let invocation: Record<string, unknown> | null = null;

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'workspace_members') {
        return maybeSingleBuilder({
          role: 'owner',
          workspaces: { id: 'workspace-1', name: 'Workspace', slug: 'workspace', owner_id: 'agent-1', plan: 'retail_free' },
        });
      }
      if (table === 'nl_studio_sessions') {
        return maybeSingleBuilder({ id: 'session-1', workspace_id: 'workspace-1', owner_agent_id: 'agent-1' });
      }
      if (table === 'intelligence_invocations') {
        return insertBuilder(row => { invocation = row; });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await recordIntelligenceInvocation({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      selection: {
        mode: 'native',
        connectionId: null,
        modelId: null,
        consensusConfigurationId: null,
        selectionSource: 'native_default',
      },
      status: 'completed',
      contextManifest: {
        prompt: 'deploy',
        authorization: 'Bearer secret-token-value-123456',
        nested: { apiKey: 'sk-secretsecretsecretsecret' },
      },
      usage: { steps: 2 },
    });

    expect(invocation).toMatchObject({
      owner_agent_id: 'agent-1',
      workspace_id: 'workspace-1',
      session_id: 'session-1',
      connection_id: null,
      mode: 'native',
      vendor: null,
      model_id: null,
      consensus_configuration_id: null,
      status: 'completed',
    });
    expect(JSON.stringify(invocation)).not.toContain('secret-token-value');
    expect(JSON.stringify(invocation)).not.toContain('sk-secret');
    expect(result.contextManifest.authorization).toBe('[redacted]');
    expect(serviceMocks.logSuperAgentAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'intelligence.invocation_recorded',
      success: true,
    }));
  });

  it('stores consensus configuration ids on invocation records', async () => {
    let invocation: Record<string, unknown> | null = null;

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'workspace_members') {
        return maybeSingleBuilder({
          role: 'owner',
          workspaces: { id: 'workspace-1', name: 'Workspace', slug: 'workspace', owner_id: 'agent-1', plan: 'retail_free' },
        });
      }
      if (table === 'intelligence_invocations') {
        return insertBuilder(row => { invocation = row; });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await recordIntelligenceInvocation({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      selection: {
        mode: 'consensus',
        connectionId: null,
        modelId: null,
        consensusConfigurationId: 'standard-config-1',
        selectionSource: 'message',
      },
      status: 'running',
      contextManifest: { prompt: 'compare routes' },
    });

    expect(invocation).toMatchObject({
      mode: 'consensus',
      connection_id: null,
      model_id: null,
      consensus_configuration_id: 'standard-config-1',
      selection_source: 'message',
    });
    expect(result.consensusConfigurationId).toBe('standard-config-1');
  });
});
