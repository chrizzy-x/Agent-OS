import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { AGENT_APP_CATEGORIES } from '@/src/appstore/catalog';
import { listAgentApps, publishAgentApp } from '@/src/appstore/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

function stringBodyValue(body: Record<string, unknown>, camel: string, snake: string): string | undefined {
  const value = body[camel] ?? body[snake];
  return typeof value === 'string' ? value : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const apps = await listAgentApps({
      category: searchParams.get('category'),
      search: searchParams.get('search'),
      sort: searchParams.get('sort'),
      publisherId: searchParams.get('publisher') ?? searchParams.get('author'),
    });

    return NextResponse.json({
      apps,
      categories: AGENT_APP_CATEGORIES,
      pagination: { total: apps.length },
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const agentCtx = requireAgentContext(request.headers);
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body', message: 'Invalid JSON body' }, { status: 400 });
    }

    const app = await publishAgentApp({
      name: stringBodyValue(body, 'name', 'name'),
      slug: stringBodyValue(body, 'slug', 'slug'),
      category: stringBodyValue(body, 'category', 'category'),
      description: stringBodyValue(body, 'description', 'description'),
      longDescription: stringBodyValue(body, 'longDescription', 'long_description'),
      publisherId: agentCtx.agentId,
      publisherName: stringBodyValue(body, 'publisherName', 'publisher_name') ?? agentCtx.agentId,
      appUrl: stringBodyValue(body, 'appUrl', 'app_url') ?? null,
      repositoryUrl: stringBodyValue(body, 'repositoryUrl', 'repository_url') ?? null,
      deviceTargets: body.deviceTargets ?? body.device_targets,
      manifest: body.manifest,
      defaultConfig: body.defaultConfig ?? body.default_config,
    });

    return NextResponse.json({ success: true, app }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, message: err.message }, { status: err.statusCode });
  }
}
