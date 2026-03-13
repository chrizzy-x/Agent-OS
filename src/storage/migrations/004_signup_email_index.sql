-- AgentOS Migration 004: Signup email index
-- Enables efficient lookup of agents by email stored in metadata JSONB

CREATE INDEX IF NOT EXISTS agents_metadata_email_idx ON agents ((metadata->>'email'));
