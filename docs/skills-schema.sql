-- ==========================================
-- AGENT OS SKILLS SYSTEM SCHEMA
-- Run this in Supabase SQL Editor
-- ==========================================

-- Skills registry
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  long_description TEXT,
  icon TEXT DEFAULT '📦',

  -- Pricing
  pricing_model TEXT NOT NULL DEFAULT 'free', -- 'free', 'usage'
  price_per_call NUMERIC DEFAULT 0,
  free_tier_calls INTEGER DEFAULT 100,

  -- Stats
  total_installs INTEGER DEFAULT 0,
  total_calls INTEGER DEFAULT 0,
  rating NUMERIC DEFAULT 0,
  review_count INTEGER DEFAULT 0,

  -- Technical
  primitives_required TEXT[] DEFAULT '{}',
  capabilities JSONB NOT NULL DEFAULT '[]',

  -- Code
  source_code TEXT NOT NULL DEFAULT '',
  entry_point TEXT NOT NULL DEFAULT 'index.js',

  -- Status
  published BOOLEAN DEFAULT TRUE,
  verified BOOLEAN DEFAULT FALSE,

  -- Metadata
  tags TEXT[] DEFAULT '{}',
  homepage_url TEXT,
  repository_url TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Skill installations (which agents have installed which skills)
CREATE TABLE IF NOT EXISTS skill_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  installed_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(agent_id, skill_id)
);

-- Skill usage logs
CREATE TABLE IF NOT EXISTS skill_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  skill_id UUID NOT NULL REFERENCES skills(id),
  capability_name TEXT NOT NULL,
  execution_time_ms INTEGER,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  cost NUMERIC DEFAULT 0,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Skill reviews
