-- AgentOS Migration 005: Skills marketplace tables
-- Run this in the Supabase SQL editor after migrations 001–004.

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

-- Developer earnings tracking (monthly roll-up)
CREATE TABLE IF NOT EXISTS developer_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id TEXT NOT NULL,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  total_calls INTEGER DEFAULT 0,
  gross_revenue NUMERIC DEFAULT 0,
  developer_share NUMERIC DEFAULT 0,
  platform_share NUMERIC DEFAULT 0,
  paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  stripe_transfer_id TEXT,

  UNIQUE(developer_id, skill_id, period_start)
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
CREATE INDEX IF NOT EXISTS idx_dev_earnings_developer ON developer_earnings(developer_id);
CREATE INDEX IF NOT EXISTS idx_dev_earnings_skill ON developer_earnings(skill_id);
CREATE INDEX IF NOT EXISTS idx_dev_earnings_period ON developer_earnings(period_start);

-- Helper functions
CREATE OR REPLACE FUNCTION decrement_skill_installs(skill_id UUID)
RETURNS void AS $$
  UPDATE skills
  SET total_installs = GREATEST(0, total_installs - 1)
  WHERE id = skill_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION refresh_skill_rating(p_skill_id UUID)
RETURNS void AS $$
  UPDATE skills
  SET
    rating = COALESCE((SELECT AVG(rating) FROM skill_reviews WHERE skill_id = p_skill_id), 0),
    review_count = (SELECT COUNT(*) FROM skill_reviews WHERE skill_id = p_skill_id)
  WHERE id = p_skill_id;
$$ LANGUAGE sql;

-- Enable Row Level Security (service role bypasses RLS automatically)
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE developer_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_skills" ON skills FOR ALL USING (FALSE);
CREATE POLICY "deny_all_skill_installations" ON skill_installations FOR ALL USING (FALSE);
CREATE POLICY "deny_all_skill_usage" ON skill_usage FOR ALL USING (FALSE);
CREATE POLICY "deny_all_skill_reviews" ON skill_reviews FOR ALL USING (FALSE);
CREATE POLICY "deny_all_developer_earnings" ON developer_earnings FOR ALL USING (FALSE);

