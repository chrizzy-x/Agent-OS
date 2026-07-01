import { NextRequest, NextResponse } from 'next/server';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { getAgentAppBySlug, publishAgentApp, updateAgentAppVisibility } from '@/src/appstore/service';
import { hasAdminAccess, requireAgentContext, requireRouteCapability } from '@/src/auth/request';
import { listWorkspaces, resolveDefaultWorkspaceForAgent } from '@/src/workspaces/service';
import { ValidationError, toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

async function resolveViewer(request: NextRequest) {
  const canManageAll = hasAdminAccess(request.headers);
  if (canManageAll) {
    return { viewerAgentId: null, viewerWorkspaceIds: [], canManageAll };
  }

  try {
    const viewer = requireAgentContext(request.headers);
    return {
      viewerAgentId: viewer.agentId,
      viewerWorkspaceIds: (await listWorkspaces(viewer.agentId)).map(workspace => workspace.id),
      canManageAll: false,
    };
  } catch {
    return { viewerAgentId: null, viewerWorkspaceIds: [], canManageAll: false };
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const viewer = await resolveViewer(request);
    const app = await getAgentAppBySlug(slug, viewer);
    if (!app) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'App not found', message: 'App not found' }, { status: 404 });
    }

    return NextResponse.json({
      app: omitAgentIdentifierFields(app),
      viewerOwnsApp: viewer.canManageAll || (viewer.viewerAgentId !== null && viewer.viewerAgentId === app.publisherId),
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const canManageAll = hasAdminAccess(request.headers);
    const agentCtx = canManageAll ? null : await requireRouteCapability(request.headers, 'apps.publish');
    const { slug } = await params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const visibility = body.visibility === 'public' || body.visibility === 'private' || body.visibility === 'workspace' || body.visibility === 'unlisted'
      ? body.visibility === 'unlisted' ? 'workspace' : body.visibility
      : typeof body.published === 'boolean'
        ? body.published ? 'public' : 'private'
        : undefined;

    if (visibility) {
      const app = await updateAgentAppVisibility({
        slug,
        visibility,
        publisherId: agentCtx?.agentId,
        canManageAll,
      });
      return NextResponse.json({ success: true, app: omitAgentIdentifierFields(app) });
    }

    const existing = await getAgentAppBySlug(slug, {
      viewerAgentId: agentCtx?.agentId ?? null,
      viewerWorkspaceIds: agentCtx ? (await listWorkspaces(agentCtx.agentId)).map(workspace => workspace.id) : [],
      canManageAll,
    });
    if (!existing) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'App not found', message: 'App not found' }, { status: 404 });
    }
    if (!canManageAll && existing.publisherId !== agentCtx?.agentId) {
      throw new ValidationError('App not found');
    }

    const workspaceId = typeof body.workspaceId === 'string'
      ? body.workspaceId
      : existing.workspaceId ?? (await resolveDefaultWorkspaceForAgent(existing.publisherId))?.id ?? null;
    const app = await publishAgentApp({
      name: typeof body.name === 'string' ? body.name : existing.name,
      slug,
      category: typeof body.category === 'string' ? body.category : existing.category,
      description: typeof body.description === 'string' ? body.description : existing.description,
      longDescription: typeof body.longDescription === 'string' ? body.longDescription : existing.longDescription,
      logoUrl: typeof body.logoUrl === 'string' ? body.logoUrl : existing.logoUrl,
      bannerUrl: typeof body.bannerUrl === 'string' ? body.bannerUrl : existing.bannerUrl,
      videoUrl: typeof body.videoUrl === 'string' ? body.videoUrl : existing.videoUrl,
      websiteUrl: typeof body.websiteUrl === 'string' ? body.websiteUrl : existing.websiteUrl,
      documentationUrl: typeof body.documentationUrl === 'string' ? body.documentationUrl : existing.documentationUrl,
      supportUrl: typeof body.supportUrl === 'string' ? body.supportUrl : existing.supportUrl,
      privacyPolicyUrl: typeof body.privacyPolicyUrl === 'string' ? body.privacyPolicyUrl : existing.privacyPolicyUrl,
      termsUrl: typeof body.termsUrl === 'string' ? body.termsUrl : existing.termsUrl,
      pricing: body.pricing ?? existing.pricing,
      releaseNotes: typeof body.releaseNotes === 'string' ? body.releaseNotes : existing.releaseNotes,
      changelog: body.changelog ?? existing.changelog,
      gallery: body.gallery ?? existing.gallery,
      mediaAssets: body.mediaAssets ?? existing.mediaAssets,
      rejectionReason: typeof body.rejectionReason === 'string' ? body.rejectionReason : existing.rejectionReason,
      keywords: body.keywords ?? existing.keywords,
      tags: body.tags ?? existing.tags,
      features: body.features ?? existing.features,
      platforms: body.platforms ?? existing.platforms,
      publisherId: existing.publisherId,
      publisherName: existing.publisherName,
      workspaceId,
      appUrl: typeof body.appUrl === 'string' ? body.appUrl : existing.appUrl,
      repositoryUrl: typeof body.repositoryUrl === 'string' ? body.repositoryUrl : existing.repositoryUrl,
      deviceTargets: body.deviceTargets ?? existing.deviceTargets,
      manifest: body.manifest ?? existing.manifest,
      defaultConfig: body.defaultConfig ?? existing.defaultConfig,
      visibility: existing.visibility,
      source: existing.source,
      runtimeType: existing.runtimeType,
      kernelProduct: existing.kernelProduct,
      kernelCommandTopic: existing.kernelCommandTopic,
      kernelStatusTopic: existing.kernelStatusTopic,
      lastHeartbeatAt: existing.lastHeartbeatAt,
      permissionsRequired: body.permissionsRequired ?? existing.permissionsRequired,
      requiredSecrets: body.requiredSecrets ?? existing.requiredSecrets,
      screenshots: body.screenshots ?? existing.screenshots,
      spotlight: typeof body.spotlight === 'boolean' ? body.spotlight : existing.spotlight,
      publishState: typeof body.publish_state === 'string' ? body.publish_state : undefined,
    });

    return NextResponse.json({ success: true, app: omitAgentIdentifierFields(app) });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
