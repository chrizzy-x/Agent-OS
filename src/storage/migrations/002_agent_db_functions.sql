-- AgentOS Migration 002: PostgreSQL Functions for Agent-Scoped Database Operations
-- These functions are called via Supabase RPC from the db primitive.
-- They enforce schema isolation — each agent has its own PostgreSQL schema.

-- Ensure an agent's private schema exists.
-- Safe to call multiple times (idempotent).
CREATE OR REPLACE FUNCTION ensure_agent_schema(p_schema TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate schema name: only alphanumeric + underscores, must start with 'agent_'
  IF p_schema !~ '^agent_[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid schema name: %', p_schema;
  END IF;

  -- Create schema if it doesn't exist
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', p_schema);
END;
$$;

-- Execute a parameterized SQL query within an agent's private schema.
-- Parameters are passed as a JSON array and bound to the query via USING.
-- Returns the result rows as a JSON array.
CREATE OR REPLACE FUNCTION execute_agent_query(
  p_schema TEXT,
  p_sql    TEXT,
  p_params JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result  JSONB;
  v_sql     TEXT;
BEGIN
  -- Validate schema name
  IF p_schema !~ '^agent_[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid schema name: %', p_schema;
  END IF;

  -- Block any reference to system schemas
  IF p_sql ~* 'pg_catalog|information_schema|pg_shadow|pg_authid|pg_toast' THEN
    RAISE EXCEPTION 'SQL references restricted system catalog';
  END IF;

  -- Set search_path so unqualified table names resolve to the agent schema
  EXECUTE format('SET LOCAL search_path TO %I, public', p_schema);

  -- Build a query that returns results as JSON array
  v_sql := format(
    'SELECT COALESCE(json_agg(row_to_json(t)), ''[]''::json)::jsonb FROM (%s) t',
    p_sql
  );

  -- Execute with parameters extracted from the JSON array
  -- Supports up to 10 parameters; extend if needed
  CASE jsonb_array_length(p_params)
    WHEN 0 THEN EXECUTE v_sql INTO v_result;
    WHEN 1 THEN EXECUTE v_sql INTO v_result USING
      p_params->>0;
    WHEN 2 THEN EXECUTE v_sql INTO v_result USING
      p_params->>0, p_params->>1;
    WHEN 3 THEN EXECUTE v_sql INTO v_result USING
      p_params->>0, p_params->>1, p_params->>2;
    WHEN 4 THEN EXECUTE v_sql INTO v_result USING
      p_params->>0, p_params->>1, p_params->>2, p_params->>3;
    WHEN 5 THEN EXECUTE v_sql INTO v_result USING
      p_params->>0, p_params->>1, p_params->>2, p_params->>3, p_params->>4;
    WHEN 6 THEN EXECUTE v_sql INTO v_result USING
      p_params->>0, p_params->>1, p_params->>2, p_params->>3, p_params->>4,
      p_params->>5;
    WHEN 7 THEN EXECUTE v_sql INTO v_result USING
      p_params->>0, p_params->>1, p_params->>2, p_params->>3, p_params->>4,
      p_params->>5, p_params->>6;
    WHEN 8 THEN EXECUTE v_sql INTO v_result USING
      p_params->>0, p_params->>1, p_params->>2, p_params->>3, p_params->>4,
      p_params->>5, p_params->>6, p_params->>7;
    WHEN 9 THEN EXECUTE v_sql INTO v_result USING
      p_params->>0, p_params->>1, p_params->>2, p_params->>3, p_params->>4,
      p_params->>5, p_params->>6, p_params->>7, p_params->>8;
    WHEN 10 THEN EXECUTE v_sql INTO v_result USING
      p_params->>0, p_params->>1, p_params->>2, p_params->>3, p_params->>4,
      p_params->>5, p_params->>6, p_params->>7, p_params->>8, p_params->>9;
    ELSE
      RAISE EXCEPTION 'Too many parameters: max 10, got %', jsonb_array_length(p_params);
  END CASE;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

-- Execute multiple SQL statements as a single atomic transaction within an agent schema.
-- p_queries is a JSON array of {sql, params} objects.
-- Returns an array of {rowCount} results.
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
  v_results JSONB := '[]'::JSONB;
  v_count   INTEGER;
  i         INTEGER;
BEGIN
  -- Validate schema name
  IF p_schema !~ '^agent_[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid schema name: %', p_schema;
  END IF;

  EXECUTE format('SET LOCAL search_path TO %I, public', p_schema);

  FOR i IN 0 .. jsonb_array_length(p_queries) - 1 LOOP
    v_query := p_queries->i;

    -- Block system catalog access in each statement
    IF (v_query->>'sql') ~* 'pg_catalog|information_schema|pg_shadow|pg_authid' THEN
      RAISE EXCEPTION 'SQL references restricted system catalog in statement %', i;
    END IF;

    EXECUTE v_query->>'sql';
    GET DIAGNOSTICS v_count = ROW_COUNT;

    v_results := v_results || jsonb_build_array(jsonb_build_object('rowCount', v_count));
  END LOOP;

  RETURN v_results;
END;
$$;

-- Execute a DDL statement (CREATE TABLE, ALTER TABLE, etc.) in an agent schema.
-- Only called by db.create_table — not exposed to agent-provided SQL.
CREATE OR REPLACE FUNCTION execute_ddl(
  p_schema TEXT,
  p_sql    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate schema name
  IF p_schema !~ '^agent_[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid schema name: %', p_schema;
  END IF;

  -- Only allow CREATE TABLE IF NOT EXISTS, ALTER TABLE, CREATE INDEX
  IF p_sql !~* '^\s*(CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS|CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+(UNIQUE\s+)?INDEX)' THEN
    RAISE EXCEPTION 'execute_ddl only allows CREATE TABLE, ALTER TABLE, and CREATE INDEX statements';
  END IF;

  EXECUTE format('SET LOCAL search_path TO %I, public', p_schema);
  EXECUTE p_sql;
END;
$$;

-- Insert a row into an agent-scoped table using a JSONB data object.
-- Builds a parameterized INSERT dynamically from the key/value pairs.
CREATE OR REPLACE FUNCTION agent_insert(
  p_schema TEXT,
  p_table  TEXT,
  p_data   JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cols    TEXT[];
  v_vals    TEXT[];
  v_sql     TEXT;
  v_result  JSONB;
  v_key     TEXT;
  i         INTEGER := 1;
BEGIN
  -- Validate schema and table name
  IF p_schema !~ '^agent_[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid schema name: %', p_schema;
  END IF;
  IF p_table !~ '^[a-zA-Z][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table;
  END IF;

  -- Build column list and value placeholders
  FOR v_key IN SELECT jsonb_object_keys(p_data) LOOP
    v_cols := array_append(v_cols, quote_ident(v_key));
    v_vals := array_append(v_vals, format('($1->>%L)', v_key));
  END LOOP;

  IF array_length(v_cols, 1) IS NULL THEN
    RAISE EXCEPTION 'Insert data cannot be empty';
  END IF;

  v_sql := format(
    'INSERT INTO %I.%I (%s) VALUES (%s) RETURNING row_to_json(%I.*)',
    p_schema,
    p_table,
    array_to_string(v_cols, ', '),
    array_to_string(v_vals, ', '),
    p_table
  );

  EXECUTE v_sql INTO v_result USING p_data;
  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;

-- Update rows in an agent-scoped table.
-- p_data: columns to set; p_where: equality conditions for WHERE clause.
-- Returns number of affected rows.
CREATE OR REPLACE FUNCTION agent_update(
  p_schema TEXT,
  p_table  TEXT,
  p_data   JSONB,
  p_where  JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_set_parts   TEXT[];
  v_where_parts TEXT[];
  v_sql         TEXT;
  v_count       INTEGER;
  v_key         TEXT;
BEGIN
  IF p_schema !~ '^agent_[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid schema name: %', p_schema;
  END IF;
  IF p_table !~ '^[a-zA-Z][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table;
  END IF;

  -- Build SET clause
  FOR v_key IN SELECT jsonb_object_keys(p_data) LOOP
    v_set_parts := array_append(v_set_parts,
      format('%I = ($1->>%L)', v_key, v_key));
  END LOOP;

  -- Build WHERE clause
  FOR v_key IN SELECT jsonb_object_keys(p_where) LOOP
    v_where_parts := array_append(v_where_parts,
      format('%I = ($2->>%L)', v_key, v_key));
  END LOOP;

  IF array_length(v_set_parts, 1) IS NULL THEN
    RAISE EXCEPTION 'Update data cannot be empty';
  END IF;
  IF array_length(v_where_parts, 1) IS NULL THEN
    RAISE EXCEPTION 'Update WHERE clause cannot be empty';
  END IF;

  v_sql := format(
    'UPDATE %I.%I SET %s WHERE %s',
    p_schema,
    p_table,
    array_to_string(v_set_parts, ', '),
    array_to_string(v_where_parts, ' AND ')
  );

  EXECUTE v_sql USING p_data, p_where;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Delete rows from an agent-scoped table matching WHERE conditions.
-- Returns number of deleted rows.
CREATE OR REPLACE FUNCTION agent_delete(
  p_schema TEXT,
  p_table  TEXT,
  p_where  JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_where_parts TEXT[];
  v_sql         TEXT;
  v_count       INTEGER;
  v_key         TEXT;
BEGIN
  IF p_schema !~ '^agent_[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid schema name: %', p_schema;
  END IF;
  IF p_table !~ '^[a-zA-Z][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_where) LOOP
    v_where_parts := array_append(v_where_parts,
      format('%I = ($1->>%L)', v_key, v_key));
  END LOOP;

  IF array_length(v_where_parts, 1) IS NULL THEN
    RAISE EXCEPTION 'Delete WHERE clause cannot be empty to prevent accidental full-table delete';
  END IF;

  v_sql := format(
    'DELETE FROM %I.%I WHERE %s',
    p_schema,
    p_table,
    array_to_string(v_where_parts, ' AND ')
  );

  EXECUTE v_sql USING p_where;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Revoke public execution rights on all agent functions.
-- Only the service role (used by the AgentOS server) should call these.
REVOKE ALL ON FUNCTION ensure_agent_schema(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION execute_agent_query(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION execute_agent_transaction(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION execute_ddl(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION agent_insert(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION agent_update(TEXT, TEXT, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION agent_delete(TEXT, TEXT, JSONB) FROM PUBLIC;
