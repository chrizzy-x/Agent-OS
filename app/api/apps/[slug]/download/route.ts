import { NextRequest, NextResponse } from 'next/server';
import {
  buildAgentAppPackage,
  getAgentAppBySlug,
  recordAgentAppDownload,
} from '@/src/appstore/service';
import { hasAdminAccess, requireAgentContext } from '@/src/auth/request';
import { listWorkspaces } from '@/src/workspaces/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const canManageAll = hasAdminAccess(request.headers);
    let viewerAgentId: string | null = null;
    let viewerWorkspaceIds: string[] = [];
    if (!canManageAll) {
      try {
        const ctx = requireAgentContext(request.headers);
        viewerAgentId = ctx.agentId;
        viewerWorkspaceIds = (await listWorkspaces(ctx.agentId)).map(workspace => workspace.id);
      } catch {
        viewerAgentId = null;
      }
    }

    const app = await getAgentAppBySlug(slug, { viewerAgentId, viewerWorkspaceIds, canManageAll });
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    if (app.visibility !== 'private') await recordAgentAppDownload(app.slug);
    const filename = `${app.slug.replace(/[^a-z0-9-]/g, '')}.agentos-app.json`;

    return new NextResponse(JSON.stringify(buildAgentAppPackage(app), null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.agentos.app+json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
