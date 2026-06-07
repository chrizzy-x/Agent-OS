import { NextRequest, NextResponse } from 'next/server';
import { findAccountById } from '@/src/auth/agent-store';
import { upsertExternalSdkAgentApp } from '@/src/appstore/service';
import { requireKernelRouteAccess } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { appendLatestStudioEvent } from '@/src/studio/persistence';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

type RegisterCommand = {
  name: string;
  description?: string;
};

function hasValidManifest(manifest: Record<string, unknown> | undefined): boolean {
  if (!manifest) return true;
  const runtime = manifest.runtime;
  const entrypoint = manifest.entrypoint;
  return (
    (runtime === 'external-app' || runtime === 'agentos-app' || runtime === 'workspace-app' || runtime === undefined)
    && (typeof entrypoint === 'string' ? entrypoint.trim().length > 0 : true)
  );
}

// POST /api/kernel/register
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireKernelRouteAccess(req.headers, 'register');

    let body: {
      product?: string;
      commandTopic?: string;
      statusTopic?: string;
      availableCommands?: unknown[];
      app?: {
        name?: string;
        slug?: string;
        category?: string;
        description?: string;
        longDescription?: string;
        appUrl?: string;
        repositoryUrl?: string;
        deviceTargets?: string[];
        manifest?: Record<string, unknown>;
        defaultConfig?: Record<string, unknown>;
        visibility?: 'public' | 'private' | 'workspace' | 'unlisted';
      };
    };
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { product, commandTopic, statusTopic, availableCommands = [], app } = body;
    if (!product || !commandTopic || !statusTopic) {
      return NextResponse.json({ error: 'product, commandTopic, and statusTopic are required' }, { status: 400 });
    }
    if (!app?.name?.trim() || !app?.description?.trim()) {
      return NextResponse.json({ error: 'SDK app name and description are required' }, { status: 400 });
    }
    if (Array.isArray(app.deviceTargets) && app.deviceTargets.length === 0) {
      return NextResponse.json({ error: 'SDK app device targets are required' }, { status: 400 });
    }
    if (!hasValidManifest(app.manifest)) {
      return NextResponse.json({ error: 'Invalid SDK app manifest' }, { status: 400 });
    }
    const normalizedCommands = Array.isArray(availableCommands)
      ? availableCommands
          .filter((item): item is RegisterCommand => Boolean(item) && typeof item === 'object' && typeof (item as RegisterCommand).name === 'string')
          .map(command => ({
            name: command.name.trim(),
            description: command.description?.trim() || undefined,
          }))
      : [];
    const now = new Date().toISOString();

    const supabase = getSupabaseAdmin();
    const primary = await supabase
      .from('kernel_registry')
      .upsert({
        agent_id: ctx.agentId,
        workspace_id: ctx.workspaceId,
        product: String(product),
        command_topic: String(commandTopic),
        status_topic: String(statusTopic),
        available_commands: normalizedCommands,
        status: 'online',
        health_status: 'online',
        endpoint_status: 'healthy',
        version: typeof app?.manifest?.version === 'string' ? app.manifest.version : '1.0.0',
        disabled: false,
        registered_at: now,
        last_heartbeat_at: now,
        last_status_payload: {},
      }, { onConflict: 'agent_id,product' })
      .select()
      .single();
    const legacy = primary.error
      ? await supabase
        .from('kernel_registry')
        .upsert({
          agent_id: ctx.agentId,
          workspace_id: ctx.workspaceId,
          product: String(product),
          command_topic: String(commandTopic),
          status_topic: String(statusTopic),
          available_commands: normalizedCommands,
          status: 'online',
          registered_at: now,
          last_heartbeat_at: now,
          last_status_payload: {
            status: 'online',
            endpointStatus: 'healthy',
            version: typeof app?.manifest?.version === 'string' ? app.manifest.version : '1.0.0',
          },
        }, { onConflict: 'agent_id,product' })
        .select()
        .single()
      : { data: primary.data, error: primary.error };
    const compat = legacy.error
      ? await supabase
        .from('kernel_registry')
        .upsert({
          agent_id: ctx.agentId,
          product: String(product),
          command_topic: String(commandTopic),
          status_topic: String(statusTopic),
          available_commands: normalizedCommands,
          status: 'online',
          registered_at: now,
          last_heartbeat_at: now,
          last_status_payload: {
            status: 'online',
            endpointStatus: 'healthy',
            version: typeof app?.manifest?.version === 'string' ? app.manifest.version : '1.0.0',
          },
        }, { onConflict: 'agent_id,product' })
        .select()
        .single()
      : { data: legacy.data, error: legacy.error };

    if (compat.error) throw compat.error;

    const publisher = await findAccountById(ctx.agentId);
    const listing = await upsertExternalSdkAgentApp({
      workspaceId: ctx.workspaceId,
      publisherId: ctx.agentId,
      publisherName: publisher?.name ?? undefined,
      product: String(product),
      commandTopic: String(commandTopic),
      statusTopic: String(statusTopic),
      availableCommands: normalizedCommands,
      healthStatus: 'online',
      endpointStatus: 'healthy',
      app,
    });
    await appendLatestStudioEvent({
      ownerAgentId: ctx.agentId,
      type: 'sdk_app_registered',
      payload: { product: String(product), slug: listing.slug },
    });
    await appendLatestStudioEvent({
      ownerAgentId: ctx.agentId,
      type: 'app_discovered',
      payload: { product: String(product), slug: listing.slug },
    });

    return NextResponse.json({ registered: true, kernel: compat.data, app: listing });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
