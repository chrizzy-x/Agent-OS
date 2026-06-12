import crypto from 'crypto';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { redactSecretsDeep } from '../security/secret-redaction.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

export type NotificationRecord = {
  id: string;
  agentId: string;
  workspaceId: string | null;
  sessionId: string | null;
  executionId: string | null;
  type: string;
  title: string;
  body: string;
  status: 'unread' | 'read' | 'archived';
  metadata: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mapNotification(row: Record<string, unknown>): NotificationRecord {
  return {
    id: String(row.id),
    agentId: String(row.agent_id),
    workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : null,
    sessionId: typeof row.session_id === 'string' ? row.session_id : null,
    executionId: typeof row.execution_id === 'string' ? row.execution_id : null,
    type: String(row.type ?? 'system'),
    title: String(row.title ?? 'Notification'),
    body: String(row.body ?? ''),
    status: String(row.status ?? 'unread') as NotificationRecord['status'],
    metadata: asRecord(row.metadata),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    readAt: typeof row.read_at === 'string' ? row.read_at : null,
  };
}

export async function createNotification(params: {
  agentId: string;
  workspaceId?: string | null;
  sessionId?: string | null;
  executionId?: string | null;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}): Promise<NotificationRecord> {
  if (!params.title.trim()) throw new ValidationError('notification title is required');
  const { data, error } = await getSupabaseAdmin()
    .from('agent_notifications')
    .insert({
      id: crypto.randomUUID(),
      agent_id: params.agentId,
      workspace_id: params.workspaceId ?? null,
      session_id: params.sessionId ?? null,
      execution_id: params.executionId ?? null,
      type: params.type.trim() || 'system',
      title: params.title.trim().slice(0, 200),
      body: params.body.trim().slice(0, 2000),
      status: 'unread',
      metadata: redactSecretsDeep(params.metadata ?? {}) as Record<string, unknown>,
      created_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create notification: ${error.message}`);
  return mapNotification(data as Record<string, unknown>);
}

export async function listNotifications(params: {
  agentId: string;
  status?: NotificationRecord['status'] | 'all';
  limit?: number;
}): Promise<NotificationRecord[]> {
  let query = getSupabaseAdmin()
    .from('agent_notifications')
    .select('*')
    .eq('agent_id', params.agentId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(params.limit ?? 50, 200)));

  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list notifications: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapNotification);
}

export async function updateNotification(params: {
  agentId: string;
  notificationId: string;
  status: NotificationRecord['status'];
}): Promise<NotificationRecord> {
  const { data, error } = await getSupabaseAdmin()
    .from('agent_notifications')
    .update({
      status: params.status,
      read_at: params.status === 'read' ? new Date().toISOString() : null,
    })
    .eq('id', params.notificationId)
    .eq('agent_id', params.agentId)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Failed to update notification: ${error.message}`);
  if (!data) throw new NotFoundError('Notification not found');
  return mapNotification(data as Record<string, unknown>);
}