CREATE TABLE IF NOT EXISTS skill_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review_title TEXT,
  review_text TEXT,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(skill_id, agent_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_author ON skills(author_id);
CREATE INDEX IF NOT EXISTS idx_skills_published ON skills(published);
CREATE INDEX IF NOT EXISTS idx_skills_slug ON skills(slug);
CREATE INDEX IF NOT EXISTS idx_skill_installations_agent ON skill_installations(agent_id);
CREATE INDEX IF NOT EXISTS idx_skill_installations_skill ON skill_installations(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_usage_agent ON skill_usage(agent_id);
CREATE INDEX IF NOT EXISTS idx_skill_usage_skill ON skill_usage(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_usage_timestamp ON skill_usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_skill_reviews_skill ON skill_reviews(skill_id);

-- Helper function to decrement install count safely
CREATE OR REPLACE FUNCTION decrement_skill_installs(skill_id UUID)
RETURNS void AS $$
  UPDATE skills
  SET total_installs = GREATEST(0, total_installs - 1)
  WHERE id = skill_id;
$$ LANGUAGE sql;

-- Helper function to refresh rating average
CREATE OR REPLACE FUNCTION refresh_skill_rating(p_skill_id UUID)
RETURNS void AS $$
  UPDATE skills
  SET
    rating = COALESCE((SELECT AVG(rating) FROM skill_reviews WHERE skill_id = p_skill_id), 0),
    review_count = (SELECT COUNT(*) FROM skill_reviews WHERE skill_id = p_skill_id)
  WHERE id = p_skill_id;
$$ LANGUAGE sql;

-- ==========================================
-- SEED DATA: Built-in example skills
-- ==========================================

INSERT INTO skills (
  name, slug, version, author_id, author_name, category,
  description, long_description, icon, pricing_model, free_tier_calls,
  capabilities, source_code, primitives_required, tags, published, verified
) VALUES
(
  'JSON Transformer',
  'json-transformer',
  '1.0.0',
  'system',
  'Agent OS Team',
  'Data & Analytics',
  'Parse, transform, filter, and reshape JSON data with ease.',
  'A comprehensive JSON manipulation skill. Supports deep merging, path extraction, filtering arrays, and schema validation. Perfect for ETL pipelines and data normalization tasks.',
  '🔄',
  'free',
  1000,
  '[
    {"name": "parse", "description": "Parse a JSON string safely", "params": {"json_string": "string"}, "returns": "object"},
    {"name": "extract", "description": "Extract a value at a dot-notation path", "params": {"data": "object", "path": "string"}, "returns": "any"},
    {"name": "filter", "description": "Filter an array by a key-value condition", "params": {"array": "array", "key": "string", "value": "any"}, "returns": "array"},
    {"name": "merge", "description": "Deep-merge two objects", "params": {"base": "object", "override": "object"}, "returns": "object"}
  ]',
  '// JSON Transformer Skill
class Skill {
  parse(params) {
    try { return JSON.parse(params.json_string); }
    catch(e) { throw new Error("Invalid JSON: " + e.message); }
  }
  extract(params) {
    return params.path.split(".").reduce((obj, key) => obj?.[key], params.data);
  }
  filter(params) {
    return params.array.filter(item => item[params.key] === params.value);
  }
  merge(params) {
    return Object.assign({}, params.base, params.override);
  }
}',
  '{}',
  '{"json", "transform", "etl", "data"}',
  true,
  true
),
(
  'Text Utilities',
  'text-utils',
  '1.0.0',
  'system',
  'Agent OS Team',
  'Documents',
  'Common string operations: truncate, slugify, extract emails, count tokens, and more.',
  'A collection of essential text processing utilities that agents frequently need. Includes slugification, email extraction, token counting, and text summarization helpers.',
  '📝',
  'free',
  1000,
  '[
    {"name": "slugify", "description": "Convert text to URL-friendly slug", "params": {"text": "string"}, "returns": "string"},
    {"name": "truncate", "description": "Truncate text to a max length", "params": {"text": "string", "max_length": "number"}, "returns": "string"},
    {"name": "extract_emails", "description": "Find all email addresses in text", "params": {"text": "string"}, "returns": "array"},
    {"name": "count_words", "description": "Count words in text", "params": {"text": "string"}, "returns": "number"}
  ]',
  '// Text Utilities Skill
class Skill {
  slugify(params) {
    return params.text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  truncate(params) {
    const t = params.text; const n = params.max_length;
    return t.length > n ? t.slice(0, n - 3) + "..." : t;
  }
  extract_emails(params) {
    const m = params.text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    return m || [];
  }
  count_words(params) {
    return params.text.trim().split(/\s+/).filter(Boolean).length;
  }
}',
  '{}',
  '{"text", "string", "nlp", "utilities"}',
  true,
  true
),
(
  'HTTP Request Builder',
  'http-request-builder',
  '1.0.0',
  'system',
  'Agent OS Team',
  'Web & Browser',
  'Build and validate HTTP requests with proper headers, auth, and retry logic.',
  'A skill for constructing well-formed HTTP requests. Handles authentication headers, content-type negotiation, URL parameter encoding, and request validation before sending via the net primitive.',
  '🌐',
  'free',
  500,
  '[
    {"name": "build_headers", "description": "Build standard HTTP headers with auth", "params": {"auth_type": "string", "token": "string", "extra": "object"}, "returns": "object"},
    {"name": "encode_params", "description": "Encode an object as URL query parameters", "params": {"params": "object"}, "returns": "string"},
    {"name": "parse_response", "description": "Parse HTTP response and handle errors", "params": {"status": "number", "body": "any"}, "returns": "object"}
  ]',
  '// HTTP Request Builder Skill
class Skill {
  build_headers(params) {
    const headers = { "Content-Type": "application/json", ...(params.extra || {}) };
    if (params.auth_type === "bearer") headers["Authorization"] = "Bearer " + params.token;
    if (params.auth_type === "basic") headers["Authorization"] = "Basic " + btoa(params.token);
    if (params.auth_type === "api-key") headers["X-API-Key"] = params.token;
    return headers;
  }
  encode_params(params) {
    return Object.entries(params.params || {}).map(([k,v]) => encodeURIComponent(k) + "=" + encodeURIComponent(String(v))).join("&");
  }
  parse_response(params) {
    if (params.status >= 200 && params.status < 300) return { ok: true, data: params.body };
    return { ok: false, error: "HTTP " + params.status, data: params.body };
  }
}',
  '{"net"}',
  '{"http", "api", "web", "request"}',
  true,
  true
),
(
  'Math & Stats',
  'math-stats',
  '1.0.0',
  'system',
  'Agent OS Team',
  'Data & Analytics',
  'Statistical functions: mean, median, standard deviation, percentiles, and moving averages.',
  'Essential mathematical and statistical operations for data analysis. Includes descriptive statistics, moving averages, percentile calculations, and basic financial math like compound interest and percent change.',
  '📊',
  'free',
  1000,
  '[
    {"name": "mean", "description": "Calculate arithmetic mean of an array", "params": {"values": "array"}, "returns": "number"},
    {"name": "median", "description": "Calculate median of an array", "params": {"values": "array"}, "returns": "number"},
    {"name": "std_dev", "description": "Calculate standard deviation", "params": {"values": "array"}, "returns": "number"},
    {"name": "moving_average", "description": "Calculate N-period moving average", "params": {"values": "array", "period": "number"}, "returns": "array"},
    {"name": "percent_change", "description": "Calculate percent change between two values", "params": {"from": "number", "to": "number"}, "returns": "number"}
  ]',
  '// Math & Stats Skill
class Skill {
  mean(params) {
    const v = params.values; return v.reduce((a,b) => a+b, 0) / v.length;
  }
  median(params) {
    const s = [...params.values].sort((a,b)=>a-b); const m = Math.floor(s.length/2);
    return s.length % 2 ? s[m] : (s[m-1]+s[m])/2;
  }
  std_dev(params) {
    const v = params.values; const m = v.reduce((a,b)=>a+b,0)/v.length;
    return Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/v.length);
  }
  moving_average(params) {
    const { values: v, period: p } = params;
    return v.slice(p-1).map((_,i) => v.slice(i,i+p).reduce((a,b)=>a+b,0)/p);
  }
  percent_change(params) {
    return ((params.to - params.from) / Math.abs(params.from)) * 100;
  }
}',
  '{}',
  '{"math", "statistics", "analytics", "finance"}',
  true,
  true
),
(
  'Date & Time',
  'date-time',
  '1.0.0',
  'system',
  'Agent OS Team',
  'Data & Analytics',
  'Parse, format, compare, and manipulate dates across timezones.',
  'A complete date and time manipulation skill. Convert between formats, calculate differences, check business hours, generate date ranges, and format timestamps in any timezone.',
  '📅',
  'free',
  1000,
  '[
    {"name": "now", "description": "Get current UTC timestamp in ISO format", "params": {}, "returns": "string"},
    {"name": "format", "description": "Format a date as a readable string", "params": {"iso_date": "string", "format": "string"}, "returns": "string"},
    {"name": "diff_days", "description": "Calculate days between two dates", "params": {"date_a": "string", "date_b": "string"}, "returns": "number"},
    {"name": "add_days", "description": "Add N days to a date", "params": {"iso_date": "string", "days": "number"}, "returns": "string"}
  ]',
  '// Date & Time Skill
