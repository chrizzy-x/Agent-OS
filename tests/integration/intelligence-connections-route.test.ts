import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const routeMocks = vi.hoisted(() => ({
  requireRouteCapability: vi.fn(),
  upsertVaultSecret: vi.fn(),
  assignVaultSecret: vi.fn(),
  createRuntimeSecretGrant: vi.fn(),
  discoverConnectedIntelligenceModels: vi.fn(),
  createIntelligenceConnection: vi.fn(),
  listIntelligenceConnections: vi.fn(),
  setIntelligenceDefault: vi.fn(),
  updateIntelligenceConnectionStatus: vi.fn(),
}));

vi.mock('../../src/auth/request.js', () => ({
  requireRouteCapability: routeMocks.requireRouteCapability,
}));

vi.mock('../../src/vault/service.js', () => ({
  upsertVaultSecret: routeMocks.upsertVaultSecret,
  assignVaultSecret: routeMocks.assignVaultSecret,
  createRuntimeSecretGrant: routeMocks.createRuntimeSecretGrant,
}));

vi.mock('../../src/intelligence/service.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/intelligence/service.js')>(),
  createIntelligenceConnection: routeMocks.createIntelligenceConnection,
  listIntelligenceConnections: routeMocks.listIntelligenceConnections,
  setIntelligenceDefault: routeMocks.setIntelligenceDefault,
  updateIntelligenceConnectionStatus: routeMocks.updateIntelligenceConnectionStatus,
}));

vi.mock('../../src/intelligence/adapters.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/intelligence/adapters.js')>(),
  discoverConnectedIntelligenceModels: routeMocks.discoverConnectedIntelligenceModels,
}));

import { GET, PATCH, POST } from '../../app/api/intelligence/connections/route.js';

