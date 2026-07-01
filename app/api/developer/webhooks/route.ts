import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { readLocalRuntimeState, updateLocalRuntimeState } from '@/src/storage/local-state';
import { toErrorResponse, ValidationError } from '@/src/utils/errors';

export const runtime = 'nodejs';

type WebhookStatus = 'active' | 'disabled';

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim()) : [];
}

function maskSecret(value: string | null | undefined): string {
  if (!value) return 'not set';
  return value.length <= 8 ? '********' : `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function rowToWebhook(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name ?? 'Webhook'),
    callbackUrl: String(row.callback_url ?? row.callbackUrl ?? ''),
    secretMasked: String(row.secret_masked ?? row.secretMasked ?? 'not set'),
    events: stringArray(row.events),
    status: (row.status === 'disabled' ? 'disabled' : 'active') as WebhookStatus,
    failureCount: Number(row.failure_count ?? row.failureCount ?? 0),
    lastDeliveryAt: typeof (row.last_delivery_at ?? row.lastDeliveryAt) === 'string' ? String(row.last_delivery_at ?? row.lastDeliveryAt) : null,
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? new Date().toISOString()),
  };
}

function rowToLog(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    webhookId: String(row.webhook_id ?? row.webhookId),
    status: String(row.status ?? 'success'),
    event: String(row.event ?? 'unknown'),
    responseCode: typeof (row.response_code ?? row.responseCode) === 'number' ? Number(row.response_code ?? row.responseCode) : null,
    error: typeof row.error === 'string' ? row.error : null,
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
  };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'developer.webhooks');
    try {
      const supabase = getSupabaseAdmin();
      const [webhooksResult, logsResult] = await Promise.all([
        supabase
          .from('developer_webhooks')
          .select('*')
          .eq('owner_agent_id', ctx.agentId)
          .order('created_at', { ascending: false }),
        supabase
          .from('developer_webhook_logs')
          .select('*')
          .eq('owner_agent_id', ctx.agentId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (!webhooksResult.error && !logsResult.error) {
        return NextResponse.json({
          webhooks: ((webhooksResult.data ?? []) as Record<string, unknown>[]).map(rowToWebhook),
          logs: ((logsResult.data ?? []) as Record<string, unknown>[]).map(rowToLog),
        });
      }
    } catch {
      // Local fallback below.
    }

    const state = await readLocalRuntimeState();
    return NextResponse.json({
      webhooks: (state.developerWebhooks[ctx.agentId] ?? []).map(row => rowToWebhook(row as unknown as Record<string, unknown>)),
      logs: (state.developerWebhookLogs[ctx.agentId] ?? []).map(row => rowToLog(row as unknown as Record<string, unknown>)),
    });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'developer.webhooks');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const callbackUrl = typeof body.callbackUrl === 'string' ? body.callbackUrl.trim() : typeof body.callback_url === 'string' ? body.callback_url.trim() : '';
    if (!callbackUrl.startsWith('https://')) throw new ValidationError('Webhook callback URL must be HTTPS');
    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      owner_agent_id: ctx.agentId,
      name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Developer webhook',
      callback_url: callbackUrl,
      secret_masked: maskSecret(typeof body.secret === 'string' ? body.secret : null),
      events: stringArray(body.events).length ? stringArray(body.events) : ['app.published', 'skill.published'],
      status: body.status === 'disabled' ? 'disabled' : 'active',
      failure_count: 0,
      last_delivery_at: null,
      created_at: now,
      updated_at: now,
    };

    try {
      const { data, error } = await getSupabaseAdmin()
        .from('developer_webhooks')
        .insert(row)
        .select('*')
        .single();
      if (!error && data) return NextResponse.json({ webhook: rowToWebhook(data as Record<string, unknown>) }, { status: 201 });
    } catch {
      // Local fallback below.
    }

    const webhook = await updateLocalRuntimeState(state => {
      state.developerWebhooks[ctx.agentId] ??= [];
      state.developerWebhooks[ctx.agentId].unshift({
        id: row.id,
        ownerAgentId: ctx.agentId,
        name: row.name,
        callbackUrl: row.callback_url,
        secretMasked: row.secret_masked,
        events: row.events,
        status: row.status as WebhookStatus,
        failureCount: 0,
        lastDeliveryAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return state.developerWebhooks[ctx.agentId][0];
    });
    return NextResponse.json({ webhook: rowToWebhook(webhook as unknown as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'developer.webhooks');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) throw new ValidationError('Webhook id is required');
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof body.name === 'string') patch.name = body.name.trim();
    if (typeof body.callbackUrl === 'string' || typeof body.callback_url === 'string') {
      const callbackUrl = String(body.callbackUrl ?? body.callback_url).trim();
      if (!callbackUrl.startsWith('https://')) throw new ValidationError('Webhook callback URL must be HTTPS');
      patch.callback_url = callbackUrl;
    }
    if (Array.isArray(body.events)) patch.events = stringArray(body.events);
    if (body.status === 'active' || body.status === 'disabled') patch.status = body.status;
    if (typeof body.secret === 'string') patch.secret_masked = maskSecret(body.secret);

    try {
      const { data, error } = await getSupabaseAdmin()
        .from('developer_webhooks')
        .update(patch)
        .eq('id', id)
        .eq('owner_agent_id', ctx.agentId)
        .select('*')
        .single();
      if (!error && data) return NextResponse.json({ webhook: rowToWebhook(data as Record<string, unknown>) });
    } catch {
      // Local fallback below.
    }

    const webhook = await updateLocalRuntimeState(state => {
      const rows = state.developerWebhooks[ctx.agentId] ?? [];
      const index = rows.findIndex(item => item.id === id);
      if (index < 0) throw new ValidationError('Webhook not found');
      rows[index] = {
        ...rows[index],
        ...(typeof patch.name === 'string' ? { name: patch.name } : {}),
        ...(typeof patch.callback_url === 'string' ? { callbackUrl: patch.callback_url } : {}),
        ...(Array.isArray(patch.events) ? { events: patch.events as string[] } : {}),
        ...(patch.status === 'active' || patch.status === 'disabled' ? { status: patch.status } : {}),
        ...(typeof patch.secret_masked === 'string' ? { secretMasked: patch.secret_masked } : {}),
        updatedAt: String(patch.updated_at),
      };
      return rows[index];
    });
    return NextResponse.json({ webhook: rowToWebhook(webhook as unknown as Record<string, unknown>) });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'developer.webhooks');
    const id = new URL(request.url).searchParams.get('id') ?? '';
    if (!id) throw new ValidationError('Webhook id is required');
    try {
      const { error } = await getSupabaseAdmin()
        .from('developer_webhooks')
        .delete()
        .eq('id', id)
        .eq('owner_agent_id', ctx.agentId);
      if (!error) return NextResponse.json({ success: true });
    } catch {
      // Local fallback below.
    }
    await updateLocalRuntimeState(state => {
      state.developerWebhooks[ctx.agentId] = (state.developerWebhooks[ctx.agentId] ?? []).filter(item => item.id !== id);
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
