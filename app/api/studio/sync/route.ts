import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { listConfirmations } from '@/src/confirmations/service';
import { getStudioSessionIntelligence } from '@/src/intelligence/service';
import { listNotifications } from '@/src/notifications/service';
import { getStudioSessionBundle, listStudioSessions } from '@/src/studio/persistence';
import { buildStudioSyncContract, changedSince } from '@/src/studio/sync-contract';
import { listAgentTasks } from '@/src/tasks/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId') ?? searchParams.get('session');
    const workspaceId = searchParams.get('workspaceId') ?? searchParams.get('workspace');
    const since = searchParams.get('since');
    const limit = Math.max(1, Math.min(Number(searchParams.get('limit') ?? 100), 250));
    const serverTime = new Date().toISOString();

    const [sessions, approvals, tasks, notifications, bundle, intelligence] = await Promise.all([
      listStudioSessions(ctx.agentId, { status: 'all', includeDeleted: true }),
      listConfirmations({ userId: ctx.agentId, status: 'all', limit }),
      listAgentTasks({ userId: ctx.agentId, workspaceId, sessionId, status: 'all', limit }),
      listNotifications({ agentId: ctx.agentId, status: 'all', limit }),
      sessionId ? getStudioSessionBundle(ctx.agentId, sessionId).catch(() => null) : Promise.resolve(null),
      sessionId ? getStudioSessionIntelligence({ ownerAgentId: ctx.agentId, sessionId }).catch(() => null) : Promise.resolve(null),
    ]);

    const changedSessions = changedSince(
      workspaceId ? sessions.filter(session => session.workspaceId === workspaceId) : sessions,
      since,
      session => session.updatedAt,
    );
    const changedApprovals = changedSince(approvals, since, approval => approval.updatedAt);
    const changedTasks = changedSince(tasks, since, task => task.updatedAt);
    const changedNotifications = changedSince(notifications, since, notification => notification.createdAt);
    const cancellationStates = changedTasks.filter(task => task.status === 'cancelled' || task.status === 'cancelling');
    const retryStates = changedTasks.filter(task => task.status === 'retrying' || task.retryCount > 0);

    return NextResponse.json({
      syncContract: buildStudioSyncContract(),
      serverTime,
      cursor: {
        since,
        nextSince: serverTime,
      },
      activeSession: bundle
        ? {
          ...bundle,
          intelligenceSelection: intelligence?.selection ?? null,
        }
        : null,
      sessions: changedSessions,
      intelligenceSelection: intelligence?.selection ?? null,
      approvals: changedApprovals,
      tasks: changedTasks,
      cancellationStates,
      retryStates,
      notifications: changedNotifications,
      counts: {
        sessions: changedSessions.length,
        approvals: changedApprovals.length,
        tasks: changedTasks.length,
        cancellationStates: cancellationStates.length,
        retryStates: retryStates.length,
        notifications: changedNotifications.length,
      },
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