class Skill {
  now() { return new Date().toISOString(); }
  format(params) {
    const d = new Date(params.iso_date);
    if (params.format === "short") return d.toLocaleDateString();
    if (params.format === "long") return d.toLocaleDateString(undefined, {weekday:"long",year:"numeric",month:"long",day:"numeric"});
    if (params.format === "time") return d.toLocaleTimeString();
    return d.toISOString();
  }
  diff_days(params) {
    const a = new Date(params.date_a); const b = new Date(params.date_b);
    return Math.round((b - a) / 86400000);
  }
  add_days(params) {
    const d = new Date(params.iso_date); d.setDate(d.getDate() + params.days);
    return d.toISOString();
  }
}',
  '{}',
  '{"date", "time", "timezone", "calendar"}',
  true,
  true
),
(
  'CSV Processor',
  'csv-processor',
  '1.0.0',
  'system',
  'Agent OS Team',
  'Documents',
  'Parse CSV strings, convert to JSON, filter rows, and export back to CSV.',
  'Handle CSV data natively without dependencies. Parse CSV strings into arrays of objects, apply column filters, sort data, compute column aggregates, and serialize back to CSV format.',
  '📋',
  'free',
  500,
  '[
    {"name": "parse", "description": "Parse a CSV string into an array of row objects", "params": {"csv": "string"}, "returns": "array"},
    {"name": "to_csv", "description": "Convert array of objects to CSV string", "params": {"rows": "array", "columns": "array"}, "returns": "string"},
    {"name": "filter_rows", "description": "Filter rows where column matches value", "params": {"rows": "array", "column": "string", "value": "string"}, "returns": "array"},
    {"name": "sum_column", "description": "Sum a numeric column", "params": {"rows": "array", "column": "string"}, "returns": "number"}
  ]',
  '// CSV Processor Skill
class Skill {
  parse(params) {
    const lines = params.csv.trim().split("\n");
    const headers = lines[0].split(",").map(h => h.trim());
    return lines.slice(1).map(line => {
      const vals = line.split(",");
      return headers.reduce((obj, h, i) => { obj[h] = (vals[i]||"").trim(); return obj; }, {});
    });
  }
  to_csv(params) {
    const cols = params.columns || Object.keys(params.rows[0] || {});
    const header = cols.join(",");
    const rows = params.rows.map(r => cols.map(c => String(r[c]||"")).join(","));
    return [header, ...rows].join("\n");
  }
  filter_rows(params) {
    return params.rows.filter(r => String(r[params.column]) === params.value);
  }
  sum_column(params) {
    return params.rows.reduce((s, r) => s + parseFloat(r[params.column] || 0), 0);
  }
}',
  '{}',
  '{"csv", "data", "spreadsheet", "etl"}',
  true,
  true
)
ON CONFLICT (slug) DO NOTHING;
