import { NextRequest, NextResponse } from 'next/server';
import { findAccountById } from '@/src/auth/agent-store';
import { upsertExternalSdkAgentApp } from '@/src/appstore/service';
import { requireKernelRouteAccess } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

type RegisterCommand = {
  name: string;
  description?: string;
};

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
        visibility?: 'public' | 'private' | 'unlisted';
      };
    };
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { product, commandTopic, statusTopic, availableCommands = [], app } = body;
    if (!product || !commandTopic || !statusTopic) {
      return NextResponse.json({ error: 'product, commandTopic, and statusTopic are required' }, { status: 400 });
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
    const { data, error } = await supabase
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
        last_status_payload: {},
      }, { onConflict: 'agent_id,product' })
      .select()
      .single();

    if (error) throw error;

    const publisher = await findAccountById(ctx.agentId);
    const listing = await upsertExternalSdkAgentApp({
      workspaceId: ctx.workspaceId,
      publisherId: ctx.agentId,
      publisherName: publisher?.name ?? undefined,
      product: String(product),
      commandTopic: String(commandTopic),
      statusTopic: String(statusTopic),
      availableCommands: normalizedCommands,
      app,
    });

    return NextResponse.json({ registered: true, kernel: data, app: listing });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
