-- AgentOS Migration 008: X account management foundation
-- Adds server-side tables for OAuth connections, drafts, queueing, inbox sync, and metrics.

CREATE TABLE IF NOT EXISTS x_account_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  child_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  x_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT,
  scopes JSONB NOT NULL DEFAULT '[]'::JSONB,
  encrypted_refresh_token TEXT NOT NULL,
  encrypted_access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_agent_id, x_user_id)
);

CREATE INDEX IF NOT EXISTS x_account_connections_owner_agent_idx
  ON x_account_connections(owner_agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS x_account_connections_child_agent_idx
  ON x_account_connections(child_agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS x_account_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_connection_id UUID NOT NULL REFERENCES x_account_connections(id) ON DELETE CASCADE,
  posting_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  approval_required_for_posts BOOLEAN NOT NULL DEFAULT TRUE,
  approval_required_for_replies BOOLEAN NOT NULL DEFAULT TRUE,
  max_posts_per_day INTEGER NOT NULL DEFAULT 4,
  max_replies_per_day INTEGER NOT NULL DEFAULT 10,
  allowed_hours JSONB NOT NULL DEFAULT '[]'::JSONB,
  blocked_topics JSONB NOT NULL DEFAULT '[]'::JSONB,
  tone_profile JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_connection_id)
);

CREATE TABLE IF NOT EXISTS x_post_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_connection_id UUID NOT NULL REFERENCES x_account_connections(id) ON DELETE CASCADE,
  author_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  reply_to_post_id TEXT,
  media_refs JSONB NOT NULL DEFAULT '[]'::JSONB,
  source_context JSONB NOT NULL DEFAULT '{}'::JSONB,
  guardrail_status TEXT NOT NULL DEFAULT 'needs_review',
  guardrail_reasons JSONB NOT NULL DEFAULT '[]'::JSONB,
  similarity_score REAL NOT NULL DEFAULT 0,
  approval_status TEXT NOT NULL DEFAULT 'required',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS x_post_drafts_connection_idx
  ON x_post_drafts(account_connection_id, created_at DESC);

CREATE TABLE IF NOT EXISTS x_publish_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES x_post_drafts(id) ON DELETE CASCADE,
  account_connection_id UUID NOT NULL REFERENCES x_account_connections(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  text_snapshot TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  publish_status TEXT NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  published_post_id TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS x_publish_queue_connection_idx
  ON x_publish_queue(account_connection_id, scheduled_for ASC);

CREATE INDEX IF NOT EXISTS x_publish_queue_status_idx
  ON x_publish_queue(publish_status, scheduled_for ASC);

CREATE TABLE IF NOT EXISTS x_inbox_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_connection_id UUID NOT NULL REFERENCES x_account_connections(id) ON DELETE CASCADE,
  x_post_id TEXT NOT NULL,
  author_username TEXT,
  kind TEXT NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  classification TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  handled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_connection_id, x_post_id)
);

CREATE INDEX IF NOT EXISTS x_inbox_items_connection_idx
  ON x_inbox_items(account_connection_id, handled, created_at DESC);

CREATE TABLE IF NOT EXISTS x_sync_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_connection_id UUID NOT NULL REFERENCES x_account_connections(id) ON DELETE CASCADE,
  stream TEXT NOT NULL,
  cursor TEXT,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  UNIQUE(account_connection_id, stream)
);

CREATE TABLE IF NOT EXISTS x_post_metrics (
  account_connection_id UUID NOT NULL REFERENCES x_account_connections(id) ON DELETE CASCADE,
  x_post_id TEXT NOT NULL,
  posted_at TIMESTAMPTZ,
  public_metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
  organic_metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
  non_public_metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(account_connection_id, x_post_id)
);

ALTER TABLE x_account_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE x_account_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE x_post_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE x_publish_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE x_inbox_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE x_sync_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE x_post_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_x_account_connections" ON x_account_connections FOR ALL USING (FALSE);
CREATE POLICY "deny_all_x_account_policies" ON x_account_policies FOR ALL USING (FALSE);
CREATE POLICY "deny_all_x_post_drafts" ON x_post_drafts FOR ALL USING (FALSE);
CREATE POLICY "deny_all_x_publish_queue" ON x_publish_queue FOR ALL USING (FALSE);
CREATE POLICY "deny_all_x_inbox_items" ON x_inbox_items FOR ALL USING (FALSE);
CREATE POLICY "deny_all_x_sync_checkpoints" ON x_sync_checkpoints FOR ALL USING (FALSE);
CREATE POLICY "deny_all_x_post_metrics" ON x_post_metrics FOR ALL USING (FALSE);