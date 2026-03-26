import crypto from 'crypto';
import { z } from 'zod';
import type { AgentContext } from '../../auth/permissions.js';
import { withAudit } from '../../runtime/audit.js';
import { getSupabaseAdmin } from '../../storage/supabase.js';
import { NotFoundError, PermissionError, ValidationError } from '../../utils/errors.js';
import { validate } from '../../utils/validation.js';
import { createXPost, fetchXMentions, fetchXUserPosts, getCurrentXUser } from './client.js';
import { decryptSecret, encryptSecret } from './crypto.js';
import { coerceXAccountPolicy, evaluateXDraftGuardrails } from './guardrails.js';
import { exchangeCodeForXTokens, refreshXAccessToken } from './oauth.js';
import type {
  XAccountConnectionRow,
  XAccountPolicy,
  XApprovalStatus,
  XDraftKind,
  XPostRecord,
  XTokenResponse,
  XUserProfile,
} from './types.js';

const accountConnectionIdSchema = z.string().uuid();
const draftIdSchema = z.string().uuid();
const queueIdSchema = z.string().uuid();
const isoDateStringSchema = z.string().min(1).refine(value => !Number.isNaN(new Date(value).getTime()), 'Must be a valid ISO-8601 date');

const draftCreateSchema = z.object({
  accountConnectionId: accountConnectionIdSchema,
  kind: z.enum(['post', 'reply']).default('post'),
  text: z.string().min(1).max(280),
  replyToPostId: z.string().min(1).max(64).optional(),
  sourceContext: z.record(z.unknown()).optional().default({}),
});

const queueScheduleSchema = z.object({
  draftId: draftIdSchema,
  scheduledFor: isoDateStringSchema,
});

const queueApproveSchema = z.object({
  draftId: draftIdSchema,
});

const publishNowSchema = z.object({
  draftId: draftIdSchema.optional(),
  queueId: queueIdSchema.optional(),
}).refine(value => Boolean(value.draftId || value.queueId), 'draftId or queueId is required');

const mentionsPullSchema = z.object({
  accountConnectionId: accountConnectionIdSchema,
  limit: z.number().int().min(1).max(100).optional().default(10),
});

const metricsSyncSchema = z.object({
  accountConnectionId: accountConnectionIdSchema,
  limit: z.number().int().min(1).max(100).optional().default(20),
});

function buildChildAgentId(username: string): string {
  const normalized = username.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'account';
  return `x_${normalized}_${crypto.randomUUID().slice(0, 8)}`;
}

function isSameUtcDay(left: Date, right: Date): boolean {
  return left.getUTCFullYear() === right.getUTCFullYear()
    && left.getUTCMonth() === right.getUTCMonth()
    && left.getUTCDate() === right.getUTCDate();
}

function toIsoOrNull(expiresInSeconds: number | undefined): string | null {
  if (!expiresInSeconds || !Number.isFinite(expiresInSeconds)) {
    return null;
  }
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

function parseScopeList(tokenResponse: XTokenResponse): string[] {
  return (tokenResponse.scope ?? '')
    .split(/\s+/)
    .map(scope => scope.trim())
    .filter(Boolean);
}

async function loadConnectionOrThrow(accountConnectionId: string): Promise<XAccountConnectionRow> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('x_account_connections')
    .select('*')
    .eq('id', accountConnectionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load X account connection: ${error.message}`);
  }

  if (!data) {
    throw new NotFoundError(`X account connection not found: ${accountConnectionId}`);
  }

  return data as XAccountConnectionRow;
}

function assertConnectionAccess(agentId: string, connection: XAccountConnectionRow): void {
  if (connection.owner_agent_id !== agentId && connection.child_agent_id !== agentId) {
    throw new PermissionError('This agent cannot access the requested X account connection');
  }
}

async function loadDraftOrThrow(draftId: string): Promise<Record<string, unknown>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('x_post_drafts')
    .select('*')
    .eq('id', draftId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load X draft: ${error.message}`);
  }

  if (!data) {
    throw new NotFoundError(`X draft not found: ${draftId}`);
  }

  return data as Record<string, unknown>;
}

