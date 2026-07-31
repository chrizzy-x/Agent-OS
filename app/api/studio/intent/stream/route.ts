import { NextRequest } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { appendExecutionLog, createExecution, updateExecution } from '@/src/execution/service';
import { requestStandardConsensusProposalOnly, runStandardConsensusRuntime } from '@/src/intelligence/consensus';
import {
  buildMixedExecutionVerification,
  requestConnectedProposalOnly,
  type IntelligenceProposalTrace,
  type MixedExecutionVerification,
} from '@/src/intelligence/mixed-execution';
import { runSingleIntelligenceRuntime } from '@/src/intelligence/runtime';
import { normalizeIntelligenceSelection } from '@/src/intelligence/selection';
import { createNotification } from '@/src/notifications/service';
import { listProjects } from '@/src/projects/service';
import { streamStudioChatReply } from '@/src/studio/conversation';
import { withStudioDefaultAllowedDomains } from '@/src/studio/domains';
import { buildExecutionTargets, normalizeExecutionTargetId, resolveExecutionTarget } from '@/src/studio/execution-targets';
import { getStudioModelLabel, getStudioProviderStatus } from '@/src/studio/providers';
import { detectAgentOSIntent, humanStatusForIntent, translateMessageToStudioCommand, type AgentOSIntent } from '@/src/studio/intents';
import { detectNativeMissingCapability } from '@/src/studio/native-operations';
import { appendStudioEvent, appendStudioMessage, getStudioSessionBundle } from '@/src/studio/persistence';
import { createAgentTask, updateAgentTask, type AgentTaskRecord } from '@/src/tasks/service';
import { sanitizeErrorMessage } from '@/src/utils/output-sanitizer';
import { listVaultSecrets } from '@/src/vault/service';
import { buildWorkspaceContextPackage } from '@/src/workspace-context/service';
import { listWorkspaces } from '@/src/workspaces/service';

export const runtime = 'nodejs';

