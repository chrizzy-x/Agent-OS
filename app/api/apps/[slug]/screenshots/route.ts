import { NextRequest, NextResponse } from 'next/server';
import { getAgentAppBySlug, publishAgentApp } from '@/src/appstore/service';
import { requireRouteCapability } from '@/src/auth/request';
import { STORAGE_BUCKET, getSupabaseAdmin, storagePath } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'apps.create');
    const { slug } = await params;
    const app = await getAgentAppBySlug(slug, {
      viewerAgentId: ctx.agentId,
    });
    if (!app || app.publisherId !== ctx.agentId) {
      return NextResponse.json({ error: 'App not found or not accessible', code: 'NOT_FOUND' }, { status: 404 });
    }

    const form = await request.formData();
    const files = form.getAll('files').filter(item => item instanceof File) as File[];
    if (files.length === 0) {
      return NextResponse.json({ error: 'At least one file is required', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const uploaded: string[] = [];
    for (const file of files.slice(0, 8)) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const target = storagePath(ctx.agentId, `apps/${app.slug}/screenshots/${Date.now()}-${file.name}`);
      const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(target, bytes, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });
      if (error) throw new Error(`Failed to upload screenshot: ${error.message}`);
      uploaded.push(target);
    }

    const nextScreenshots = [...app.screenshots, ...uploaded];
    const updated = await publishAgentApp({
      publisherId: app.publisherId,
      workspaceId: app.workspaceId ?? undefined,
      name: app.name,
      slug: app.slug,
      category: app.category,
      description: app.description,
      longDescription: app.longDescription,
      appUrl: app.appUrl,
      repositoryUrl: app.repositoryUrl,
      deviceTargets: app.deviceTargets,
      manifest: app.manifest,
      defaultConfig: app.defaultConfig,
      permissionsRequired: app.permissionsRequired,
      requiredSecrets: app.requiredSecrets,
      source: app.source,
      visibility: app.visibility,
      runtimeType: app.runtimeType,
      screenshots: nextScreenshots,
      kernelProduct: app.kernelProduct ?? undefined,
      kernelCommandTopic: app.kernelCommandTopic ?? undefined,
      kernelStatusTopic: app.kernelStatusTopic ?? undefined,
      lastHeartbeatAt: app.lastHeartbeatAt ?? undefined,
    });

    return NextResponse.json({ screenshots: updated.screenshots });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'apps.create');
    const { slug } = await params;
    const app = await getAgentAppBySlug(slug, {
      viewerAgentId: ctx.agentId,
    });
    if (!app || app.publisherId !== ctx.agentId) {
      return NextResponse.json({ error: 'App not found or not accessible', code: 'NOT_FOUND' }, { status: 404 });
    }

    const url = new URL(request.url);
    const path = url.searchParams.get('path')?.trim();
    if (!path) {
      return NextResponse.json({ error: 'path is required', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([path]);
    if (error) throw new Error(`Failed to delete screenshot: ${error.message}`);

    const nextScreenshots = app.screenshots.filter(item => item !== path);
    const updated = await publishAgentApp({
      publisherId: app.publisherId,
      workspaceId: app.workspaceId ?? undefined,
      name: app.name,
      slug: app.slug,
      category: app.category,
      description: app.description,
      longDescription: app.longDescription,
      appUrl: app.appUrl,
      repositoryUrl: app.repositoryUrl,
      deviceTargets: app.deviceTargets,
      manifest: app.manifest,
      defaultConfig: app.defaultConfig,
      permissionsRequired: app.permissionsRequired,
      requiredSecrets: app.requiredSecrets,
      source: app.source,
      visibility: app.visibility,
      runtimeType: app.runtimeType,
      screenshots: nextScreenshots,
      kernelProduct: app.kernelProduct ?? undefined,
      kernelCommandTopic: app.kernelCommandTopic ?? undefined,
      kernelStatusTopic: app.kernelStatusTopic ?? undefined,
      lastHeartbeatAt: app.lastHeartbeatAt ?? undefined,
    });

    return NextResponse.json({ screenshots: updated.screenshots });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