async function loadQueueOrThrow(queueId: string): Promise<Record<string, unknown>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('x_publish_queue')
    .select('*')
    .eq('id', queueId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load X publish queue item: ${error.message}`);
  }

  if (!data) {
    throw new NotFoundError(`X publish queue item not found: ${queueId}`);
  }

  return data as Record<string, unknown>;
}

async function loadAccountPolicy(accountConnectionId: string): Promise<XAccountPolicy> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('x_account_policies')
    .select('*')
    .eq('account_connection_id', accountConnectionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load X account policy: ${error.message}`);
  }

  return coerceXAccountPolicy(data ?? {});
}

async function listOwnerConnections(ownerAgentId: string): Promise<XAccountConnectionRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('x_account_connections')
    .select('*')
    .eq('owner_agent_id', ownerAgentId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list X account connections: ${error.message}`);
  }

  return (data ?? []) as XAccountConnectionRow[];
}

async function loadRecentDraftTexts(ownerAgentId: string, accountConnectionId: string): Promise<{ own: string[]; cross: string[] }> {
  const connections = await listOwnerConnections(ownerAgentId);
  const connectionIds = connections.map(connection => connection.id);
  if (connectionIds.length === 0) {
    return { own: [], cross: [] };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('x_post_drafts')
    .select('account_connection_id, text')
    .in('account_connection_id', connectionIds)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to load recent X drafts: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  const own = rows
    .filter(row => row.account_connection_id === accountConnectionId)
    .map(row => String(row.text ?? ''))
    .filter(Boolean);
  const cross = rows
    .filter(row => row.account_connection_id !== accountConnectionId)
    .map(row => String(row.text ?? ''))
    .filter(Boolean);

  return { own, cross };
}

async function loadDailyPublishCounts(accountConnectionId: string): Promise<{ posts: number; replies: number }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('x_publish_queue')
    .select('kind, published_at, publish_status')
    .eq('account_connection_id', accountConnectionId)
    .eq('publish_status', 'published')
    .order('published_at', { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Failed to load X publish counts: ${error.message}`);
  }

  const today = new Date();
  let posts = 0;
  let replies = 0;

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const publishedAt = typeof row.published_at === 'string' ? new Date(row.published_at) : null;
    if (!publishedAt || Number.isNaN(publishedAt.getTime()) || !isSameUtcDay(today, publishedAt)) {
      continue;
    }

    if (row.kind === 'reply') {
      replies += 1;
    } else {
      posts += 1;
    }
  }

  return { posts, replies };
}

async function ensureOwnerCanApprove(agentId: string, connection: XAccountConnectionRow): Promise<void> {
  if (connection.owner_agent_id !== agentId) {
    throw new PermissionError('Only the owning agent can approve X drafts for publishing');
  }
}

async function createChildAgentForXAccount(ownerContext: AgentContext, user: XUserProfile): Promise<string> {
  const supabase = getSupabaseAdmin();
  const childAgentId = buildChildAgentId(user.username);

  const { error } = await supabase.from('agents').insert({
    id: childAgentId,
    name: `X Operator @${user.username}`,
    quotas: ownerContext.quotas,
    metadata: {
      parentAgentId: ownerContext.agentId,
      x_user_id: user.id,
      x_username: user.username,
      x_managed: true,
    },
  });

  if (error) {
    throw new Error(`Failed to create child agent for X account: ${error.message}`);
  }

  return childAgentId;
}