function encodeEvent(event: string, payload: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function buildInternalIntentHeaders(requestHeaders: Headers): Headers {
  const headers = new Headers({ 'content-type': 'application/json' });
  const authorization = requestHeaders.get('authorization');
  const cookie = requestHeaders.get('cookie');
  if (authorization) headers.set('authorization', authorization);
  if (cookie) headers.set('cookie', cookie);
  return headers;
}

function isDirectConversation(intent: AgentOSIntent, message: string): boolean {
  return (
    intent === 'NORMAL_CHAT'
    || intent === 'REASONING'
    || intent === 'RESEARCH'
  ) && !translateMessageToStudioCommand(message);
}

function replyChunks(reply: string): string[] {
  return reply.match(/.{1,48}(?:\s+|$)|.{1,48}/g) ?? [reply];
}

function isWorkspaceCapabilityQuestion(message: string): boolean {
  return /\b(what can you do|available capabilities|what is installed|workspace capabilities)\b/i.test(message);
}

function isProviderStatusQuestion(message: string): boolean {
  return /\b(intelligence provider|model status|provider status|are you live|live model|native runtime|external intelligence|can i talk to super agent|is super agent live)\b/i.test(message);
}

async function loadRecentConversation(agentId: string, sessionId: string | null) {
  if (!sessionId) return [];
  const bundle = await getStudioSessionBundle(agentId, sessionId).catch(() => null);
  return (bundle?.messages ?? [])
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .slice(-10)
    .map(message => ({ role: message.role as 'user' | 'assistant', content: message.content }));
}

function providerStatusReply(providerStatus: ReturnType<typeof getStudioProviderStatus>): string {
  if (providerStatus.configured) {
    return [
      `Super AgentOS is connected to live Connected Intelligence: ${providerStatus.label}.`,
      'Studio will stream model-backed responses and record the provider route in execution history.',
      'Secrets are not exposed in chat, logs, or provider status messages.',
    ].join('\n\n');
  }
  return [
    'Super AgentOS is running on the native AgentOS runtime.',
    'External intelligence is optional. Connect a provider through Vault when you want BYOK assistance.',
    'Super AgentOS still owns session context, memory, tools, permissions, execution logs, recovery, and final result delivery.',
  ].join('\n\n');
}

function workspaceCapabilityReply(context: Awaited<ReturnType<typeof buildWorkspaceContextPackage>>): string {
  const summary = context.capabilityGraph.summary;
  const sourceSummary = Object.entries(summary.bySourceType)
    .filter(([, count]) => count > 0)
    .map(([sourceType, count]) => `${count} ${sourceType}`)
    .join(', ');
  const needsConfig = context.capabilityGraph.needsConfiguration.slice(0, 6).map(item => `${item.name}: ${item.statusReason ?? 'needs configuration'}`);
  return [
    `I can use ${summary.available} available workspace capabilities${sourceSummary ? ` across ${sourceSummary}` : ''}.`,
    needsConfig.length ? `Needs configuration: ${needsConfig.join('; ')}.` : 'No configured capability blockers were found.',
    'I will use installed apps, skills, Primeflows, Prime Agents, MCP tools, projects, Library assets, memory, and Vault metadata when they are available. I will not fake unavailable tools.',
  ].join('\n\n');
}

async function loadConversationNames(params: {
  agentId: string;
  sessionId: string | null;
  workspaceId: string | null;
  projectId: string | null;
}): Promise<{
  workspaceId: string | null;
  projectId: string | null;
  workspaceName: string | null;
  projectName: string | null;
  sessionTitle: string | null;
}> {
  const bundle = params.sessionId
    ? await getStudioSessionBundle(params.agentId, params.sessionId).catch(() => null)
    : null;
  const workspaceId = params.workspaceId ?? bundle?.session.workspaceId ?? null;
  const projectId = params.projectId ?? bundle?.session.projectId ?? null;
  const workspaces = await listWorkspaces(params.agentId).catch(() => []);
  const workspace = workspaces.find(item => item.id === workspaceId) ?? null;
  const projects = workspaceId
    ? await listProjects({
      ownerAgentId: params.agentId,
      workspaceId,
      status: 'all',
    }).catch(() => [])
    : [];
  const project = projects.find(item => item.id === projectId) ?? null;

  return {
    workspaceId,
    projectId,
    workspaceName: workspace?.name ?? null,
    projectName: project?.name ?? null,
    sessionTitle: bundle?.session.title ?? null,
  };
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const internalIntentHeaders = buildInternalIntentHeaders(request.headers);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let executionId: string | null = null;
      let agentId: string | null = null;
      let sessionId: string | null = null;
      let workspaceId: string | null = null;
      let projectId: string | null = null;
      let task: AgentTaskRecord | null = null;
      let partialReply = '';
      let intelligenceInvocation: Record<string, unknown> | null = null;
      let connectedProposal: IntelligenceProposalTrace | null = null;
      let mixedExecution: MixedExecutionVerification | null = null;
      let userPersisted = false;
      let assistantPersisted = false;
      let closed = false;

      const push = (event: string, payload: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event, payload)));
        } catch {
          closed = true;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Client already disconnected.
        }
      };

      try {
        const ctx = await requireRouteCapability(request.headers, 'studio.intent');
        agentId = ctx.agentId;
        sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
        workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : null;
        projectId = typeof body.projectId === 'string' ? body.projectId : null;
        if (sessionId && (!workspaceId || !projectId)) {
          const bundle = await getStudioSessionBundle(ctx.agentId, sessionId).catch(() => null);
          workspaceId = workspaceId ?? bundle?.session.workspaceId ?? null;
          projectId = projectId ?? bundle?.session.projectId ?? null;
        }
        const message = typeof body.message === 'string'
          ? body.message.trim()
          : typeof body.instruction === 'string'
            ? body.instruction.trim()
            : '';
        if (!message) throw new Error('message is required');
        const attachments = Array.isArray(body.attachments)
          ? body.attachments.filter(item => item && typeof item === 'object').slice(0, 20)
          : [];
        const invocations = Array.isArray(body.invocations)
          ? body.invocations.filter(item => item && typeof item === 'object').slice(0, 20)
          : [];

        const workspaceContext = await buildWorkspaceContextPackage({
          ctx,
          workspaceId,
          projectId,
        });
        const vault = workspaceId
          ? await listVaultSecrets({ ownerAgentId: ctx.agentId, workspaceId }).catch(() => ({ secrets: [] }))
          : { secrets: [] };
        const executionTargets = buildExecutionTargets({ vaultSecrets: vault.secrets });
        const selectedExecutionTarget = resolveExecutionTarget(executionTargets, body.executionTargetId);
        const sessionExecutionTargetId = normalizeExecutionTargetId(body.sessionExecutionTargetId);
        const messageExecutionOverrideId = typeof body.messageExecutionOverrideId === 'string'
          ? normalizeExecutionTargetId(body.messageExecutionOverrideId)
          : null;
        const sessionIntelligenceSelection = normalizeIntelligenceSelection(body.sessionIntelligenceSelection, 'session');
        const messageIntelligenceOverride = body.messageIntelligenceOverride && typeof body.messageIntelligenceOverride === 'object' && !Array.isArray(body.messageIntelligenceOverride)
          ? normalizeIntelligenceSelection(body.messageIntelligenceOverride, 'message')
          : null;
        const selectedIntelligenceSelection = normalizeIntelligenceSelection(
          body.intelligenceSelection ?? messageIntelligenceOverride ?? sessionIntelligenceSelection,
          messageIntelligenceOverride ? 'message' : sessionIntelligenceSelection.selectionSource,
        );
        const providerStatus = getStudioProviderStatus();
        const startedAt = Date.now();
        task = await createAgentTask({
          userId: ctx.agentId,
          workspaceId,
          projectId,
          sessionId,
          title: message.slice(0, 180),
          originalPrompt: message,
          status: 'planning',
          plan: [
            { step: 'receive_user_intent', status: 'completed' },
            { step: 'load_workspace_context', status: 'completed', contextVersion: workspaceContext.metadata.contextVersion },
            { step: 'discover_capabilities', status: 'completed', graphVersion: workspaceContext.capabilityGraph.graphVersion },
          ],
          capabilityIds: workspaceContext.capabilityGraph.availableCapabilities.slice(0, 20).map(item => item.id),
          plannerVersion: workspaceContext.runtimeRegistry.contract.plannerVersion,
          contextVersion: workspaceContext.metadata.contextVersion,
          progress: 20,
          metadata: {
            attachmentCount: attachments.length,
            invocationCount: invocations.length,
            contextVersion: workspaceContext.metadata.contextVersion,
            graphVersion: workspaceContext.capabilityGraph.graphVersion,
            providerStatus: {
              mode: providerStatus.mode,
              provider: providerStatus.provider,
              model: providerStatus.model,
              label: providerStatus.label,
            },
            executionTarget: {
              selected: selectedExecutionTarget.id,
              type: selectedExecutionTarget.type,
              displayName: selectedExecutionTarget.displayName,
              sessionDefault: sessionExecutionTargetId,
              messageOverride: messageExecutionOverrideId,
            },
            intelligenceSelection: {
              selected: selectedIntelligenceSelection,
              sessionDefault: sessionIntelligenceSelection,
              messageOverride: messageIntelligenceOverride,
            },
          },
          executionMetadata: {
            runtime: 'super-agentos',
            runtimeContract: workspaceContext.runtimeRegistry.contract,
            contextBuild: workspaceContext.metadata,
            provider: {
              mode: providerStatus.mode,
              provider: providerStatus.provider,
              model: providerStatus.model,
              label: providerStatus.label,
            },
            executionTarget: {
              selected: selectedExecutionTarget.id,
              type: selectedExecutionTarget.type,
              displayName: selectedExecutionTarget.displayName,
              sessionDefault: sessionExecutionTargetId,
              messageOverride: messageExecutionOverrideId,
              failurePolicy: selectedExecutionTarget.failurePolicy,
            },
            intelligenceSelection: {
              selected: selectedIntelligenceSelection,
              sessionDefault: sessionIntelligenceSelection,
              messageOverride: messageIntelligenceOverride,
            },
          },
        });

        const execution = await createExecution({
          agentId: ctx.agentId,
          workspaceId,
          projectId,
          sessionId,
          sourceType: 'super_agent',
          type: 'CHAT_EXECUTION',
          sourceId: sessionId,
          title: message.slice(0, 180),
          input: { message, approval: body.approval === true, attachments, invocations },
          metadata: {
            projectId,
          taskId: task.id,
            runtime: 'super-agentos',
            executionTarget: {
              selected: selectedExecutionTarget.id,
              type: selectedExecutionTarget.type,
              displayName: selectedExecutionTarget.displayName,
              sessionDefault: sessionExecutionTargetId,
              messageOverride: messageExecutionOverrideId,
            },
            intelligenceSelection: selectedIntelligenceSelection,
            provider: {
              mode: providerStatus.mode,
              provider: providerStatus.provider,
              model: providerStatus.model,
              label: providerStatus.label,
            },
          },
          model: getStudioModelLabel(),
        });
        executionId = execution.id;
        await updateExecution({
          agentId: ctx.agentId,
          executionId,
          patch: { status: 'RUNNING', startedAt: new Date(startedAt).toISOString() },
        });
        await appendExecutionLog({
          agentId: ctx.agentId,
          executionId,
          message: 'Super AgentOS request started',
          data: {
            providerMode: providerStatus.mode,
            provider: providerStatus.provider,
            model: providerStatus.model,
            executionTarget: selectedExecutionTarget.displayName,
            messageOverride: messageExecutionOverrideId,
          },
        });
        push('execution', {
          executionId,
          status: 'RUNNING',
          providerMode: providerStatus.mode,
          providerLabel: providerStatus.label,
          executionTarget: selectedExecutionTarget.displayName,
        });

        const intent = await detectAgentOSIntent(message);
        const statusText = humanStatusForIntent(intent);
        push('status', { text: statusText });

        if (sessionId) {
          await appendStudioMessage({
            ownerAgentId: ctx.agentId,
            sessionId,
            role: 'user',
            content: message,
          });
          userPersisted = true;
          await appendStudioEvent({
            ownerAgentId: ctx.agentId,
            sessionId,
            type: 'thinking_started',
            payload: { intent, statusText },
          }).catch(() => undefined);
        }

        if (isDirectConversation(intent, message)) {
          const names = await loadConversationNames({
            agentId: ctx.agentId,
            sessionId,
            workspaceId,
            projectId,
          });
          const recentMessages = await loadRecentConversation(ctx.agentId, sessionId);
          workspaceId = names.workspaceId;
          projectId = names.projectId;
          const missingCapability = detectNativeMissingCapability(message);
          if (missingCapability) {
            partialReply = missingCapability.reply;
            for (const text of replyChunks(partialReply)) {
              push('delta', { text });
              await new Promise(resolve => setTimeout(resolve, 8));
            }
          } else if (isProviderStatusQuestion(message)) {
            partialReply = providerStatusReply(providerStatus);
            for (const text of replyChunks(partialReply)) {
              push('delta', { text });
              await new Promise(resolve => setTimeout(resolve, 8));
            }
          } else if (isWorkspaceCapabilityQuestion(message)) {
            partialReply = workspaceCapabilityReply(workspaceContext);
            for (const text of replyChunks(partialReply)) {
              push('delta', { text });
              await new Promise(resolve => setTimeout(resolve, 8));
            }
          } else if (selectedIntelligenceSelection.mode === 'single') {
            if (!workspaceId) throw new Error('Workspace is required for connected intelligence');
            push('status', { text: 'Calling selected connected intelligence...' });
            const connected = await runSingleIntelligenceRuntime({
              ownerAgentId: ctx.agentId,
              workspaceId,
              projectId,
              sessionId,
              taskId: task?.id ?? null,
              executionId,
              selection: selectedIntelligenceSelection,
              workspaceContext,
              message,
              attachments,
              invocations,
              recentMessages,
              signal: request.signal,
              onDelta: text => {
                partialReply += text;
                push('delta', { text });
              },
            });
            partialReply = connected.text || partialReply;
            intelligenceInvocation = {
              id: connected.invocation.id,
              connectionId: connected.connection.id,
              vendor: connected.connection.vendor,
              modelId: connected.modelId,
              finishReason: connected.finishReason,
              usage: connected.usage,
            };
          } else if (selectedIntelligenceSelection.mode === 'consensus') {
            if (!workspaceId) throw new Error('Workspace is required for Standard Consensus');
            push('status', { text: 'Running Standard Consensus...' });
            const consensus = await runStandardConsensusRuntime({
              ownerAgentId: ctx.agentId,
              workspaceId,
              projectId,
              sessionId,
              taskId: task?.id ?? null,
              executionId,
              selection: selectedIntelligenceSelection,
              workspaceContext,
              message,
              intent,
              recentMessages,
              signal: request.signal,
            });
            partialReply = consensus.text;
            for (const text of replyChunks(partialReply)) {
              push('delta', { text });
              await new Promise(resolve => setTimeout(resolve, 8));
            }
            intelligenceInvocation = {
              kind: 'standard_consensus',
              consensusRecordId: consensus.record.id,
              workerRunId: consensus.workerRun.id,
              consensusConfigurationId: consensus.record.consensusConfigurationId,
              consensusHash: consensus.record.consensusHash,
              dissentCount: consensus.trace.dissentCount,
              usage: consensus.record.usage,
            };
          } else {
            const completedReply = await streamStudioChatReply({
              message,
              intent,
              workspaceName: names.workspaceName,
              projectName: names.projectName,
              sessionTitle: names.sessionTitle,
              executionTargetId: selectedExecutionTarget.id,
              recentMessages,
              agentContext: withStudioDefaultAllowedDomains({ ...ctx, studioSessionId: sessionId }),
              signal: request.signal,
              onDelta: text => {
                partialReply += text;
                push('delta', { text });
              },
            });
            partialReply = completedReply || partialReply;
          }

          if (sessionId && partialReply.trim()) {
            await appendStudioMessage({
              ownerAgentId: ctx.agentId,
              sessionId,
              role: 'assistant',
              content: partialReply,
            });
            assistantPersisted = true;
          }

          const payload = { kind: 'chat_reply', intent, statusText, reply: partialReply, intelligenceInvocation };
          await updateExecution({
            agentId: ctx.agentId,
            executionId,
            patch: {
              status: 'COMPLETED',
              output: payload,
              durationMs: Date.now() - startedAt,
              completedAt: new Date().toISOString(),
            },
          });
          await updateAgentTask({
            userId: ctx.agentId,
            taskId: task.id,
            patch: {
              status: 'completed',
              progress: 100,
              resultSummary: partialReply.slice(0, 1000),
              metadata: { ...task.metadata, executionId },
            },
          });
          await appendExecutionLog({
            agentId: ctx.agentId,
            executionId,
            message: 'Super AgentOS request completed',
            data: {
              kind: 'chat_reply',
              providerMode: providerStatus.mode,
              intelligenceInvocation,
              executionTrace: selectedExecutionTarget.type === 'orchestrator'
                ? ['Orchestrator analyzed request', 'Super AgentOS validated and delivered the result']
                : ['Super AgentOS analyzed request', 'Super AgentOS delivered the result'],
              executionTarget: selectedExecutionTarget.displayName,
            },
          });
          await createNotification({
            agentId: ctx.agentId,
            workspaceId,
            sessionId,
            executionId,
            type: 'execution_completed',
            title: 'Task completed',
            body: partialReply.slice(0, 500),
          }).catch(() => undefined);
          push('done', { executionId, status: 'COMPLETED' });
          close();
          return;
        }

        if (selectedIntelligenceSelection.mode === 'single') {
          if (!workspaceId) throw new Error('Workspace is required for connected intelligence');
          push('status', { text: 'Requesting connected proposal for Super AgentOS validation...' });
          const recentMessages = await loadRecentConversation(ctx.agentId, sessionId);
          const proposal = await requestConnectedProposalOnly({
            ownerAgentId: ctx.agentId,
            workspaceId,
            projectId,
            sessionId,
            taskId: task?.id ?? null,
            executionId,
            selection: selectedIntelligenceSelection,
            workspaceContext,
            message,
            intent,
            attachments,
            invocations,
            recentMessages,
            signal: request.signal,
          });
          connectedProposal = proposal.trace;
          if (executionId) await appendExecutionLog({
            agentId: ctx.agentId,
            executionId,
            message: 'Connected intelligence proposal recorded for Super AgentOS validation',
            data: connectedProposal,
          }).catch(() => undefined);
        } else if (selectedIntelligenceSelection.mode === 'consensus') {
          if (!workspaceId) throw new Error('Workspace is required for Standard Consensus');
          push('status', { text: 'Requesting Standard Consensus proposal for Super AgentOS validation...' });
          const recentMessages = await loadRecentConversation(ctx.agentId, sessionId);
          const proposal = await requestStandardConsensusProposalOnly({
            ownerAgentId: ctx.agentId,
            workspaceId,
            projectId,
            sessionId,
            taskId: task?.id ?? null,
            executionId,
            selection: selectedIntelligenceSelection,
            workspaceContext,
            message,
            intent,
            recentMessages,
            signal: request.signal,
          });
          connectedProposal = proposal.trace;
          if (executionId) await appendExecutionLog({
            agentId: ctx.agentId,
            executionId,
            message: 'Standard Consensus proposal recorded for Super AgentOS validation',
            data: connectedProposal,
          }).catch(() => undefined);
        }

        const intentBody = {
          ...body,
          runtimeTaskId: task.id,
          runtimeExecutionId: executionId,
          ...(connectedProposal ? { intelligenceProposal: connectedProposal } : {}),
        };
        const response = await fetch(new URL('/api/studio/intent', request.url), {
          method: 'POST',
          headers: internalIntentHeaders,
          body: JSON.stringify(intentBody),
          signal: request.signal,
        });
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
        partialReply = typeof payload.reply === 'string' ? payload.reply : '';
        const failed = !response.ok || payload.kind === 'error';

        if (failed) {
          throw new Error(typeof payload.error === 'string' ? payload.error : 'Intent request failed');
        }
        mixedExecution = buildMixedExecutionVerification({ payload, proposal: connectedProposal });

        if (typeof payload.statusText === 'string') {
          push('status', { text: payload.statusText });
        }
        for (const text of replyChunks(partialReply)) {
          push('delta', { text });
          await new Promise(resolve => setTimeout(resolve, 8));
        }
        if (typeof payload.confirmToken === 'string') {
          push('approval', {
            confirmToken: payload.confirmToken,
            reply: partialReply,
            mixedExecution,
          });
        }

        const paused = payload.kind === 'approval_required';
        await updateExecution({
          agentId: ctx.agentId,
          executionId,
          patch: {
              status: paused ? 'PAUSED' : 'COMPLETED',
              output: { ...payload, mixedExecution },
              durationMs: Date.now() - startedAt,
              completedAt: new Date().toISOString(),
          },
        });
        await updateAgentTask({
          userId: ctx.agentId,
          taskId: task.id,
          patch: {
            status: paused ? 'awaiting_confirmation' : 'completed',
            confirmationStatus: paused ? 'pending' : 'not_required',
            progress: paused ? 55 : 100,
            resultSummary: partialReply.slice(0, 1000),
            metadata: { ...task.metadata, executionId, payloadKind: payload.kind, connectedProposal, mixedExecution },
          },
        });
        await appendExecutionLog({
          agentId: ctx.agentId,
          executionId,
          message: paused ? 'Super AgentOS request paused for approval' : 'Super AgentOS request completed',
          data: { kind: payload.kind, status: response.status, providerMode: providerStatus.mode, connectedProposal, mixedExecution },
        });
        await createNotification({
          agentId: ctx.agentId,
          workspaceId,
          sessionId,
          executionId,
          type: paused ? 'approval_request' : 'execution_completed',
          title: paused ? 'Approval required' : 'Task completed',
          body: partialReply.slice(0, 500),
        }).catch(() => undefined);
        push('done', {
          executionId,
          status: paused ? 'PAUSED' : 'COMPLETED',
          ...(typeof payload.navigateTo === 'string' ? { navigateTo: payload.navigateTo } : {}),
          mixedExecution,
        });
      } catch (error) {
        const stopped = request.signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
        const safeReply = stopped ? partialReply : 'I could not complete that response. Try again.';

        if (stopped && agentId && sessionId && userPersisted && partialReply.trim() && !assistantPersisted) {
          await appendStudioMessage({
            ownerAgentId: agentId,
            sessionId,
            role: 'assistant',
            content: partialReply,
          }).catch(() => undefined);
        }

        if (executionId && agentId) {
            await updateExecution({
              agentId,
              executionId,
              patch: {
                status: stopped ? 'CANCELLED' : 'FAILED',
                output: stopped ? { reply: partialReply, stopped: true } : null,
                error: stopped ? null : {
                  whatFailed: 'Super AgentOS response failed',
                  why: sanitizeErrorMessage(error),
                  where: 'Super AgentOS stream',
                  possibleFix: 'Retry the request.',
                },
                completedAt: new Date().toISOString(),
              },
            }).catch(() => undefined);
            await appendExecutionLog({
              agentId,
              executionId,
              level: stopped ? 'info' : 'error',
              message: stopped ? 'Super AgentOS request stopped' : 'Super AgentOS request failed',
            }).catch(() => undefined);
        }
        if (task && agentId) {
          await updateAgentTask({
            userId: agentId,
            taskId: task.id,
            patch: {
              status: stopped ? 'cancelled' : 'failed',
              progress: 100,
              errorMessage: stopped ? null : sanitizeErrorMessage(error),
              resultSummary: stopped ? 'Response stopped by user.' : null,
            },
          }).catch(() => undefined);
        }

        if (!stopped) {
          push('error', {
            executionId,
            reply: safeReply,
            code: 'STREAM_FAILED',
          });
        }
        push('done', {
          executionId,
          status: stopped ? 'CANCELLED' : 'FAILED',
        });
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
