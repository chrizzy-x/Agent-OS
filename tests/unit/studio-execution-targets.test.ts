import { describe, expect, it } from 'vitest';
import { buildExecutionTargets, normalizeExecutionTargetId, resolveExecutionTarget } from '../../src/studio/execution-targets.js';

describe('Studio execution target registry', () => {
  it('keeps Native selectable and legacy Orchestrator non-selectable without provider credentials', () => {
    const targets = buildExecutionTargets();

    expect(targets.map(target => target.id)).toEqual(['super_agentos', 'orchestrator']);
    expect(targets[0]).toMatchObject({
      id: 'super_agentos',
      displayName: 'Super AgentOS',
      connectionStatus: 'native',
      userSelectable: true,
    });
    expect(targets[1]).toMatchObject({
      id: 'orchestrator',
      displayName: 'Orchestrator',
      connectionStatus: 'native',
      userSelectable: false,
    });
  });

  it('shows only active Vault-connected external providers', () => {
    const targets = buildExecutionTargets({
      vaultSecrets: [
        { id: 'secret-openai', vaultId: 'vault-1', workspaceId: 'workspace-1', name: 'OPENAI_API_KEY', maskedValue: 'opena...', status: 'active', version: 1, createdAt: 'now', updatedAt: 'now', lastAccessedAt: null },
        { id: 'secret-anthropic', vaultId: 'vault-1', workspaceId: 'workspace-1', name: 'ANTHROPIC_API_KEY', maskedValue: 'anth...', status: 'revoked', version: 1, createdAt: 'now', updatedAt: 'now', lastAccessedAt: null },
      ],
    });

    expect(targets.map(target => target.id)).toEqual(['super_agentos', 'orchestrator', 'external_provider:openai']);
    expect(targets.find(target => target.id === 'external_provider:openai')).toMatchObject({
      type: 'external_provider',
      displayName: 'OpenAI',
      credentialReference: 'secret-openai',
      failurePolicy: 'resume_with_super_agentos',
    });
  });

  it('migrates old provider and fallback session values to Super AgentOS', () => {
    expect(normalizeExecutionTargetId('local_fallback')).toBe('super_agentos');
    expect(normalizeExecutionTargetId('fallback')).toBe('super_agentos');
    expect(normalizeExecutionTargetId('anthropic')).toBe('super_agentos');
    expect(normalizeExecutionTargetId('openai')).toBe('super_agentos');
    expect(normalizeExecutionTargetId(null)).toBe('super_agentos');
  });

  it('resolves unavailable selections back to Super AgentOS', () => {
    const targets = buildExecutionTargets();

    expect(resolveExecutionTarget(targets, 'orchestrator')).toMatchObject({
      id: 'super_agentos',
      displayName: 'Super AgentOS',
    });
    expect(resolveExecutionTarget(targets, 'external_provider:anthropic')).toMatchObject({
      id: 'super_agentos',
      displayName: 'Super AgentOS',
    });
  });
});
