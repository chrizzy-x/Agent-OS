import { describe, expect, it } from 'vitest';
import { sanitizeForkableWorkflow } from '../../src/workflows/discovery.js';

describe('workflow discovery safety', () => {
  it('sanitizes forked workflows without copying Vault secrets or private context', () => {
    const sanitized = sanitizeForkableWorkflow({
      id: 'workflow-public',
      name: 'Public launch workflow',
      steps: [{
        order: 1,
        tool: 'skill.launch',
        description: 'Run launch check',
        input: {
          projectId: 'project-private',
          workspaceId: 'workspace-private',
          vaultSecretId: 'secret-private',
          apiKey: 'sk-live-private',
          query: 'status',
        },
      }],
      graph_state: {
        nodes: [{
          id: 'vault-node',
          type: 'vault',
          tool: 'agentos.vault_read',
          input: {
            projectId: 'project-private',
            workspaceId: 'workspace-private',
            secretId: 'secret-private',
            sessionId: 'session-private',
            vaultSecretId: 'secret-private',
            apiKey: 'sk-live-private',
            query: 'status',
          },
        }],
        edges: [],
      },
      canonical_doc: {},
      code_state: null,
    });

    expect(sanitized.requiresVaultConfiguration).toBe(true);
    expect(sanitized.privateContextRemoved).toBe(true);
    expect(sanitized.steps[0].input).toEqual(expect.objectContaining({
      projectId: null,
      workspaceId: null,
      vaultSecretId: null,
      apiKey: null,
      query: 'status',
    }));
    expect(sanitized.graphState.nodes[0]).toEqual(expect.objectContaining({
      input: expect.objectContaining({ secretId: null, sessionId: null }),
    }));
    expect(sanitized.canonicalDoc.metadata).toEqual(expect.objectContaining({
      forkedFromWorkflowId: 'workflow-public',
      monetization: 'not_monetized',
      requiresVaultConfiguration: true,
      privateContextRemoved: true,
    }));
  });
});
