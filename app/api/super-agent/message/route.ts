import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContextWithTier } from '@/src/auth/request';
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
      plan: [{ step: 'load_workspace_context', status: 'completed' }, { step: 'discover_capabilities', status: 'completed' }],
      capabilityIds: context.capabilityGraph.availableCapabilities.slice(0, 12).map(item => item.id),
      progress: 40,
    });

    const reply = isCapabilityQuestion(message)
      ? `In this workspace I can use ${capabilitySummary(context)} Available sources include apps, skills, workflows, subagents, MCP tools, projects, Library items, memory, and Vault metadata. I will show missing configuration instead of pretending unavailable tools worked.`
      : `I loaded your workspace context and found ${capabilitySummary(context)} No execution was started because this endpoint only prepares and routes Super AgentOS messages; use Studio streaming or a capability action endpoint to run a specific capability.`;

    const completed = await updateAgentTask({
      userId: ctx.agentId,
      taskId: task.id,
      patch: {
        status: 'completed',
        progress: 100,
        resultSummary: reply,
      },
    });

    return NextResponse.json({
      reply,
      task: completed,
      workspaceContext: context,
    });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