function request(url: string, method: string, body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'connection-1',
    ownerAgentId: 'agent-1',
    workspaceId: 'workspace-1',
    vaultSecretId: 'secret-1',
    vendor: 'openai',
    displayName: 'OpenAI Production',
    status: 'active',
    selectedModelId: 'gpt-5',
    availableModels: ['gpt-5'],
    capabilities: {},
    health: {},
    lastValidatedAt: '2026-07-24T00:00:00.000Z',
    lastError: null,
    createdAt: '2026-07-24T00:00:00.000Z',
    updatedAt: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

describe('intelligence connections route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.requireRouteCapability.mockResolvedValue({ agentId: 'agent-1' });
    routeMocks.upsertVaultSecret.mockResolvedValue({
      id: 'secret-1',
      name: 'SUPER_AGENTOS_OPENAI_KEY',
      maskedValue: '************cret',
    });
    routeMocks.assignVaultSecret.mockResolvedValue({ id: 'assignment-1' });
    routeMocks.createRuntimeSecretGrant.mockResolvedValue({ id: 'grant-1' });
    routeMocks.discoverConnectedIntelligenceModels.mockResolvedValue([
      { id: 'gpt-5', label: 'gpt-5', vendor: 'openai', default: true, capabilities: ['text', 'streaming'] },
    ]);
    routeMocks.createIntelligenceConnection.mockResolvedValue(connection());
    routeMocks.listIntelligenceConnections.mockResolvedValue([connection()]);
    routeMocks.setIntelligenceDefault.mockResolvedValue({
      id: 'default-1',
      selection: { mode: 'single', connectionId: 'connection-1', modelId: 'gpt-5', selectionSource: 'workspace' },
    });
    routeMocks.updateIntelligenceConnectionStatus.mockResolvedValue(connection({ status: 'revoked' }));
  });

  it('creates a validated Vault-backed connection without returning secret material', async () => {
    const response = await POST(request('http://localhost/api/intelligence/connections', 'POST', {
      workspaceId: 'workspace-1',
      vendor: 'openai',
      displayName: 'OpenAI Production',
      credential: 'sk-live-secret-value',
      modelId: 'gpt-5',
      makeDefault: true,
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(routeMocks.upsertVaultSecret).toHaveBeenCalledWith({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      name: 'SUPER_AGENTOS_OPENAI_KEY',
      value: 'sk-live-secret-value',
    });
    expect(routeMocks.createRuntimeSecretGrant).toHaveBeenCalledWith(expect.objectContaining({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      name: 'SUPER_AGENTOS_OPENAI_KEY',
    }));
    expect(routeMocks.assignVaultSecret).toHaveBeenCalledWith({
      ownerAgentId: 'agent-1',
      secretId: 'secret-1',
      subjectType: 'super_agentos',
      subjectId: 'agent-1',
    });
    expect(routeMocks.assignVaultSecret.mock.invocationCallOrder[0]).toBeLessThan(routeMocks.createRuntimeSecretGrant.mock.invocationCallOrder[0]);
    expect(routeMocks.createIntelligenceConnection).toHaveBeenCalledWith(expect.objectContaining({
      status: 'active',
      selectedModelId: 'gpt-5',
      validated: true,
    }));
    expect(routeMocks.setIntelligenceDefault).toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain('sk-live-secret-value');
    expect(JSON.stringify(body)).not.toContain('vaultSecretId');
    expect(body.validated).toBe(true);
  });

  it('records invalid status honestly when credential validation fails', async () => {
    routeMocks.discoverConnectedIntelligenceModels.mockRejectedValue(new Error('api_key=sk-live-secret-value rejected'));
    routeMocks.createIntelligenceConnection.mockResolvedValue(connection({
      status: 'invalid',
      lastError: 'api_key=[redacted] rejected',
    }));

    const response = await POST(request('http://localhost/api/intelligence/connections', 'POST', {
      workspaceId: 'workspace-1',
      vendor: 'openai',
      credential: 'sk-live-secret-value',
      modelId: 'gpt-5',
    }));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(routeMocks.createIntelligenceConnection).toHaveBeenCalledWith(expect.objectContaining({
      status: 'invalid',
      validated: false,
      lastError: 'api_key=[redacted] rejected',
    }));
    expect(routeMocks.setIntelligenceDefault).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain('sk-live-secret-value');
    expect(body.validated).toBe(false);
  });

  it('records invalid status honestly when credential validation times out', async () => {
    const previousTimeout = process.env.AGENTOS_CONNECTION_VALIDATION_TIMEOUT_MS;
    process.env.AGENTOS_CONNECTION_VALIDATION_TIMEOUT_MS = '1';
    routeMocks.discoverConnectedIntelligenceModels.mockImplementation(() => new Promise(() => {}));
    routeMocks.createIntelligenceConnection.mockResolvedValue(connection({
      status: 'invalid',
      lastError: 'Credential validation timed out before connected model discovery completed.',
    }));

    try {
      const response = await POST(request('http://localhost/api/intelligence/connections', 'POST', {
        workspaceId: 'workspace-1',
        vendor: 'openai',
        credential: 'sk-live-secret-value',
        modelId: 'gpt-5',
      }));
      const body = await response.json();

      expect(response.status).toBe(202);
      expect(routeMocks.createIntelligenceConnection).toHaveBeenCalledWith(expect.objectContaining({
        status: 'invalid',
        validated: false,
        lastError: expect.stringMatching(/timed out/i),
      }));
      expect(routeMocks.setIntelligenceDefault).not.toHaveBeenCalled();
      expect(JSON.stringify(body)).not.toContain('sk-live-secret-value');
      expect(body.validated).toBe(false);
    } finally {
      if (previousTimeout === undefined) delete process.env.AGENTOS_CONNECTION_VALIDATION_TIMEOUT_MS;
      else process.env.AGENTOS_CONNECTION_VALIDATION_TIMEOUT_MS = previousTimeout;
    }
  });

  it('lists safe connection metadata and known exact models', async () => {
    routeMocks.listIntelligenceConnections.mockResolvedValue([connection({
      selectedModelId: 'custom-openai-production-model',
      availableModels: [
        ...Array.from({ length: 50 }, (_, index) => `stored-model-${index}`),
        'tail-model-that-should-not-be-public',
      ],
      capabilities: {
        models: [
          ...Array.from({ length: 50 }, (_, index) => `capability-model-${index}`),
          'capability-tail-model-that-should-not-be-public',
        ],
      },
    })]);
    const response = await GET(request('http://localhost/api/intelligence/connections?workspaceId=workspace-1', 'GET'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(routeMocks.listIntelligenceConnections).toHaveBeenCalledWith({
      ownerAgentId: 'agent-1',
      workspaceId: 'workspace-1',
      includeRevoked: false,
    });
    expect(body.connections[0].id).toBe('connection-1');
    expect(body.connections[0].vaultSecretId).toBeUndefined();
    expect(body.connections[0].selectedModelId).toBe('custom-openai-production-model');
    expect(body.connections[0].availableModels).toContain('custom-openai-production-model');
    expect(body.connections[0].availableModels).toContain('gpt-5');
    expect(body.connections[0].availableModels).toContain('stored-model-39');
    expect(body.connections[0].availableModels).not.toContain('stored-model-40');
    expect(body.connections[0].availableModels).not.toContain('tail-model-that-should-not-be-public');
    expect(body.connections[0].capabilities.models).toEqual(body.connections[0].availableModels);
    expect(body.models.openai.map((model: { id: string }) => model.id)).toContain('gpt-5');
  });

  it('sets a workspace default from an exact connection and model selection', async () => {
    const response = await PATCH(request('http://localhost/api/intelligence/connections', 'PATCH', {
      action: 'set_default',
      workspaceId: 'workspace-1',
      connectionId: 'connection-1',
      modelId: 'gpt-5',
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(routeMocks.setIntelligenceDefault).toHaveBeenCalledWith({
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
    expect(body.default.id).toBe('default-1');
  });
});
