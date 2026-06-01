import { NextRequest, NextResponse } from 'next/server';
import { findAccountById } from '@/src/auth/agent-store';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { hasAdminAccess, requireAgentContext, requireRouteCapability } from '@/src/auth/request';
import { AGENT_APP_CATEGORIES } from '@/src/appstore/catalog';
import { listAgentApps, publishAgentApp, updateAgentAppVisibility } from '@/src/appstore/service';
import { ValidationError, toErrorResponse } from '@/src/utils/errors';
import { assertWorkspaceMembership, listWorkspaces, resolveDefaultWorkspaceForAgent } from '@/src/workspaces/service';

export const runtime = 'nodejs';

function stringBodyValue(body: Record<string, unknown>, camel: string, snake: string): string | undefined {
  const value = body[camel] ?? body[snake];
  return typeof value === 'string' ? value : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ownCatalog = searchParams.get('mine') === '1' || searchParams.get('mine') === 'true';
    let publisherId = searchParams.get('publisher') ?? searchParams.get('author');
    let includeHidden = false;
    let viewerAgentId: string | null = null;
    let viewerWorkspaceIds: string[] = [];
    const canManageAll = hasAdminAccess(request.headers);

    if (ownCatalog) {
      const viewer = requireAgentContext(request.headers);
      viewerAgentId = viewer.agentId;
      viewerWorkspaceIds = (await listWorkspaces(viewer.agentId)).map(workspace => workspace.id);
      publisherId = viewer.agentId;
      includeHidden = true;
    } else if (publisherId) {
      if (canManageAll) {
        includeHidden = true;
      } else {
        try {
          const viewer = requireAgentContext(request.headers);
          viewerAgentId = viewer.agentId;
          viewerWorkspaceIds = (await listWorkspaces(viewer.agentId)).map(workspace => workspace.id);
          includeHidden = viewer.agentId === publisherId;
        } catch {
          includeHidden = false;
        }
      }
    }

    const apps = await listAgentApps({
      category: searchParams.get('category'),
      search: searchParams.get('search'),
      sort: searchParams.get('sort'),
      publisherId,
      source: searchParams.get('source'),
      runtimeType: searchParams.get('runtimeType') ?? searchParams.get('runtime'),
      visibility: searchParams.get('visibility'),
      includeHidden,
      viewerAgentId,
      viewerWorkspaceIds,
      canManageAll,
    });

    return NextResponse.json({
      apps: omitAgentIdentifierFields(apps),
      categories: AGENT_APP_CATEGORIES,
      pagination: { total: apps.length },
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const agentCtx = await requireRouteCapability(request.headers, 'apps.create');

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body', message: 'Invalid JSON body' }, { status: 400 });
    }

    const publisherAccount = await findAccountById(agentCtx.agentId);
    const requestedWorkspaceId = stringBodyValue(body, 'workspaceId', 'workspace_id') ?? '';
    const workspaceId = requestedWorkspaceId
      ? (await assertWorkspaceMembership(requestedWorkspaceId, agentCtx.agentId)).workspace.id
      : (await resolveDefaultWorkspaceForAgent(agentCtx.agentId))?.id ?? null;
    const app = await publishAgentApp({
      name: stringBodyValue(body, 'name', 'name'),
      slug: stringBodyValue(body, 'slug', 'slug'),
      category: stringBodyValue(body, 'category', 'category'),
      description: stringBodyValue(body, 'description', 'description'),
      longDescription: stringBodyValue(body, 'longDescription', 'long_description'),
      publisherId: agentCtx.agentId,
      publisherName: stringBodyValue(body, 'publisherName', 'publisher_name') ?? publisherAccount?.name ?? 'AgentOS Publisher',
      workspaceId,
      appUrl: stringBodyValue(body, 'appUrl', 'app_url') ?? null,
      repositoryUrl: stringBodyValue(body, 'repositoryUrl', 'repository_url') ?? null,
      deviceTargets: body.deviceTargets ?? body.device_targets,
      manifest: body.manifest,
      defaultConfig: body.defaultConfig ?? body.default_config,
      published: typeof body.published === 'boolean' ? body.published : undefined,
      visibility: stringBodyValue(body, 'visibility', 'visibility'),
      permissionsRequired: body.permissionsRequired ?? body.permissions_required,
      requiredSecrets: body.requiredSecrets ?? body.required_secrets,
      screenshots: body.screenshots,
      publishState: typeof body.publish_state === 'string' ? body.publish_state : undefined,
    });

    return NextResponse.json({ success: true, app: omitAgentIdentifierFields(app) }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const canManageAll = hasAdminAccess(request.headers);
    const agentCtx = canManageAll ? null : await requireRouteCapability(request.headers, 'apps.publish');
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body', message: 'Invalid JSON body' }, { status: 400 });
    }

    const slug = stringBodyValue(body, 'slug', 'slug');
    const visibility = stringBodyValue(body, 'visibility', 'visibility');
    const normalizedVisibility = visibility === 'public' || visibility === 'private' || visibility === 'unlisted'
      ? visibility
      : typeof body.published === 'boolean'
        ? body.published ? 'public' : 'private'
        : undefined;

    if (!slug) throw new ValidationError('App slug required');
    if (!normalizedVisibility) throw new ValidationError('Visibility must be public, private, or unlisted');

    const app = await updateAgentAppVisibility({
      slug,
      visibility: normalizedVisibility,
      publisherId: agentCtx?.agentId,
      canManageAll,
    });

    return NextResponse.json({ success: true, app: omitAgentIdentifierFields(app) });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