-- Seed data: built-in example skills
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
  '[{"name":"parse","description":"Parse a JSON string safely","params":{"json_string":"string"},"returns":"object"},{"name":"extract","description":"Extract a value at a dot-notation path","params":{"data":"object","path":"string"},"returns":"any"},{"name":"filter","description":"Filter an array by a key-value condition","params":{"array":"array","key":"string","value":"any"},"returns":"array"},{"name":"merge","description":"Deep-merge two objects","params":{"base":"object","override":"object"},"returns":"object"}]',
  'class Skill { parse(p){try{return JSON.parse(p.json_string);}catch(e){throw new Error("Invalid JSON: "+e.message);}} extract(p){return p.path.split(".").reduce((o,k)=>o?.[k],p.data);} filter(p){return p.array.filter(i=>i[p.key]===p.value);} merge(p){return Object.assign({},p.base,p.override);} }',
  '{}',
  '{"json","transform","etl","data"}',
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
  'A collection of essential text processing utilities that agents frequently need.',
  '📝',
  'free',
  1000,
  '[{"name":"slugify","description":"Convert text to URL-friendly slug","params":{"text":"string"},"returns":"string"},{"name":"truncate","description":"Truncate text to a max length","params":{"text":"string","max_length":"number"},"returns":"string"},{"name":"extract_emails","description":"Find all email addresses in text","params":{"text":"string"},"returns":"array"},{"name":"count_words","description":"Count words in text","params":{"text":"string"},"returns":"number"}]',
  'class Skill { slugify(p){return p.text.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");} truncate(p){const t=p.text,n=p.max_length;return t.length>n?t.slice(0,n-3)+"...":t;} extract_emails(p){return p.text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)||[];} count_words(p){return p.text.trim().split(/\s+/).filter(Boolean).length;} }',
  '{}',
  '{"text","string","nlp","utilities"}',
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
  'A skill for constructing well-formed HTTP requests. Handles authentication headers, content-type negotiation, URL parameter encoding, and request validation.',
  '🌐',
  'free',
  500,
  '[{"name":"build_headers","description":"Build standard HTTP headers with auth","params":{"auth_type":"string","token":"string","extra":"object"},"returns":"object"},{"name":"encode_params","description":"Encode an object as URL query parameters","params":{"params":"object"},"returns":"string"},{"name":"parse_response","description":"Parse HTTP response and handle errors","params":{"status":"number","body":"any"},"returns":"object"}]',
  'class Skill { build_headers(p){const h={"Content-Type":"application/json",...(p.extra||{})};if(p.auth_type==="bearer")h["Authorization"]="Bearer "+p.token;if(p.auth_type==="basic")h["Authorization"]="Basic "+btoa(p.token);if(p.auth_type==="api-key")h["X-API-Key"]=p.token;return h;} encode_params(p){return Object.entries(p.params||{}).map(([k,v])=>encodeURIComponent(k)+"="+encodeURIComponent(String(v))).join("&");} parse_response(p){if(p.status>=200&&p.status<300)return{ok:true,data:p.body};return{ok:false,error:"HTTP "+p.status,data:p.body};} }',
  '{"net"}',
  '{"http","api","web","request"}',
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
  'Essential mathematical and statistical operations for data analysis.',
  '📊',
  'free',
  1000,
  '[{"name":"mean","description":"Calculate arithmetic mean","params":{"values":"array"},"returns":"number"},{"name":"median","description":"Calculate median","params":{"values":"array"},"returns":"number"},{"name":"std_dev","description":"Calculate standard deviation","params":{"values":"array"},"returns":"number"},{"name":"moving_average","description":"Calculate N-period moving average","params":{"values":"array","period":"number"},"returns":"array"},{"name":"percent_change","description":"Calculate percent change","params":{"from":"number","to":"number"},"returns":"number"}]',
  'class Skill { mean(p){return p.values.reduce((a,b)=>a+b,0)/p.values.length;} median(p){const s=[...p.values].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;} std_dev(p){const v=p.values,m=v.reduce((a,b)=>a+b,0)/v.length;return Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/v.length);} moving_average(p){const{values:v,period:n}=p;return v.slice(n-1).map((_,i)=>v.slice(i,i+n).reduce((a,b)=>a+b,0)/n);} percent_change(p){return((p.to-p.from)/Math.abs(p.from))*100;} }',
  '{}',
  '{"math","statistics","analytics","finance"}',
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
  'A complete date and time manipulation skill.',
  '📅',
  'free',
  1000,
  '[{"name":"now","description":"Get current UTC timestamp","params":{},"returns":"string"},{"name":"format","description":"Format a date as readable string","params":{"iso_date":"string","format":"string"},"returns":"string"},{"name":"diff_days","description":"Days between two dates","params":{"date_a":"string","date_b":"string"},"returns":"number"},{"name":"add_days","description":"Add N days to a date","params":{"iso_date":"string","days":"number"},"returns":"string"}]',
  'class Skill { now(){return new Date().toISOString();} format(p){const d=new Date(p.iso_date);if(p.format==="short")return d.toLocaleDateString();if(p.format==="long")return d.toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"});if(p.format==="time")return d.toLocaleTimeString();return d.toISOString();} diff_days(p){return Math.round((new Date(p.date_b)-new Date(p.date_a))/86400000);} add_days(p){const d=new Date(p.iso_date);d.setDate(d.getDate()+p.days);return d.toISOString();} }',
  '{}',
  '{"date","time","timezone","calendar"}',
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
  'Handle CSV data natively without dependencies.',
  '📋',
  'free',
  500,
  '[{"name":"parse","description":"Parse CSV string into row objects","params":{"csv":"string"},"returns":"array"},{"name":"to_csv","description":"Convert objects to CSV string","params":{"rows":"array","columns":"array"},"returns":"string"},{"name":"filter_rows","description":"Filter rows by column value","params":{"rows":"array","column":"string","value":"string"},"returns":"array"},{"name":"sum_column","description":"Sum a numeric column","params":{"rows":"array","column":"string"},"returns":"number"}]',
  'class Skill { parse(p){const l=p.csv.trim().split("\n"),h=l[0].split(",").map(x=>x.trim());return l.slice(1).map(line=>{const v=line.split(",");return h.reduce((o,k,i)=>{o[k]=(v[i]||"").trim();return o;},{});});} to_csv(p){const c=p.columns||Object.keys(p.rows[0]||{});return[c.join(","),...p.rows.map(r=>c.map(k=>String(r[k]||"")).join(","))].join("\n");} filter_rows(p){return p.rows.filter(r=>String(r[p.column])===p.value);} sum_column(p){return p.rows.reduce((s,r)=>s+parseFloat(r[p.column]||0),0);} }',
  '{}',
  '{"csv","data","spreadsheet","etl"}',
  true,
  true
)
ON CONFLICT (slug) DO NOTHING;
