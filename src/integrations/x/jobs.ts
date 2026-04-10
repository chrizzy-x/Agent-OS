import { DEFAULT_QUOTAS, type AgentContext } from '../../auth/permissions.js';
import { getSupabaseAdmin } from '../../storage/supabase.js';
import { xMentionsPull, xMetricsSync, xPublishNow } from './service.js';

function buildSystemContext(agentId: string): AgentContext {
  return {
    agentId,
    allowedDomains: [],
    quotas: DEFAULT_QUOTAS,
    tier: 'free',
  };
}

async function loadActiveConnection(accountConnectionId: string): Promise<Record<string, unknown> | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('x_account_connections')
    .select('id, child_agent_id, username, status, last_sync_at')
    .eq('id', accountConnectionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load X account connection for cron job: ${error.message}`);
  }

  return data as Record<string, unknown> | null;
}

export async function runXPublishCron(limit = 10): Promise<Record<string, unknown>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('x_publish_queue')
    .select('id, account_connection_id, attempt_count, scheduled_for')
    .eq('publish_status', 'queued')
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load queued X publishes: ${error.message}`);
  }

  const now = Date.now();
  const dueItems = ((data ?? []) as Array<Record<string, unknown>>)
    .filter(row => {
      const scheduledFor = typeof row.scheduled_for === 'string' ? new Date(row.scheduled_for).getTime() : Number.NaN;
      return Number.isFinite(scheduledFor) && scheduledFor <= now;
    });

  const outcomes: Array<Record<string, unknown>> = [];
  let published = 0;
  let failed = 0;

  for (const item of dueItems) {
    const queueId = String(item.id);
    const connection = await loadActiveConnection(String(item.account_connection_id));
    if (!connection || connection.status !== 'active') {
      await supabase
        .from('x_publish_queue')
        .update({
          publish_status: 'failed',
          last_error: 'X account connection is missing or inactive',
          updated_at: new Date().toISOString(),
        })
        .eq('id', queueId);
      failed += 1;
      outcomes.push({ queueId, status: 'failed', error: 'inactive_connection' });
      continue;
    }

    await supabase
      .from('x_publish_queue')
      .update({ publish_status: 'publishing', updated_at: new Date().toISOString() })
      .eq('id', queueId);

    try {
      const result = await xPublishNow(buildSystemContext(String(connection.child_agent_id)), { queueId });
      published += 1;
      outcomes.push({ queueId, status: 'published', result });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : 'X publish failed';
      await supabase
        .from('x_publish_queue')
        .update({
          publish_status: 'failed',
          attempt_count: Number(item.attempt_count ?? 0) + 1,
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', queueId);
      outcomes.push({ queueId, status: 'failed', error: message });
    }
  }

  return {
    processed: dueItems.length,
    published,
    failed,
    outcomes,
  };
}

async function listConnectionsForSync(limit: number): Promise<Array<Record<string, unknown>>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('x_account_connections')
    .select('id, child_agent_id, username, status, last_sync_at')
    .eq('status', 'active')
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list X account connections for sync: ${error.message}`);
  }

  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function runXMentionsCron(limit = 10, mentionsPerAccount = 20): Promise<Record<string, unknown>> {
  const connections = await listConnectionsForSync(limit);
  const results: Array<Record<string, unknown>> = [];
  let succeeded = 0;
  let failed = 0;

  for (const connection of connections) {
    try {
      const result = await xMentionsPull(buildSystemContext(String(connection.child_agent_id)), {
        accountConnectionId: connection.id,
        limit: mentionsPerAccount,
      });
      succeeded += 1;
      results.push({ accountConnectionId: connection.id, username: connection.username, status: 'ok', result });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : 'X mentions sync failed';
      results.push({ accountConnectionId: connection.id, username: connection.username, status: 'failed', error: message });
    }
  }

  return {
    processed: connections.length,
    succeeded,
    failed,
    results,
  };
}

export async function runXMetricsCron(limit = 10, postsPerAccount = 20): Promise<Record<string, unknown>> {
  const connections = await listConnectionsForSync(limit);
  const results: Array<Record<string, unknown>> = [];
  let succeeded = 0;
  let failed = 0;

  for (const connection of connections) {
    try {
      const result = await xMetricsSync(buildSystemContext(String(connection.child_agent_id)), {
        accountConnectionId: connection.id,
        limit: postsPerAccount,
      });
      succeeded += 1;
      results.push({ accountConnectionId: connection.id, username: connection.username, status: 'ok', result });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : 'X metrics sync failed';
      results.push({ accountConnectionId: connection.id, username: connection.username, status: 'failed', error: message });
    }
  }

  return {
    processed: connections.length,
    succeeded,
    failed,
    results,
  };
}