import { describe, expect, it } from 'vitest';
import {
  buildConnectedProposalOnlyPrompt,
  buildConnectedProposalTrace,
  buildMixedExecutionVerification,
} from '../../src/intelligence/mixed-execution.js';

describe('mixed connected reasoning and AgentOS execution', () => {
  it('builds proposal-only prompts without granting execution authority', () => {
    const prompt = buildConnectedProposalOnlyPrompt({
      message: 'Create project Launch Plan',
      intent: 'PROJECT_TASK',
    });

    expect(prompt).toContain('Proposal-only review for Super AgentOS validation.');
    expect(prompt).toContain('Do not execute tools');
    expect(prompt).toContain('Original user request:');
  });

  it('redacts proposal previews and records AgentOS authority', () => {
    const trace = buildConnectedProposalTrace({
      text: 'Use Authorization: Bearer secret-token-value before creating the project.',
      invocation: { id: 'invocation-1' } as never,
      connection: { id: 'connection-1', vendor: 'openai' } as never,
      modelId: 'gpt-5',
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3, raw: {} },
      finishReason: 'stop',
      purpose: 'proposal_only',
    });

    expect(trace.executionAuthority).toBe('super_agentos');
    expect(trace.connectedIntelligenceRole).toBe('proposal_only');
    expect(trace.proposalPreview).not.toContain('secret-token-value');
    expect(trace.usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
  });

  it('marks approval work as pending AgentOS verification', () => {
    const verification = buildMixedExecutionVerification({
      proposal: {
        kind: 'connected_proposal',
        status: 'completed',
        executionAuthority: 'super_agentos',
        connectedIntelligenceRole: 'proposal_only',
        invocationId: 'invocation-1',
        connectionId: 'connection-1',
        vendor: 'openai',
        modelId: 'gpt-5',
        finishReason: 'stop',
        proposalHash: 'hash',
        proposalPreview: 'preview',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      },
      payload: { kind: 'approval_required', confirmToken: 'confirm-1' },
    });

    expect(verification).toEqual(expect.objectContaining({
      executionAuthority: 'super_agentos',
      validationSource: 'native_agentos_operation_router',
      connectedProposalUsedForExecution: false,
      originalRequestUsedForExecution: true,
      proposalInvocationId: 'invocation-1',
      approvalRequired: true,
      executed: false,
      resultVerification: 'pending_user_approval',
    }));
  });

  it('treats Standard Consensus as proposal-only input, not execution authority', () => {
    const verification = buildMixedExecutionVerification({
      proposal: {
        kind: 'standard_consensus',
        status: 'completed',
        executionAuthority: 'super_agentos',
        connectedIntelligenceRole: 'proposal_only',
        consensusRecordId: 'consensus-record-1',
        workerRunId: 'worker-run-1',
        consensusConfigurationId: 'standard',
        consensusHash: 'hash',
        proposalHash: 'hash',
        proposalPreview: 'preview',
        workerCount: 2,
        dissentCount: 1,
        usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
      },
      payload: { kind: 'completed', executed: true },
    });

    expect(verification).toEqual(expect.objectContaining({
      executionAuthority: 'super_agentos',
      connectedProposalUsedForExecution: false,
      originalRequestUsedForExecution: true,
      proposalInvocationId: 'consensus-record-1',
      executed: true,
      resultVerification: 'verified_by_agentos',
    }));
  });
});
