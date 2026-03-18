-- AgentOS Migration 007: Security hardening
-- Additive only. Safe to run after migrations 001-006.

CREATE OR REPLACE FUNCTION normalize_agent_email(p_email TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT NULLIF(lower(btrim(p_email)), '');
$$;

CREATE OR REPLACE FUNCTION enforce_agent_email_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_email TEXT;
BEGIN
  v_email := normalize_agent_email(COALESCE(NEW.metadata, '{}'::jsonb)->>'email');

  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.metadata := jsonb_set(COALESCE(NEW.metadata, '{}'::jsonb), '{email}', to_jsonb(v_email), true);

  PERFORM pg_advisory_xact_lock(hashtextextended(v_email, 0));

  IF EXISTS (
    SELECT 1
    FROM agents
    WHERE id <> NEW.id
      AND normalize_agent_email(metadata->>'email') = v_email
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = format('Duplicate agent email: %s', v_email);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agents_email_uniqueness ON agents;

CREATE TRIGGER agents_email_uniqueness
BEFORE INSERT OR UPDATE OF metadata ON agents
FOR EACH ROW
EXECUTE FUNCTION enforce_agent_email_uniqueness();

UPDATE agents
SET metadata = jsonb_set(metadata, '{email}', to_jsonb(normalize_agent_email(metadata->>'email')), true)
WHERE metadata ? 'email'
  AND normalize_agent_email(metadata->>'email') IS NOT NULL
  AND (metadata->>'email') IS DISTINCT FROM normalize_agent_email(metadata->>'email');

CREATE INDEX IF NOT EXISTS agents_metadata_email_normalized_idx
  ON agents (normalize_agent_email(metadata->>'email'))
  WHERE normalize_agent_email(metadata->>'email') IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND c.relname = 'agents_metadata_email_normalized_unique_idx'
      AND n.nspname = current_schema()
  ) AND NOT EXISTS (
    SELECT 1
    FROM agents
    WHERE normalize_agent_email(metadata->>'email') IS NOT NULL
    GROUP BY normalize_agent_email(metadata->>'email')
    HAVING COUNT(*) > 1
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX agents_metadata_email_normalized_unique_idx ON agents (normalize_agent_email(metadata->>''email'')) WHERE normalize_agent_email(metadata->>''email'') IS NOT NULL';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION execute_agent_transaction(
  p_schema  TEXT,
  p_queries JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_query   JSONB;
  v_sql     TEXT;
  v_params  JSONB;
  v_results JSONB := '[]'::JSONB;
  v_count   INTEGER;
  i         INTEGER;
BEGIN
  IF p_schema !~ '^agent_[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid schema name: %', p_schema;
  END IF;

  IF p_queries IS NULL OR jsonb_typeof(p_queries) <> 'array' THEN
    RAISE EXCEPTION 'Queries must be a JSON array';
  END IF;

  IF jsonb_array_length(p_queries) = 0 THEN
    RETURN v_results;
  END IF;

  EXECUTE format('SET LOCAL search_path TO %I, public', p_schema);

  FOR i IN 0 .. jsonb_array_length(p_queries) - 1 LOOP
    v_query := p_queries->i;
    v_sql := v_query->>'sql';
    v_params := COALESCE(v_query->'params', '[]'::jsonb);

    IF v_sql IS NULL OR btrim(v_sql) = '' THEN
      RAISE EXCEPTION 'Missing SQL in statement %', i;
    END IF;

    IF jsonb_typeof(v_params) <> 'array' THEN
      RAISE EXCEPTION 'Statement % params must be a JSON array', i;
    END IF;

    IF v_sql ~* 'pg_catalog|information_schema|pg_shadow|pg_authid|pg_toast' THEN
      RAISE EXCEPTION 'SQL references restricted system catalog in statement %', i;
    END IF;

    CASE jsonb_array_length(v_params)
      WHEN 0 THEN EXECUTE v_sql;
      WHEN 1 THEN EXECUTE v_sql USING
        v_params->>0;
      WHEN 2 THEN EXECUTE v_sql USING
        v_params->>0, v_params->>1;
      WHEN 3 THEN EXECUTE v_sql USING
        v_params->>0, v_params->>1, v_params->>2;
      WHEN 4 THEN EXECUTE v_sql USING
        v_params->>0, v_params->>1, v_params->>2, v_params->>3;
      WHEN 5 THEN EXECUTE v_sql USING
        v_params->>0, v_params->>1, v_params->>2, v_params->>3, v_params->>4;
      WHEN 6 THEN EXECUTE v_sql USING
        v_params->>0, v_params->>1, v_params->>2, v_params->>3, v_params->>4,
        v_params->>5;
      WHEN 7 THEN EXECUTE v_sql USING
        v_params->>0, v_params->>1, v_params->>2, v_params->>3, v_params->>4,
        v_params->>5, v_params->>6;
      WHEN 8 THEN EXECUTE v_sql USING
        v_params->>0, v_params->>1, v_params->>2, v_params->>3, v_params->>4,
        v_params->>5, v_params->>6, v_params->>7;
      WHEN 9 THEN EXECUTE v_sql USING
        v_params->>0, v_params->>1, v_params->>2, v_params->>3, v_params->>4,
        v_params->>5, v_params->>6, v_params->>7, v_params->>8;
      WHEN 10 THEN EXECUTE v_sql USING
        v_params->>0, v_params->>1, v_params->>2, v_params->>3, v_params->>4,
        v_params->>5, v_params->>6, v_params->>7, v_params->>8, v_params->>9;
      ELSE
        RAISE EXCEPTION 'Too many parameters in statement %: max 10, got %',
          i, jsonb_array_length(v_params);
    END CASE;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_results := v_results || jsonb_build_array(jsonb_build_object('rowCount', v_count));
  END LOOP;

  RETURN v_results;
END;
$$;

REVOKE ALL ON FUNCTION normalize_agent_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION enforce_agent_email_uniqueness() FROM PUBLIC;
REVOKE ALL ON FUNCTION execute_agent_transaction(TEXT, JSONB) FROM PUBLIC;
