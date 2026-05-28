-- AgentOS Migration 015: unique agent display names
-- Additive only. Enforces case-insensitive, whitespace-normalized agent names.

CREATE OR REPLACE FUNCTION clean_agent_name(p_name TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(btrim(p_name), '\s+', ' ', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION normalize_agent_name(p_name TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT lower(public.clean_agent_name(p_name));
$$;

CREATE OR REPLACE FUNCTION enforce_agent_name_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_name TEXT;
BEGIN
  v_name := public.normalize_agent_name(NEW.name);

  IF v_name IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.name := public.clean_agent_name(NEW.name);

  PERFORM pg_advisory_xact_lock(hashtextextended('agent_name:' || v_name, 0));

  IF EXISTS (
    SELECT 1
    FROM agents
    WHERE id <> NEW.id
      AND public.normalize_agent_name(name) = v_name
  ) OR EXISTS (
    SELECT 1
    FROM external_agent_registrations
    WHERE agent_id <> NEW.id
      AND public.normalize_agent_name(name) = v_name
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = format('Duplicate agent name: %s', NEW.name);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_external_agent_name_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_name TEXT;
BEGIN
  v_name := public.normalize_agent_name(NEW.name);

  IF v_name IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.name := public.clean_agent_name(NEW.name);

  PERFORM pg_advisory_xact_lock(hashtextextended('agent_name:' || v_name, 0));

  IF EXISTS (
    SELECT 1
    FROM external_agent_registrations
    WHERE agent_id <> NEW.agent_id
      AND public.normalize_agent_name(name) = v_name
  ) OR EXISTS (
    SELECT 1
    FROM agents
    WHERE id <> NEW.agent_id
      AND public.normalize_agent_name(name) = v_name
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = format('Duplicate agent name: %s', NEW.name);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agents_name_uniqueness ON agents;
CREATE TRIGGER agents_name_uniqueness
BEFORE INSERT OR UPDATE OF name ON agents
FOR EACH ROW
EXECUTE FUNCTION enforce_agent_name_uniqueness();

DROP TRIGGER IF EXISTS external_agent_registrations_name_uniqueness ON external_agent_registrations;
CREATE TRIGGER external_agent_registrations_name_uniqueness
BEFORE INSERT OR UPDATE OF name ON external_agent_registrations
FOR EACH ROW
EXECUTE FUNCTION enforce_external_agent_name_uniqueness();

CREATE INDEX IF NOT EXISTS agents_name_normalized_idx
  ON agents (public.normalize_agent_name(name))
  WHERE public.normalize_agent_name(name) IS NOT NULL;

CREATE INDEX IF NOT EXISTS external_agent_registrations_name_normalized_idx
  ON external_agent_registrations (public.normalize_agent_name(name))
  WHERE public.normalize_agent_name(name) IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND c.relname = 'agents_name_normalized_unique_idx'
      AND n.nspname = current_schema()
  ) AND NOT EXISTS (
    SELECT 1
    FROM agents
    WHERE public.normalize_agent_name(name) IS NOT NULL
    GROUP BY public.normalize_agent_name(name)
    HAVING COUNT(*) > 1
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX agents_name_normalized_unique_idx ON agents (public.normalize_agent_name(name)) WHERE public.normalize_agent_name(name) IS NOT NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND c.relname = 'external_agent_registrations_name_normalized_unique_idx'
      AND n.nspname = current_schema()
  ) AND NOT EXISTS (
    SELECT 1
    FROM external_agent_registrations
    WHERE public.normalize_agent_name(name) IS NOT NULL
    GROUP BY public.normalize_agent_name(name)
    HAVING COUNT(*) > 1
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX external_agent_registrations_name_normalized_unique_idx ON external_agent_registrations (public.normalize_agent_name(name)) WHERE public.normalize_agent_name(name) IS NOT NULL';
  END IF;
END $$;

REVOKE ALL ON FUNCTION clean_agent_name(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION normalize_agent_name(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION enforce_agent_name_uniqueness() FROM PUBLIC;
REVOKE ALL ON FUNCTION enforce_external_agent_name_uniqueness() FROM PUBLIC;
