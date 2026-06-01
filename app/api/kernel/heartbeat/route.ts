import { NextRequest, NextResponse } from 'next/server';
import { findAccountById } from '@/src/auth/agent-store';
import { upsertExternalSdkAgentApp } from '@/src/appstore/service';
import { requireKernelRouteAccess } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { appendLatestStudioEvent } from '@/src/studio/persistence';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireKernelRouteAccess(req.headers, 'register');
    const body = await req.json().catch(() => ({})) as {
      product?: string;
      status?: string;
      endpointStatus?: string;
      lastError?: string | null;
      availableCommands?: Array<{ name: string; description?: string }>;
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
        visibility?: 'public' | 'private' | 'unlisted';
      };
    };

    if (!body.product || !String(body.product).trim()) {
      return NextResponse.json({ error: 'product is required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const healthStatus = body.status === 'offline' || body.status === 'degraded' || body.status === 'disabled' || body.status === 'unknown'
      ? body.status
      : 'online';
    const endpointStatus = body.endpointStatus === 'offline' || body.endpointStatus === 'degraded' || body.endpointStatus === 'disabled' || body.endpointStatus === 'unknown'
      ? body.endpointStatus
      : 'healthy';
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from('kernel_registry')
      .select('*')
      .eq('agent_id', ctx.agentId)
      .eq('product', String(body.product))
      .maybeSingle();
    if (!existing?.command_topic || !existing?.status_topic) {
      return NextResponse.json({ error: `Product "${String(body.product)}" is not registered` }, { status: 404 });
    }

    const availableCommands = Array.isArray(body.availableCommands) ? body.availableCommands : Array.isArray(existing?.available_commands) ? existing.available_commands : [];
    const primary = await supabase
      .from('kernel_registry')
      .upsert({
        agent_id: ctx.agentId,
        workspace_id: ctx.workspaceId,
        product: String(body.product),
        command_topic: String(existing?.command_topic ?? ''),
        status_topic: String(existing?.status_topic ?? ''),
        available_commands: availableCommands,
        status: healthStatus,
        health_status: healthStatus,
        endpoint_status: endpointStatus,
        version: typeof body.app?.manifest?.version === 'string' ? body.app.manifest.version : String(existing?.version ?? '1.0.0'),
        last_error: body.lastError ?? null,
        last_command_at: now,
        disabled: healthStatus === 'disabled',
        registered_at: String(existing?.registered_at ?? now),
        last_heartbeat_at: now,
        last_status_payload: {
          ...(typeof existing?.last_status_payload === 'object' && existing.last_status_payload ? existing.last_status_payload as Record<string, unknown> : {}),
          heartbeatAt: now,
          status: healthStatus,
          endpointStatus,
        },
      }, { onConflict: 'agent_id,product' })
      .select()
      .single();
    const legacy = primary.error
      ? await supabase
        .from('kernel_registry')
        .upsert({
          agent_id: ctx.agentId,
          workspace_id: ctx.workspaceId,
          product: String(body.product),
          command_topic: String(existing?.command_topic ?? ''),
          status_topic: String(existing?.status_topic ?? ''),
          available_commands: availableCommands,
          status: healthStatus,
          registered_at: String(existing?.registered_at ?? now),
          last_heartbeat_at: now,
          last_status_payload: {
            ...(typeof existing?.last_status_payload === 'object' && existing.last_status_payload ? existing.last_status_payload as Record<string, unknown> : {}),
            heartbeatAt: now,
            status: healthStatus,
            endpointStatus,
            lastError: body.lastError ?? null,
            version: typeof body.app?.manifest?.version === 'string' ? body.app.manifest.version : String(existing?.version ?? '1.0.0'),
          },
        }, { onConflict: 'agent_id,product' })
        .select()
        .single()
      : { data: primary.data, error: primary.error };
    if (legacy.error) throw legacy.error;

    const publisher = await findAccountById(ctx.agentId);
    const listing = await upsertExternalSdkAgentApp({
      workspaceId: ctx.workspaceId,
      publisherId: ctx.agentId,
      publisherName: publisher?.name ?? undefined,
      product: String(body.product),
      commandTopic: String(existing?.command_topic ?? ''),
      statusTopic: String(existing?.status_topic ?? ''),
      availableCommands: availableCommands.map((command: { name: string; description?: string }) => ({
        name: String(command.name),
        description: typeof command.description === 'string' ? command.description : undefined,
      })),
      healthStatus,
      endpointStatus,
      lastCommandAt: now,
      lastError: body.lastError ?? null,
      heartbeatCount: Number(existing?.heartbeat_count ?? 0) + 1,
      disabled: healthStatus === 'disabled',
      app: body.app,
    });

    await appendLatestStudioEvent({
      ownerAgentId: ctx.agentId,
      type: 'sdk_app_heartbeat',
      payload: { product: String(body.product), slug: listing.slug, status: healthStatus },
    });

    return NextResponse.json({ heartbeat: true, kernel: legacy.data, app: listing });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
