import crypto from 'crypto';
import { redactSecretsInString } from '../security/secret-redaction.js';
import type { AgentOSIntent } from '../studio/intents.js';
import type { buildWorkspaceContextPackage } from '../workspace-context/service.js';
import { runSingleIntelligenceRuntime, type SingleIntelligenceRuntimeResult } from './runtime.js';
import type { IntelligenceSelection } from './selection.js';

type WorkspaceContextPackage = Awaited<ReturnType<typeof buildWorkspaceContextPackage>>;

export type ConnectedProposalTrace = {
  kind: 'connected_proposal';
  status: 'completed';
  executionAuthority: 'super_agentos';
  connectedIntelligenceRole: 'proposal_only';
  invocationId: string;
  connectionId: string;
  vendor: string;
  modelId: string;
  finishReason: string | null;
  proposalHash: string;
  proposalPreview: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
};

export type StandardConsensusProposalTrace = {
  kind: 'standard_consensus';
  status: 'completed';
  executionAuthority: 'super_agentos';
  connectedIntelligenceRole: 'proposal_only';
  consensusRecordId: string;
  workerRunId: string;
  consensusConfigurationId: string;
  consensusHash: string;
  proposalHash: string;
  proposalPreview: string;
  workerCount: number;
  dissentCount: number;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
};

export type IntelligenceProposalTrace = ConnectedProposalTrace | StandardConsensusProposalTrace;

export type MixedExecutionVerification = {
  executionAuthority: 'super_agentos';
  validationSource: 'native_agentos_operation_router';
  connectedProposalUsedForExecution: false;
  originalRequestUsedForExecution: true;
  proposalInvocationId: string | null;
  outcomeKind: string;
  approvalRequired: boolean;
  executed: boolean;
  resultVerification: 'verified_by_agentos' | 'pending_user_approval' | 'blocked_by_agentos';
};

function hashText(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sanitizeProposalText(value: string, maxLength = 700): string {
  return redactSecretsInString(value)
    .replace(/\b(authorization|bearer|token|secret|password|api[_ -]?key)\b[^\n\r]{0,180}/gi, '[redacted]')
    .slice(0, maxLength);
}

export function buildConnectedProposalOnlyPrompt(params: {
  message: string;
  intent: AgentOSIntent;
}): string {
  return [
    'Proposal-only review for Super AgentOS validation.',
    `Detected intent: ${params.intent}.`,
    'Return a concise proposal with the safest AgentOS operation to consider, approval requirement, risks, blockers, and verification checks.',
    'Do not execute tools, claim execution, fabricate success, or ask the user to leave Super AgentOS.',
    'Original user request:',
    params.message,
  ].join('\n\n');
}

export function buildConnectedProposalTrace(result: SingleIntelligenceRuntimeResult): ConnectedProposalTrace {
  return {
    kind: 'connected_proposal',
    status: 'completed',
    executionAuthority: 'super_agentos',
    connectedIntelligenceRole: 'proposal_only',
    invocationId: result.invocation.id,
    connectionId: result.connection.id,
    vendor: result.connection.vendor,
    modelId: result.modelId,
    finishReason: result.finishReason,
    proposalHash: hashText(result.text),
    proposalPreview: sanitizeProposalText(result.text),
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
    },
  };
}

export async function requestConnectedProposalOnly(params: {
  ownerAgentId: string;
  workspaceId: string;
  projectId?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
  executionId?: string | null;
  selection: IntelligenceSelection;
  workspaceContext: WorkspaceContextPackage;
  message: string;
  intent: AgentOSIntent;
  attachments?: unknown[];
  invocations?: unknown[];
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  signal?: AbortSignal;
}): Promise<{ text: string; trace: ConnectedProposalTrace }> {
  const result = await runSingleIntelligenceRuntime({
    ownerAgentId: params.ownerAgentId,
    workspaceId: params.workspaceId,
    projectId: params.projectId,
    sessionId: params.sessionId,
    taskId: params.taskId,
    executionId: params.executionId,
    selection: params.selection,
    workspaceContext: params.workspaceContext,
    message: buildConnectedProposalOnlyPrompt({ message: params.message, intent: params.intent }),
    attachments: params.attachments,
    invocations: params.invocations,
    recentMessages: params.recentMessages,
    signal: params.signal,
    purpose: 'proposal_only',
  });
  return {
    text: result.text,
    trace: buildConnectedProposalTrace(result),
  };
}

export function buildMixedExecutionVerification(params: {
  payload: Record<string, unknown>;
  proposal: IntelligenceProposalTrace | null;
}): MixedExecutionVerification {
  const outcomeKind = typeof params.payload.kind === 'string' ? params.payload.kind : 'unknown';
  const approvalRequired = outcomeKind === 'approval_required';
  const blocked = outcomeKind === 'error' || outcomeKind === 'forbidden' || outcomeKind === 'unsupported';
  const executed = params.payload.executed === true || (outcomeKind === 'completed' && !approvalRequired);
  const proposalRecordId = params.proposal?.kind === 'connected_proposal'
    ? params.proposal.invocationId
    : params.proposal?.consensusRecordId ?? null;
  return {
    executionAuthority: 'super_agentos',
    validationSource: 'native_agentos_operation_router',
    connectedProposalUsedForExecution: false,
    originalRequestUsedForExecution: true,
    proposalInvocationId: proposalRecordId,
    outcomeKind,
    approvalRequired,
    executed,
    resultVerification: approvalRequired ? 'pending_user_approval' : blocked ? 'blocked_by_agentos' : 'verified_by_agentos',
  };
}