async function updateConnectionTokens(connectionId: string, tokenResponse: XTokenResponse, fallbackRefreshToken?: string): Promise<void> {
  const refreshToken = tokenResponse.refresh_token ?? fallbackRefreshToken;
  if (!refreshToken) {
    throw new ValidationError('X OAuth did not return a refresh token');
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('x_account_connections')
    .update({
      encrypted_access_token: encryptSecret(tokenResponse.access_token),
      encrypted_refresh_token: encryptSecret(refreshToken),
      access_token_expires_at: toIsoOrNull(tokenResponse.expires_in),
      status: 'active',
      scopes: parseScopeList(tokenResponse),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId);

  if (error) {
    throw new Error(`Failed to update X account tokens: ${error.message}`);
  }
}

async function resolveActiveAccessToken(connection: XAccountConnectionRow): Promise<string> {
  if (connection.status !== 'active') {
    throw new PermissionError('This X account connection is not active');
  }

  const hasStoredAccessToken = Boolean(connection.encrypted_access_token);
  const accessTokenExpiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
  const isAccessTokenFresh = hasStoredAccessToken && accessTokenExpiresAt > Date.now() + 60_000;

  if (isAccessTokenFresh && connection.encrypted_access_token) {
    return decryptSecret(connection.encrypted_access_token);
  }

  const refreshToken = decryptSecret(connection.encrypted_refresh_token);
  const refreshed = await refreshXAccessToken(refreshToken);
  await updateConnectionTokens(connection.id, refreshed, refreshToken);
  return refreshed.access_token;
}

function mapDraftApprovalStatus(guardrailStatus: string, requiresApproval: boolean): XApprovalStatus {
  if (guardrailStatus === 'rejected') return 'blocked';
  return requiresApproval ? 'required' : 'auto_approved';
}

export async function listXAccountsForAgent(agentId: string): Promise<Array<Record<string, unknown>>> {
  const supabase = getSupabaseAdmin();
  const ownerResult = await supabase
    .from('x_account_connections')
    .select('id, owner_agent_id, child_agent_id, x_user_id, username, display_name, status, last_sync_at, created_at, updated_at')
    .eq('owner_agent_id', agentId)
    .order('created_at', { ascending: false });

  const childResult = await supabase
    .from('x_account_connections')
    .select('id, owner_agent_id, child_agent_id, x_user_id, username, display_name, status, last_sync_at, created_at, updated_at')
    .eq('child_agent_id', agentId)
    .order('created_at', { ascending: false });

  if (ownerResult.error) {
    throw new Error(`Failed to list X accounts: ${ownerResult.error.message}`);
  }

  if (childResult.error) {
    throw new Error(`Failed to list X accounts: ${childResult.error.message}`);
  }

  const merged = new Map<string, Record<string, unknown>>();
  for (const row of [...(ownerResult.data ?? []), ...(childResult.data ?? [])] as Array<Record<string, unknown>>) {
    merged.set(String(row.id), row);
  }

  return [...merged.values()];
}

export async function connectXAccountFromOAuth(params: {
  ownerContext: AgentContext;
  code: string;
  codeVerifier: string;
}): Promise<Record<string, unknown>> {
  const tokenResponse = await exchangeCodeForXTokens({
    code: params.code,
    codeVerifier: params.codeVerifier,
  });

  if (!tokenResponse.refresh_token) {
    throw new ValidationError('X OAuth did not return a refresh token. Ensure offline access is enabled.');
  }

  const user = await getCurrentXUser(tokenResponse.access_token);
  const supabase = getSupabaseAdmin();
  const { data: existing, error: lookupError } = await supabase
    .from('x_account_connections')
    .select('*')
    .eq('owner_agent_id', params.ownerContext.agentId)
    .eq('x_user_id', user.id)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to check for an existing X connection: ${lookupError.message}`);
  }

  if (existing) {
    await updateConnectionTokens(String(existing.id), tokenResponse, tokenResponse.refresh_token);
    return {
      id: existing.id,
      childAgentId: existing.child_agent_id,
      username: user.username,
      displayName: user.name,
      status: 'active',
      reconnected: true,
    };
  }

  const childAgentId = await createChildAgentForXAccount(params.ownerContext, user);
  const connectionId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: insertError } = await supabase.from('x_account_connections').insert({
    id: connectionId,
    owner_agent_id: params.ownerContext.agentId,
    child_agent_id: childAgentId,
    x_user_id: user.id,
    username: user.username,
    display_name: user.name,
    scopes: parseScopeList(tokenResponse),
    encrypted_refresh_token: encryptSecret(tokenResponse.refresh_token),
    encrypted_access_token: encryptSecret(tokenResponse.access_token),
    access_token_expires_at: toIsoOrNull(tokenResponse.expires_in),
    status: 'active',
    last_sync_at: null,
    created_at: now,
    updated_at: now,
  });

  if (insertError) {
    throw new Error(`Failed to store X account connection: ${insertError.message}`);
  }

  const { error: policyError } = await supabase.from('x_account_policies').insert({
    id: crypto.randomUUID(),
    account_connection_id: connectionId,
    posting_enabled: true,
    approval_required_for_posts: true,
    approval_required_for_replies: true,
    max_posts_per_day: 4,
    max_replies_per_day: 10,
    allowed_hours: [],
    blocked_topics: [],
    tone_profile: {},
    created_at: now,
    updated_at: now,
  });

  if (policyError) {
    throw new Error(`Failed to create X account policy: ${policyError.message}`);
  }

  return {
    id: connectionId,
    childAgentId,
    username: user.username,
    displayName: user.name,
    status: 'active',
    reconnected: false,
  };
}

async function getGuardrailContext(connection: XAccountConnectionRow): Promise<{
  policy: XAccountPolicy;
  recentOwnTexts: string[];
  recentCrossTexts: string[];
  publishedToday: { posts: number; replies: number };
}> {
  const [policy, recentDrafts, publishedToday] = await Promise.all([
    loadAccountPolicy(connection.id),
    loadRecentDraftTexts(connection.owner_agent_id, connection.id),
    loadDailyPublishCounts(connection.id),
  ]);

  return {
    policy,
    recentOwnTexts: recentDrafts.own,
    recentCrossTexts: recentDrafts.cross,
    publishedToday,
  };
}

export async function xAccountsList(ctx: AgentContext, input: unknown): Promise<{ accounts: Array<Record<string, unknown>> }> {
  validate(z.object({}).passthrough(), input ?? {});

  return withAudit({
    agentId: ctx.agentId,
    primitive: 'x',
    operation: 'accounts_list',
  }, async () => {
    const accounts = await listXAccountsForAgent(ctx.agentId);
    return { accounts };
  });
}

export async function xDraftCreate(ctx: AgentContext, input: unknown): Promise<Record<string, unknown>> {
  const parsed = validate(draftCreateSchema, input);

  return withAudit({
    agentId: ctx.agentId,
    primitive: 'x',
    operation: 'draft_create',
    metadata: { accountConnectionId: parsed.accountConnectionId, kind: parsed.kind },
  }, async () => {
    const connection = await loadConnectionOrThrow(parsed.accountConnectionId);
    assertConnectionAccess(ctx.agentId, connection);

    const { policy, recentOwnTexts, recentCrossTexts, publishedToday } = await getGuardrailContext(connection);
    const guardrail = evaluateXDraftGuardrails({
      text: parsed.text,
      kind: parsed.kind,
      policy,
      ownRecentDraftTexts: recentOwnTexts,
      crossAccountRecentTexts: recentCrossTexts,
      postsPublishedToday: publishedToday.posts,
      repliesPublishedToday: publishedToday.replies,
    });

    const draftId = crypto.randomUUID();
    const now = new Date().toISOString();
    const approvalStatus = mapDraftApprovalStatus(guardrail.status, guardrail.requiresApproval);
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('x_post_drafts').insert({
      id: draftId,
      account_connection_id: connection.id,
      author_agent_id: ctx.agentId,
      kind: parsed.kind,
      text: parsed.text,
      reply_to_post_id: parsed.replyToPostId ?? null,
      media_refs: [],
      source_context: parsed.sourceContext,
      guardrail_status: guardrail.status,
      guardrail_reasons: guardrail.reasons,
      similarity_score: guardrail.similarityScore,
      approval_status: approvalStatus,
      created_at: now,
      updated_at: now,
    });

    if (error) {
      throw new Error(`Failed to store X draft: ${error.message}`);
    }

    return {
      draftId,
      accountConnectionId: connection.id,
      childAgentId: connection.child_agent_id,
      guardrailStatus: guardrail.status,
      approvalStatus,
      requiresApproval: guardrail.requiresApproval,
      guardrailReasons: guardrail.reasons,
      similarityScore: guardrail.similarityScore,
    };
  });
}

export async function xQueueSchedule(ctx: AgentContext, input: unknown): Promise<Record<string, unknown>> {
  const parsed = validate(queueScheduleSchema, input);

  return withAudit({
    agentId: ctx.agentId,
    primitive: 'x',
    operation: 'queue_schedule',
    metadata: { draftId: parsed.draftId },
  }, async () => {
    const draft = await loadDraftOrThrow(parsed.draftId);
    const connection = await loadConnectionOrThrow(String(draft.account_connection_id));
    assertConnectionAccess(ctx.agentId, connection);

    const scheduledFor = new Date(parsed.scheduledFor);
    const { policy, recentOwnTexts, recentCrossTexts, publishedToday } = await getGuardrailContext(connection);
    const guardrail = evaluateXDraftGuardrails({
      text: String(draft.text ?? ''),
      kind: String(draft.kind ?? 'post') as XDraftKind,
      scheduledFor,
      policy,
      ownRecentDraftTexts: recentOwnTexts,
      crossAccountRecentTexts: recentCrossTexts,
      postsPublishedToday: publishedToday.posts,
      repliesPublishedToday: publishedToday.replies,
    });

    if (guardrail.status === 'rejected') {
      throw new ValidationError(guardrail.reasons.join(' '));
    }

    const queueId = crypto.randomUUID();
    const now = new Date().toISOString();
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('x_publish_queue').insert({
      id: queueId,
      draft_id: draft.id,
      account_connection_id: connection.id,
      kind: draft.kind,
      text_snapshot: draft.text,
      scheduled_for: scheduledFor.toISOString(),
      publish_status: 'queued',
      attempt_count: 0,
      last_error: null,
      published_post_id: null,
      published_at: null,
      created_at: now,
      updated_at: now,
    });

    if (error) {
      throw new Error(`Failed to queue X draft for publishing: ${error.message}`);
    }

    return {
      queueId,
      draftId: draft.id,
      scheduledFor: scheduledFor.toISOString(),
      approvalStatus: draft.approval_status,
    };
  });
}

export async function xQueueApprove(ctx: AgentContext, input: unknown): Promise<Record<string, unknown>> {
  const parsed = validate(queueApproveSchema, input);

  return withAudit({
    agentId: ctx.agentId,
    primitive: 'x',
    operation: 'queue_approve',
    metadata: { draftId: parsed.draftId },
  }, async () => {
    const draft = await loadDraftOrThrow(parsed.draftId);
    const connection = await loadConnectionOrThrow(String(draft.account_connection_id));
    await ensureOwnerCanApprove(ctx.agentId, connection);

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('x_post_drafts')
      .update({
        approval_status: 'approved',
        updated_at: new Date().toISOString(),
      })
      .eq('id', draft.id);

    if (error) {
      throw new Error(`Failed to approve X draft: ${error.message}`);
    }

    return {
      draftId: draft.id,
      approved: true,
      accountConnectionId: connection.id,
    };
  });
}

export async function xMentionsPull(ctx: AgentContext, input: unknown): Promise<Record<string, unknown>> {
  const parsed = validate(mentionsPullSchema, input);

  return withAudit({
    agentId: ctx.agentId,
    primitive: 'x',
    operation: 'mentions_pull',
    metadata: { accountConnectionId: parsed.accountConnectionId, limit: parsed.limit },
  }, async () => {
    const connection = await loadConnectionOrThrow(parsed.accountConnectionId);
    assertConnectionAccess(ctx.agentId, connection);

    const accessToken = await resolveActiveAccessToken(connection);
    const mentions = await fetchXMentions(accessToken, connection.x_user_id, parsed.limit);
    const now = new Date().toISOString();
    const supabase = getSupabaseAdmin();

    if (mentions.length > 0) {
      const rows = mentions.map(mention => ({
        id: crypto.randomUUID(),
        account_connection_id: connection.id,
        x_post_id: mention.id,
        author_username: null,
        kind: 'mention',
        raw_payload: mention,
        classification: null,
        priority: 0,
        handled: false,
        created_at: mention.createdAt ?? now,
      }));

      const { error } = await supabase.from('x_inbox_items').upsert(rows, {
        onConflict: 'account_connection_id,x_post_id',
        ignoreDuplicates: false,
      });

      if (error) {
        throw new Error(`Failed to store X mentions: ${error.message}`);
      }
    }

    const { error: updateError } = await supabase
      .from('x_account_connections')
      .update({ last_sync_at: now, updated_at: now })
      .eq('id', connection.id);

    if (updateError) {
      throw new Error(`Failed to update X sync timestamp: ${updateError.message}`);
    }

    return {
      accountConnectionId: connection.id,
      mentions,
      syncedAt: now,
    };
  });
}

export async function xPublishNow(ctx: AgentContext, input: unknown): Promise<Record<string, unknown>> {
  const parsed = validate(publishNowSchema, input);

  return withAudit({
    agentId: ctx.agentId,
    primitive: 'x',
    operation: 'publish_now',
    metadata: { draftId: parsed.draftId ?? null, queueId: parsed.queueId ?? null },
  }, async () => {
    const queue = parsed.queueId ? await loadQueueOrThrow(parsed.queueId) : null;
    const draft = await loadDraftOrThrow(String(queue?.draft_id ?? parsed.draftId));
    const connection = await loadConnectionOrThrow(String(draft.account_connection_id));
    assertConnectionAccess(ctx.agentId, connection);

    if (draft.guardrail_status === 'rejected') {
      throw new PermissionError('Rejected X drafts cannot be published');
    }

    if (draft.approval_status === 'required') {
      throw new PermissionError('X draft must be approved before publishing');
    }

    if (draft.approval_status === 'blocked') {
      throw new PermissionError('Blocked X drafts cannot be published');
    }

    const policy = await loadAccountPolicy(connection.id);
    if (!policy.postingEnabled) {
      throw new PermissionError('Posting is disabled for this X account');
    }

    const accessToken = await resolveActiveAccessToken(connection);
    const published = await createXPost(accessToken, {
      text: String(draft.text ?? ''),
      replyToPostId: typeof draft.reply_to_post_id === 'string' ? draft.reply_to_post_id : undefined,
    });

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    if (queue) {
      const { error: queueError } = await supabase
        .from('x_publish_queue')
        .update({
          publish_status: 'published',
          attempt_count: Number(queue.attempt_count ?? 0) + 1,
          published_post_id: published.id,
          published_at: now,
          last_error: null,
          updated_at: now,
        })
        .eq('id', queue.id);

      if (queueError) {
        throw new Error(`Failed to update X publish queue row: ${queueError.message}`);
      }
    } else {
      const { error: queueInsertError } = await supabase.from('x_publish_queue').insert({
        id: crypto.randomUUID(),
        draft_id: draft.id,
        account_connection_id: connection.id,
        kind: draft.kind,
        text_snapshot: draft.text,
        scheduled_for: now,
        publish_status: 'published',
        attempt_count: 1,
        last_error: null,
        published_post_id: published.id,
        published_at: now,
        created_at: now,
        updated_at: now,
      });

      if (queueInsertError) {
        throw new Error(`Failed to record immediate X publish: ${queueInsertError.message}`);
      }
    }

    return {
      accountConnectionId: connection.id,
      draftId: draft.id,
      queueId: queue?.id ?? null,
      postId: published.id,
      text: published.text,
      publishedAt: now,
    };
  });
}

export async function xMetricsSync(ctx: AgentContext, input: unknown): Promise<Record<string, unknown>> {
  const parsed = validate(metricsSyncSchema, input);

  return withAudit({
    agentId: ctx.agentId,
    primitive: 'x',
    operation: 'metrics_sync',
    metadata: { accountConnectionId: parsed.accountConnectionId, limit: parsed.limit },
  }, async () => {
    const connection = await loadConnectionOrThrow(parsed.accountConnectionId);
    assertConnectionAccess(ctx.agentId, connection);

    const accessToken = await resolveActiveAccessToken(connection);
    const posts = await fetchXUserPosts(accessToken, connection.x_user_id, parsed.limit);
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    if (posts.length > 0) {
      const rows = posts.map((post: XPostRecord) => ({
        account_connection_id: connection.id,
        x_post_id: post.id,
        posted_at: post.createdAt ?? now,
        public_metrics: post.publicMetrics ?? {},
        organic_metrics: post.organicMetrics ?? {},
        non_public_metrics: post.nonPublicMetrics ?? {},
        synced_at: now,
      }));

      const { error } = await supabase.from('x_post_metrics').upsert(rows, {
        onConflict: 'account_connection_id,x_post_id',
        ignoreDuplicates: false,
      });

      if (error) {
        throw new Error(`Failed to upsert X post metrics: ${error.message}`);
      }
    }

    const { error: connectionError } = await supabase
      .from('x_account_connections')
      .update({ last_sync_at: now, updated_at: now })
      .eq('id', connection.id);

    if (connectionError) {
      throw new Error(`Failed to update X connection after metrics sync: ${connectionError.message}`);
    }

    return {
      accountConnectionId: connection.id,
      syncedAt: now,
      syncedPosts: posts.length,
      posts,
    };
  });
}
function normalizeListLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.max(1, Math.min(Number(limit), 100));
}

async function listAccessibleConnectionMap(agentId: string): Promise<Map<string, Record<string, unknown>>> {
  const accounts = await listXAccountsForAgent(agentId);
  const map = new Map<string, Record<string, unknown>>();
  for (const account of accounts) {
    map.set(String(account.id), account);
  }
  return map;
}

export async function listXDraftsForAgent(agentId: string, options?: {
  accountConnectionId?: string;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const connectionMap = await listAccessibleConnectionMap(agentId);
  const requestedConnectionId = options?.accountConnectionId;

  if (requestedConnectionId && !connectionMap.has(requestedConnectionId)) {
    throw new PermissionError('This agent cannot access the requested X account drafts');
  }

  const connectionIds = requestedConnectionId
    ? [requestedConnectionId]
    : [...connectionMap.keys()];

  if (connectionIds.length === 0) {
    return [];
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('x_post_drafts')
    .select('*')
    .in('account_connection_id', connectionIds)
    .order('created_at', { ascending: false })
    .limit(normalizeListLimit(options?.limit));

  if (error) {
    throw new Error(`Failed to list X drafts: ${error.message}`);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    ...row,
    account: connectionMap.get(String(row.account_connection_id)) ?? null,
    guardrail_reasons: Array.isArray(row.guardrail_reasons) ? row.guardrail_reasons : [],
    similarity_score: typeof row.similarity_score === 'number' ? row.similarity_score : Number(row.similarity_score ?? 0),
  }));
}

export async function listXQueueItemsForAgent(agentId: string, options?: {
  accountConnectionId?: string;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const connectionMap = await listAccessibleConnectionMap(agentId);
  const requestedConnectionId = options?.accountConnectionId;

  if (requestedConnectionId && !connectionMap.has(requestedConnectionId)) {
    throw new PermissionError('This agent cannot access the requested X publish queue');
  }

  const connectionIds = requestedConnectionId
    ? [requestedConnectionId]
    : [...connectionMap.keys()];

  if (connectionIds.length === 0) {
    return [];
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('x_publish_queue')
    .select('*')
    .in('account_connection_id', connectionIds)
    .order('scheduled_for', { ascending: true })
    .limit(normalizeListLimit(options?.limit));

  if (error) {
    throw new Error(`Failed to list X publish queue items: ${error.message}`);
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    ...row,
    account: connectionMap.get(String(row.account_connection_id)) ?? null,
  }));
}

export async function blockXDraftForAgent(agentId: string, draftId: string, reason = 'Blocked by operator'): Promise<Record<string, unknown>> {
  const draft = await loadDraftOrThrow(draftId);
  const connection = await loadConnectionOrThrow(String(draft.account_connection_id));
  await ensureOwnerCanApprove(agentId, connection);

  const existingReasons = Array.isArray(draft.guardrail_reasons)
    ? draft.guardrail_reasons.map(value => String(value))
    : [];
  const nextReasons = [...existingReasons, reason].filter(Boolean);
  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();

  const { error: draftError } = await supabase
    .from('x_post_drafts')
    .update({
      approval_status: 'blocked',
      guardrail_status: 'rejected',
      guardrail_reasons: nextReasons,
      updated_at: now,
    })
    .eq('id', draftId);

  if (draftError) {
    throw new Error(`Failed to block X draft: ${draftError.message}`);
  }

  const { data: queueRows, error: queueLookupError } = await supabase
    .from('x_publish_queue')
    .select('id, publish_status')
    .eq('draft_id', draftId);

  if (queueLookupError) {
    throw new Error(`Failed to load queued publishes for blocked draft: ${queueLookupError.message}`);
  }

  let canceledQueueItems = 0;
  for (const row of (queueRows ?? []) as Array<Record<string, unknown>>) {
    if (!['queued', 'publishing'].includes(String(row.publish_status ?? ''))) {
      continue;
    }

    const { error: queueError } = await supabase
      .from('x_publish_queue')
      .update({
        publish_status: 'canceled',
        last_error: reason,
        updated_at: now,
      })
      .eq('id', row.id);

    if (queueError) {
      throw new Error(`Failed to cancel queued X publish: ${queueError.message}`);
    }

    canceledQueueItems += 1;
  }

  return {
    draftId,
    blocked: true,
    canceledQueueItems,
    reason,
  };
}