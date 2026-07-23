import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { generateStudioChatReply } from '@/src/studio/conversation';
import { getStudioProviderStatus } from '@/src/studio/providers';
import { detectAgentOSIntent } from '@/src/studio/intents';
import { createAgentTask, updateAgentTask } from '@/src/tasks/service';
import { buildWorkspaceContextPackage } from '@/src/workspace-context/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

function capabilitySummary(context: Awaited<ReturnType<typeof buildWorkspaceContextPackage>>): string {
  const summary = context.capabilityGraph.summary;
  const parts = [
    `${summary.available} available capabilities`,
    `${summary.needsConfiguration} needing configuration`,
    `${summary.error} in error`,
  ];
  const byType = Object.entries(summary.bySourceType)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${count} ${type}`)
    .join(', ');
  return byType ? `${parts.join(', ')} across ${byType}.` : `${parts.join(', ')}.`;
}

function isCapabilityQuestion(message: string): boolean {
  return /\b(what can you do|available capabilities|what is installed|workspace capabilities)\b/i.test(message);
}

function isProviderStatusQuestion(message: string): boolean {
  return /\b(ai provider|model status|provider status|external intelligence|native runtime|can i talk to super agent|is super agent live)\b/i.test(message);
}

function providerStatusReply(providerStatus: ReturnType<typeof getStudioProviderStatus>): string {
  if (providerStatus.configured) {
    return [
      `Super AgentOS is using a development external intelligence override: ${providerStatus.label}.`,
      'AgentOS still owns the session, context, memory, permissions, tools, execution logs, recovery, and final response.',
      'Secrets are not exposed in replies, context summaries, or provider status messages.',
    ].join('\n\n');
  }

  return [
    'Super AgentOS is running on the native AgentOS runtime.',
    'External intelligence is optional. Users connect OpenAI, Anthropic, Gemini, or future providers through Vault when they want provider-assisted execution.',
    'Super AgentOS can continue planning, answering, inspecting workspace capabilities, and producing structured results without external provider credentials.',
  ].join('\n\n');
}

function publicContextSummary(context: Awaited<ReturnType<typeof buildWorkspaceContextPackage>>) {
  return {
    contextVersion: context.metadata.contextVersion,
    graphVersion: context.capabilityGraph.graphVersion,
    capabilities: context.capabilityGraph.summary,
    availableCapabilityIds: context.capabilityGraph.availableCapabilities.slice(0, 12).map(item => item.id),
    needsConfiguration: context.capabilityGraph.needsConfiguration.slice(0, 8).map(item => ({
      id: item.id,
      name: item.name,
      sourceType: item.sourceType,
      reason: item.statusReason ?? 'Needs configuration',
    })),
    runtime: {
      name: context.runtimeRegistry.contract.runtime,
      plannerVersion: context.runtimeRegistry.contract.plannerVersion,
      selectionPolicy: context.runtimeRegistry.contract.selectionPolicy,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : null;
    const projectId = typeof body.projectId === 'string' ? body.projectId : null;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
    const context = await buildWorkspaceContextPackage({ ctx, workspaceId, projectId });
    const task = await createAgentTask({
      userId: ctx.agentId,
      workspaceId,
      projectId,
      sessionId,
      title: message ? message.slice(0, 160) : 'Super AgentOS message',
      originalPrompt: message,
      status: 'planning',
      plan: [
        { step: 'load_workspace_context', status: 'completed', contextVersion: context.metadata.contextVersion },
        { step: 'discover_capabilities', status: 'completed', graphVersion: context.capabilityGraph.graphVersion },
      ],
      capabilityIds: context.capabilityGraph.availableCapabilities.slice(0, 12).map(item => item.id),
      plannerVersion: context.runtimeRegistry.contract.plannerVersion,
      contextVersion: context.metadata.contextVersion,
      progress: 40,
      metadata: {
        contextVersion: context.metadata.contextVersion,
        graphVersion: context.capabilityGraph.graphVersion,
      },
      executionMetadata: {
        runtime: 'super-agentos',
        runtimeContract: context.runtimeRegistry.contract,
        contextBuild: context.metadata,
      },
    });

    const providerStatus = getStudioProviderStatus();
    const answersWorkspaceQuestion = isCapabilityQuestion(message);
    const answersProviderQuestion = isProviderStatusQuestion(message);
    const intent = answersWorkspaceQuestion || answersProviderQuestion
      ? 'NORMAL_CHAT'
      : await detectAgentOSIntent(message);
    const reply = answersProviderQuestion
      ? providerStatusReply(providerStatus)
      : answersWorkspaceQuestion
        ? `In this workspace I can use ${capabilitySummary(context)} Available sources include apps, skills, Primeflows, Prime Agents, MCP tools, projects, Library items, memory, and Vault metadata. I will show missing configuration instead of pretending unavailable tools worked.`
        : await generateStudioChatReply({ message, intent, executionTargetId: 'super_agentos' });
    const completedAsConversation = Boolean(message) && !answersWorkspaceQuestion && !answersProviderQuestion;

    const updated = await updateAgentTask({
      userId: ctx.agentId,
      taskId: task.id,
      patch: {
        status: answersWorkspaceQuestion || answersProviderQuestion || completedAsConversation ? 'completed' : 'needs_configuration',
        progress: answersWorkspaceQuestion || answersProviderQuestion || completedAsConversation ? 100 : 40,
        resultSummary: answersWorkspaceQuestion || answersProviderQuestion || completedAsConversation ? reply : null,
        errorMessage: answersWorkspaceQuestion || answersProviderQuestion || completedAsConversation ? null : 'No executable capability action was selected.',
      },
    });

    return NextResponse.json({
      reply,
      task: updated,
      providerStatus,
      contextSummary: publicContextSummary(context),
    });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
