import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { createNotification, listNotifications, markAllNotificationsRead, updateNotification } from '@/src/notifications/service';
import { toErrorResponse, ValidationError } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    const url = new URL(request.url);
    const notifications = await listNotifications({
      agentId: ctx.agentId,
      status: (url.searchParams.get('status') ?? 'all') as 'unread' | 'read' | 'archived' | 'all',
      limit: Number(url.searchParams.get('limit') ?? 50),
    });
    return NextResponse.json({ notifications });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action === 'mark_all_read') {
      const result = await markAllNotificationsRead({ agentId: ctx.agentId });
      return NextResponse.json(result);
    }

    if (typeof body.notificationId === 'string') {
      const status = typeof body.status === 'string' ? body.status : '';
      if (status !== 'read' && status !== 'unread' && status !== 'archived') {
        throw new ValidationError('Unsupported notification status');
      }
      const notification = await updateNotification({
        agentId: ctx.agentId,
        notificationId: body.notificationId,
        status,
      });
      return NextResponse.json({ notification });
    }

    const notification = await createNotification({
      agentId: ctx.agentId,
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : null,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
      executionId: typeof body.executionId === 'string' ? body.executionId : null,
      type: typeof body.type === 'string' ? body.type : 'system',
      title: typeof body.title === 'string' ? body.title : 'Notification',
      body: typeof body.body === 'string' ? body.body : '',
      metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? body.metadata as Record<string, unknown>
        : undefined,
    });
    return NextResponse.json({ notification }, { status: 201 });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
