import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { listNotifications } from '@/src/notifications/service';
import { listProjects } from '@/src/projects/service';
import { listStudioSessions } from '@/src/studio/persistence';
import { listWorkspaces } from '@/src/workspaces/service';
import { listExternalAgents } from '@/src/external-agents/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const [workspaces, sessions, projects, notifications, agents] = await Promise.all([
      listWorkspaces(ctx.agentId),
      listStudioSessions(ctx.agentId, { status: 'all' }),
      listProjects({ ownerAgentId: ctx.agentId, status: 'all' }),
      listNotifications({ agentId: ctx.agentId, status: 'all', limit: 100 }),
      listExternalAgents(ctx.agentId).catch(() => []),
    ]);

    return NextResponse.json({
      workspaces,
      sessions: sessions.map(item => ({
        id: item.id,
        workspaceId: item.workspaceId,
        projectId: item.projectId,
        title: item.title,
        status: item.status,
        pinnedAt: item.pinnedAt,
        archivedAt: item.archivedAt,
        updatedAt: item.updatedAt,
      })),
      projects: projects.map(item => ({
        id: item.id,
        workspaceId: item.workspaceId,
        name: item.name,
        status: item.status,
        pinned: item.metadata.pinned === true,
        updatedAt: item.updatedAt,
      })),
      notifications: {
        unread: notifications.filter(item => item.status === 'unread').length,
      },
      agents: {
        connected: agents.filter(item => item.status === 'active').length,
      },
    });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message }, { status: err.statusCode });
  }
}
