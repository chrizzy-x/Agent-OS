import { NextRequest, NextResponse } from 'next/server';
import { findAccountById } from '@/src/auth/agent-store';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { hasAdminAccess, requireAgentContext, requireRouteCapability } from '@/src/auth/request';
import { AGENT_APP_CATEGORIES } from '@/src/appstore/catalog';
import { listAgentApps, publishAgentApp, updateAgentAppVisibility } from '@/src/appstore/service';
import { ValidationError, toErrorResponse } from '@/src/utils/errors';

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
    let includePrivate = false;

    if (ownCatalog) {
      publisherId = requireAgentContext(request.headers).agentId;
      includePrivate = true;
    } else if (publisherId) {
      if (hasAdminAccess(request.headers)) {
        includePrivate = true;
      } else {
        try {
          includePrivate = requireAgentContext(request.headers).agentId === publisherId;
        } catch {
          includePrivate = false;
        }
      }
    }

    const apps = await listAgentApps({
      category: searchParams.get('category'),
      search: searchParams.get('search'),
      sort: searchParams.get('sort'),
      publisherId,
      includePrivate,
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
    const app = await publishAgentApp({
      name: stringBodyValue(body, 'name', 'name'),
      slug: stringBodyValue(body, 'slug', 'slug'),
      category: stringBodyValue(body, 'category', 'category'),
      description: stringBodyValue(body, 'description', 'description'),
      longDescription: stringBodyValue(body, 'longDescription', 'long_description'),
      publisherId: agentCtx.agentId,
      publisherName: stringBodyValue(body, 'publisherName', 'publisher_name') ?? publisherAccount?.name ?? 'AgentOS Publisher',
      appUrl: stringBodyValue(body, 'appUrl', 'app_url') ?? null,
      repositoryUrl: stringBodyValue(body, 'repositoryUrl', 'repository_url') ?? null,
      deviceTargets: body.deviceTargets ?? body.device_targets,
      manifest: body.manifest,
      defaultConfig: body.defaultConfig ?? body.default_config,
      published: typeof body.published === 'boolean' ? body.published : stringBodyValue(body, 'visibility', 'visibility') !== 'private',
      permissionsRequired: body.permissions_required,
      requiredSecrets: body.required_secrets,
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
    const published = typeof body.published === 'boolean'
      ? body.published
      : visibility === 'public'
        ? true
        : visibility === 'private'
          ? false
          : undefined;

    if (!slug) throw new ValidationError('App slug required');
    if (typeof published !== 'boolean') throw new ValidationError('Visibility must be public or private');

    const app = await updateAgentAppVisibility({
      slug,
      published,
      publisherId: agentCtx?.agentId,
      canManageAll,
    });

    return NextResponse.json({ success: true, app: omitAgentIdentifierFields(app) });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
