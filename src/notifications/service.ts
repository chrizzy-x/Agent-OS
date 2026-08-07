import crypto from 'crypto';
import { getSupabaseAdmin, withSupabaseQueryTimeout } from '../storage/supabase.js';
import { readLocalRuntimeState, updateLocalRuntimeState } from '../storage/local-state.js';
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
const NOTIFICATION_QUERY_TIMEOUT_MS = 8_000;

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

function consolidationKey(item: NotificationRecord): string {
  const type = item.type.toLowerCase();
  if (type.includes('security') || type.includes('auth') || type.includes('token') || type.includes('session')) {
    return item.id;
  }
  return [
    item.type,
    item.title,
    item.body,
    item.workspaceId ?? '',
    item.sessionId ?? '',
    item.executionId ?? '',
    String(item.metadata.deepLink ?? item.metadata.href ?? item.metadata.navigateTo ?? item.metadata.actionHref ?? ''),
  ].join('\u001f');
}

export function consolidateNotifications(notifications: NotificationRecord[]): NotificationRecord[] {
  const byKey = new Map<string, NotificationRecord & { metadata: Record<string, unknown> }>();
  for (const item of notifications) {
    const key = consolidationKey(item);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, item);
      continue;
    }
    const currentTime = Date.parse(current.createdAt);
    const nextTime = Date.parse(item.createdAt);
    const latest = Number.isFinite(nextTime) && (!Number.isFinite(currentTime) || nextTime > currentTime) ? item : current;
    const count = Number(current.metadata.consolidatedCount ?? 1) + 1;
    byKey.set(key, {
      ...latest,
      status: current.status === 'unread' || item.status === 'unread' ? 'unread' : latest.status,
      metadata: {
        ...latest.metadata,
        consolidatedCount: count,
      },
    });
  }
  return [...byKey.values()].sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
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
  const row: Record<string, unknown> = {
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
    read_at: null,
  };

  try {
    const { data, error } = await withSupabaseQueryTimeout(getSupabaseAdmin()
      .from('agent_notifications')
      .insert(row)
      .select('*')
      .single(), NOTIFICATION_QUERY_TIMEOUT_MS);

    if (!error && data) return mapNotification(data as Record<string, unknown>);
  } catch {
    // Fall through to local state.
  }

  return updateLocalRuntimeState(state => {
    state.notifications = [row, ...state.notifications.filter(item => String(item.id) !== String(row.id))];
    return mapNotification(row);
  });
}

export async function listNotifications(params: {
  agentId: string;
  status?: NotificationRecord['status'] | 'all';
  limit?: number;
}): Promise<NotificationRecord[]> {
  try {
    let query = getSupabaseAdmin()
      .from('agent_notifications')
      .select('*')
      .eq('agent_id', params.agentId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(params.limit ?? 50, 200)));

    if (params.status && params.status !== 'all') {
      query = query.eq('status', params.status);
    }

    const { data, error } = await withSupabaseQueryTimeout(query, NOTIFICATION_QUERY_TIMEOUT_MS);
    if (!error) return consolidateNotifications(((data ?? []) as Record<string, unknown>[]).map(mapNotification));
  } catch {
    // Fall through to local state.
  }

  const state = await readLocalRuntimeState();
  return consolidateNotifications(state.notifications
    .filter(item => String(item.agent_id) === params.agentId)
    .filter(item => !params.status || params.status === 'all' || item.status === params.status)
    .sort((left, right) => String(right.created_at ?? '').localeCompare(String(left.created_at ?? '')))
    .slice(0, Math.max(1, Math.min(params.limit ?? 50, 200)))
    .map(mapNotification));
}

export async function updateNotification(params: {
  agentId: string;
  notificationId: string;
  status: NotificationRecord['status'];
}): Promise<NotificationRecord> {
  const patch = {
    status: params.status,
    read_at: params.status === 'read' ? new Date().toISOString() : null,
  };
  try {
    const { data, error } = await withSupabaseQueryTimeout(getSupabaseAdmin()
      .from('agent_notifications')
      .update(patch)
      .eq('id', params.notificationId)
      .eq('agent_id', params.agentId)
      .select('*')
      .maybeSingle(), NOTIFICATION_QUERY_TIMEOUT_MS);

    if (!error && data) return mapNotification(data as Record<string, unknown>);
  } catch {
    // Fall through to local state.
  }

  return updateLocalRuntimeState(state => {
    const index = state.notifications.findIndex(item =>
      String(item.id) === params.notificationId
      && String(item.agent_id) === params.agentId,
    );
    if (index < 0) throw new NotFoundError('Notification not found');
    state.notifications[index] = { ...state.notifications[index], ...patch };
    return mapNotification(state.notifications[index]);
  });
}

export async function markAllNotificationsRead(params: {
  agentId: string;
}): Promise<{ updated: number }> {
  const readAt = new Date().toISOString();
  try {
    const { data, error } = await withSupabaseQueryTimeout(getSupabaseAdmin()
      .from('agent_notifications')
      .update({ status: 'read', read_at: readAt })
      .eq('agent_id', params.agentId)
      .eq('status', 'unread')
      .select('id'), NOTIFICATION_QUERY_TIMEOUT_MS);

    if (!error) return { updated: (data ?? []).length };
  } catch {
    // Fall through to local state.
  }

  return updateLocalRuntimeState(state => {
    let updated = 0;
    state.notifications = state.notifications.map(item => {
      if (String(item.agent_id) !== params.agentId || item.status !== 'unread') return item;
      updated += 1;
      return { ...item, status: 'read', read_at: readAt };
    });
    return { updated };
  });
}
