import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const TARGET_AGENT_ID = process.env.TARGET_AGENT_ID || 'agent_UyAIP-aU5Myf38Ym2JArbJN6';
const APP_URL = process.env.APP_URL || 'https://agentos-app.vercel.app';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !JWT_SECRET) {
  throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and JWT_SECRET are required');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function skill(definition) {
  return {
    ...definition,
    version: '1.0.0',
    author_id: 'agentos_official',
    author_name: 'Agent OS',
    pricing_model: 'free',
    price_per_call: 0,
    free_tier_calls: 10000,
    published: true,
    verified: true,
    icon: definition.icon || 'official',
    homepage_url: `${APP_URL}/marketplace/${definition.slug}`,
    repository_url: 'https://github.com/chrizzy-x/Agent-OS',
  };
}

const NEW_OFFICIAL_SKILLS = [
  skill({
    name: 'Email Template Builder',
    slug: 'email-template-builder',
    category: 'Communication',
    description: 'Generate email drafts with subject lines, greetings, and bullet-driven body content.',
    long_description: 'Build structured outbound emails quickly for sales, support, and status workflows.',
    tags: ['email', 'communication', 'templates'],
    capabilities: [{ name: 'build_email', description: 'Builds a structured email draft.', params: { subject: 'string', recipientName: 'string', bodyPoints: 'string[]' }, returns: 'object' }],
    source_code: `class Skill {
  build_email(params) {
    const subject = String(params.subject || 'Update');
    const recipientName = String(params.recipientName || 'there').trim();
    const bodyPoints = Array.isArray(params.bodyPoints) ? params.bodyPoints.map(item => '- ' + String(item)) : [];
    return {
      subject,
      greeting: 'Hi ' + recipientName + ',',
      body: bodyPoints.join('\\\\n'),
      closing: 'Best,\\\\nAgent OS'
    };
  }
}`,
    verify: { capability: 'build_email', params: { subject: 'Launch update', recipientName: 'Ada', bodyPoints: ['Studio is live', 'Skills are installed'] }, expected: result => result.subject === 'Launch update' && result.greeting === 'Hi Ada,' && result.body.includes('Studio is live') },
  }),
  skill({
    name: 'Slack Message Kit',
    slug: 'slack-message-kit',
    category: 'Communication',
    description: 'Compose concise status, alert, and handoff message blocks for Slack workflows.',
    long_description: 'Create structured Slack-ready messages from compact input payloads.',
    tags: ['slack', 'communication', 'status'],
    capabilities: [{ name: 'status_block', description: 'Builds a Slack-style status block string.', params: { title: 'string', status: 'string', details: 'string[]' }, returns: 'string' }],
    source_code: `class Skill {
  status_block(params) {
    const title = String(params.title || 'Status');
    const status = String(params.status || 'unknown').toUpperCase();
    const details = Array.isArray(params.details) ? params.details.map(item => '- ' + String(item)).join('\\\\n') : '';
    return '*' + title + '*\\\\nStatus: ' + status + (details ? '\\\\n' + details : '');
  }
}`,
    verify: { capability: 'status_block', params: { title: 'API', status: 'healthy', details: ['Latency stable', 'No incident'] }, expected: result => typeof result === 'string' && result.includes('Status: HEALTHY') },
  }),
  skill({
    name: 'Meeting Notes Formatter',
    slug: 'meeting-notes-formatter',
    category: 'Communication',
    description: 'Turn raw meeting notes into decisions, owners, and next-step summaries.',
    long_description: 'Normalize loose notes into a consistent summary format for follow-up and accountability.',
    tags: ['meetings', 'notes', 'summary'],
    capabilities: [{ name: 'format_notes', description: 'Formats meeting notes into sections.', params: { title: 'string', decisions: 'string[]', owners: 'object[]', nextSteps: 'string[]' }, returns: 'string' }],
    source_code: `class Skill {
  format_notes(params) {
    const title = String(params.title || 'Meeting Notes');
    const decisions = Array.isArray(params.decisions) ? params.decisions.map(item => '- ' + item).join('\\\\n') : '- None';
    const owners = Array.isArray(params.owners) ? params.owners.map(item => '- ' + String(item.name) + ': ' + String(item.item)).join('\\\\n') : '- None';
    const nextSteps = Array.isArray(params.nextSteps) ? params.nextSteps.map(item => '- ' + item).join('\\\\n') : '- None';
    return '# ' + title + '\\\\n\\\\n## Decisions\\\\n' + decisions + '\\\\n\\\\n## Owners\\\\n' + owners + '\\\\n\\\\n## Next Steps\\\\n' + nextSteps;
  }
}`,
    verify: { capability: 'format_notes', params: { title: 'V2 Launch', decisions: ['Ship docs'], owners: [{ name: 'Riz', item: 'Approve copy' }], nextSteps: ['Push to production'] }, expected: result => typeof result === 'string' && result.includes('## Decisions') && result.includes('Riz') },
  }),
  skill({
    name: 'Outreach Sequencer',
    slug: 'outreach-sequencer',
    category: 'Communication',
    description: 'Generate simple multi-step follow-up sequences and cadence suggestions.',
    long_description: 'Build predictable outreach sequences without requiring a full CRM workflow engine.',
    tags: ['outreach', 'sequencing', 'sales'],
    capabilities: [{ name: 'build_sequence', description: 'Builds a simple outreach sequence.', params: { contactName: 'string', product: 'string', steps: 'number' }, returns: 'object[]' }],
    source_code: `class Skill {
  build_sequence(params) {
    const contactName = String(params.contactName || 'there');
    const product = String(params.product || 'your product');
    const steps = Math.max(1, Number(params.steps || 3));
    return Array.from({ length: steps }, (_, index) => ({
      step: index + 1,
      dayOffset: index * 3,
      message: 'Hi ' + contactName + ', quick follow-up about ' + product + ' (step ' + (index + 1) + ').'
    }));
  }
}`,
    verify: { capability: 'build_sequence', params: { contactName: 'Ada', product: 'Agent OS', steps: 3 }, expected: result => Array.isArray(result) && result.length === 3 && result[0].message.includes('Ada') },
  }),
  skill({
    name: 'Contact Normalizer',
    slug: 'contact-normalizer',
    category: 'Communication',
    description: 'Normalize names, email fields, phone numbers, and role labels for contact lists.',
    long_description: 'Clean common contact fields before CRM import or outreach workflows.',
    tags: ['contacts', 'crm', 'normalization'],
    capabilities: [{ name: 'normalize_contact', description: 'Normalizes contact fields.', params: { name: 'string', email: 'string', phone: 'string', role: 'string' }, returns: 'object' }],
    source_code: `class Skill {
  normalize_contact(params) {
    const digits = String(params.phone || '').replace(/\\D+/g, '');
    return {
      name: String(params.name || '').trim().replace(/\\s+/g, ' '),
      email: String(params.email || '').trim().toLowerCase(),
      phone: digits,
      role: String(params.role || '').trim().toLowerCase().replace(/\\b\\w/g, m => m.toUpperCase())
    };
  }
}`,
    verify: { capability: 'normalize_contact', params: { name: '  Ada   Lovelace ', email: 'ADA@EXAMPLE.COM', phone: '+1 (555) 123-4567', role: 'sales lead' }, expected: result => result.email === 'ada@example.com' && result.phone === '15551234567' },
  }),
  skill({
    name: 'Env Auditor',
    slug: 'env-auditor',
    category: 'Cloud & Deploy',
    description: 'Check required environment variables for missing or empty values.',
    long_description: 'Use this before deploys to confirm required configuration is present.',
    tags: ['env', 'deploy', 'audit'],
    capabilities: [{ name: 'missing_required', description: 'Lists missing environment keys.', params: { required: 'string[]', provided: 'object' }, returns: 'string[]' }],
    source_code: `class Skill {
  missing_required(params) {
    const required = Array.isArray(params.required) ? params.required : [];
    const provided = params.provided && typeof params.provided === 'object' ? params.provided : {};
    return required.filter(key => !(key in provided) || provided[key] === null || provided[key] === undefined || String(provided[key]).trim() === '');
  }
}`,
    verify: { capability: 'missing_required', params: { required: ['JWT_SECRET', 'REDIS_URL', 'SUPABASE_URL'], provided: { JWT_SECRET: 'set', SUPABASE_URL: 'set' } }, expected: result => Array.isArray(result) && result.includes('REDIS_URL') },
  }),
  skill({
    name: 'Deployment Checklist',
    slug: 'deployment-checklist',
    category: 'Cloud & Deploy',
    description: 'Generate deploy readiness checklists and release gates.',
    long_description: 'Turn a list of checks into a release checklist that can be shared across teams.',
    tags: ['deploy', 'checklist', 'release'],
    capabilities: [{ name: 'generate', description: 'Builds a deploy checklist.', params: { service: 'string', checks: 'string[]' }, returns: 'string' }],
    source_code: `class Skill {
  generate(params) {
    const service = String(params.service || 'Service');
    const checks = Array.isArray(params.checks) ? params.checks.map(item => '- [ ] ' + item).join('\\\\n') : '- [ ] No checks supplied';
    return '# Deploy ' + service + '\\\\n\\\\n' + checks;
  }
}`,
    verify: { capability: 'generate', params: { service: 'Agent OS', checks: ['Run build', 'Check health endpoint'] }, expected: result => typeof result === 'string' && result.includes('Run build') },
  }),
  skill({
    name: 'Release Note Builder',
    slug: 'release-note-builder',
    category: 'Cloud & Deploy',
    description: 'Convert change items into customer-facing release notes.',
    long_description: 'Create clean release-note drafts from raw engineering change summaries.',
    tags: ['release-notes', 'deploy', 'changelog'],
    capabilities: [{ name: 'compose', description: 'Composes release notes.', params: { version: 'string', changes: 'string[]' }, returns: 'string' }],
    source_code: `class Skill {
  compose(params) {
    const version = String(params.version || 'v0');
    const changes = Array.isArray(params.changes) ? params.changes.map(item => '- ' + item).join('\\\\n') : '- No changes listed';
    return '## Release ' + version + '\\\\n\\\\n' + changes;
  }
}`,
    verify: { capability: 'compose', params: { version: 'v2.0.0', changes: ['Studio launched', 'Skills expanded'] }, expected: result => typeof result === 'string' && result.includes('Release v2.0.0') },
  }),
  skill({
    name: 'Statuspage Toolkit',
    slug: 'statuspage-toolkit',
    category: 'Cloud & Deploy',
    description: 'Prepare incident updates and maintenance window notices.',
    long_description: 'Generate structured customer-facing status updates quickly during incidents.',
    tags: ['statuspage', 'incident', 'ops'],
    capabilities: [{ name: 'incident_update', description: 'Builds an incident update payload.', params: { title: 'string', status: 'string', impact: 'string', nextUpdateMinutes: 'number' }, returns: 'object' }],
    source_code: `class Skill {
  incident_update(params) {
    const next = Number(params.nextUpdateMinutes || 30);
    return {
      title: String(params.title || 'Incident'),
      status: String(params.status || 'investigating'),
      impact: String(params.impact || 'unknown'),
      nextUpdateInMinutes: next,
      message: 'Next update in ' + next + ' minutes.'
    };
  }
}`,
    verify: { capability: 'incident_update', params: { title: 'API latency', status: 'monitoring', impact: 'minor', nextUpdateMinutes: 15 }, expected: result => result.nextUpdateInMinutes === 15 && result.message.includes('15') },
  }),
  skill({
    name: 'Incident Postmortem Kit',
    slug: 'incident-postmortem-kit',
    category: 'Cloud & Deploy',
    description: 'Structure timelines, causes, and follow-up action items after incidents.',
    long_description: 'Package root cause, timeline, and actions into a compact postmortem summary.',
    tags: ['incident', 'postmortem', 'ops'],
    capabilities: [{ name: 'build_summary', description: 'Builds a postmortem summary.', params: { incident: 'string', rootCause: 'string', actions: 'string[]' }, returns: 'object' }],
    source_code: `class Skill {
  build_summary(params) {
    return {
      incident: String(params.incident || 'Unknown incident'),
      rootCause: String(params.rootCause || 'Unknown'),
      actions: Array.isArray(params.actions) ? params.actions : [],
      followUpCount: Array.isArray(params.actions) ? params.actions.length : 0
    };
  }
}`,
    verify: { capability: 'build_summary', params: { incident: 'Token expiry', rootCause: 'Clock skew', actions: ['Add clock check', 'Extend monitoring'] }, expected: result => result.followUpCount === 2 },
  }),
  skill({
    name: 'Password Policy Checker',
    slug: 'password-policy-checker',
    category: 'Security',
    description: 'Evaluate passwords against baseline policy rules.',
    long_description: 'Check password strength and explain which baseline requirements fail.',
    tags: ['security', 'password', 'policy'],
    capabilities: [{ name: 'check', description: 'Checks password policy rules.', params: { password: 'string', minLength: 'number' }, returns: 'object' }],
    source_code: `class Skill {
  check(params) {
    const password = String(params.password || '');
    const minLength = Math.max(8, Number(params.minLength || 8));
    const reasons = [];
    if (password.length < minLength) reasons.push('min_length');
    if (!/[A-Z]/.test(password)) reasons.push('uppercase');
    if (!/[a-z]/.test(password)) reasons.push('lowercase');
    if (!/[0-9]/.test(password)) reasons.push('number');
    return { valid: reasons.length === 0, reasons };
  }
}`,
    verify: { capability: 'check', params: { password: 'Weakpass', minLength: 10 }, expected: result => result.valid === false && result.reasons.includes('number') },
  }),
  skill({
    name: 'PII Redactor',
    slug: 'pii-redactor',
    category: 'Security',
    description: 'Mask email addresses, phone numbers, and common identifiers in text.',
    long_description: 'Use deterministic masking for logs, tickets, and summaries before sharing them broadly.',
    tags: ['security', 'pii', 'redaction'],
    capabilities: [{ name: 'redact', description: 'Redacts common PII patterns.', params: { text: 'string' }, returns: 'string' }],
    source_code: `class Skill {
  redact(params) {
    return String(params.text || '')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/ig, '[redacted-email]')
      .replace(/\\+?\\d[\\d\\s().-]{7,}\\d/g, '[redacted-phone]');
  }
}`,
    verify: { capability: 'redact', params: { text: 'Email ada@example.com or call +1 (555) 123-4567' }, expected: result => typeof result === 'string' && result.includes('[redacted-email]') && result.includes('[redacted-phone]') },
  }),
  skill({
    name: 'Audit Log Formatter',
    slug: 'audit-log-formatter',
    category: 'Security',
    description: 'Normalize audit events into consistent report-friendly records.',
    long_description: 'Format actor, action, target, and timestamp into a predictable audit entry.',
    tags: ['security', 'audit', 'logs'],
    capabilities: [{ name: 'format_event', description: 'Formats an audit log entry.', params: { actor: 'string', action: 'string', target: 'string', timestamp: 'string' }, returns: 'string' }],
    source_code: `class Skill {
  format_event(params) {
    return '[' + String(params.timestamp || '') + '] ' + String(params.actor || 'unknown') + ' -> ' + String(params.action || 'acted') + ' -> ' + String(params.target || 'unknown');
  }
}`,
    verify: { capability: 'format_event', params: { actor: 'agent_1', action: 'rotate_secret', target: 'redis', timestamp: '2026-03-19T00:00:00Z' }, expected: result => typeof result === 'string' && result.includes('rotate_secret') },
  }),
  skill({
    name: 'Secret Scan Lite',
    slug: 'secret-scan-lite',
    category: 'Security',
    description: 'Flag obvious token and credential patterns in text blobs.',
    long_description: 'Catch common leaked token patterns before text leaves the system.',
    tags: ['security', 'secrets', 'scan'],
    capabilities: [{ name: 'scan', description: 'Scans for obvious secret patterns.', params: { text: 'string' }, returns: 'string[]' }],
    source_code: `class Skill {
  scan(params) {
    const text = String(params.text || '');
    const findings = [];
    if (/sk-[A-Za-z0-9]{10,}/.test(text)) findings.push('openai-style-token');
    if (/AKIA[0-9A-Z]{16}/.test(text)) findings.push('aws-access-key');
    if (/ghp_[A-Za-z0-9]{20,}/.test(text)) findings.push('github-token');
    return findings;
  }
}`,
    verify: { capability: 'scan', params: { text: 'Possible leak ghp_1234567890abcdefghijklmnop and sk-abcdef1234567890' }, expected: result => Array.isArray(result) && result.length >= 2 },
  }),
  skill({
    name: 'Access Review Toolkit',
    slug: 'access-review-toolkit',
    category: 'Security',
    description: 'Summarize role grants and review overdue access records.',
    long_description: 'Identify overdue access reviews from a list of grant records.',
    tags: ['security', 'access', 'review'],
    capabilities: [{ name: 'overdue_reviews', description: 'Returns overdue access reviews.', params: { reviews: 'object[]', today: 'string' }, returns: 'object[]' }],
    source_code: `class Skill {
  overdue_reviews(params) {
    const today = new Date(String(params.today || new Date().toISOString())).getTime();
    const reviews = Array.isArray(params.reviews) ? params.reviews : [];
    return reviews.filter(review => new Date(String(review.dueAt || '')).getTime() < today);
  }
}`,
    verify: { capability: 'overdue_reviews', params: { today: '2026-03-19T00:00:00Z', reviews: [{ user: 'a', dueAt: '2026-03-01T00:00:00Z' }, { user: 'b', dueAt: '2026-04-01T00:00:00Z' }] }, expected: result => Array.isArray(result) && result.length === 1 && result[0].user === 'a' },
  }),
  skill({
    name: 'SQL Helper',
    slug: 'sql-helper',
    category: 'Data & Analytics',
    description: 'Build safe where-clause fragments and query summaries.',
    long_description: 'Generate small SQL fragments from structured filter input rather than manual string assembly.',
    tags: ['sql', 'analytics', 'query'],
    capabilities: [{ name: 'where_clause', description: 'Builds a WHERE clause fragment.', params: { filters: 'object' }, returns: 'object' }],
    source_code: `class Skill {
  where_clause(params) {
    const filters = params.filters && typeof params.filters === 'object' ? params.filters : {};
    const keys = Object.keys(filters);
    return {
      clause: keys.length ? 'WHERE ' + keys.map((key, index) => key + ' = $' + (index + 1)).join(' AND ') : '',
      values: keys.map(key => filters[key])
    };
  }
}`,
    verify: { capability: 'where_clause', params: { filters: { region: 'lagos', status: 'active' } }, expected: result => result.clause.includes('region = $1') && result.values.length === 2 },
  }),
  skill({
    name: 'KPI Scorecard',
    slug: 'kpi-scorecard',
    category: 'Data & Analytics',
    description: 'Convert raw KPI values into scored status summaries.',
    long_description: 'Map KPIs against thresholds to produce red, amber, and green status output.',
    tags: ['kpi', 'scorecard', 'analytics'],
    capabilities: [{ name: 'score', description: 'Scores KPIs against thresholds.', params: { kpis: 'object', thresholds: 'object' }, returns: 'object[]' }],
    source_code: `class Skill {
  score(params) {
    const kpis = params.kpis && typeof params.kpis === 'object' ? params.kpis : {};
    const thresholds = params.thresholds && typeof params.thresholds === 'object' ? params.thresholds : {};
    return Object.keys(kpis).map(key => {
      const value = Number(kpis[key]);
      const threshold = Number(thresholds[key] || 0);
      return { key, value, threshold, status: value >= threshold ? 'green' : 'amber' };
    });
  }
}`,
    verify: { capability: 'score', params: { kpis: { uptime: 99.95, nps: 43 }, thresholds: { uptime: 99.9, nps: 50 } }, expected: result => Array.isArray(result) && result.some(item => item.key === 'uptime' && item.status === 'green') },
  }),
  skill({
    name: 'Cohort Calculator',
    slug: 'cohort-calculator',
    category: 'Data & Analytics',
    description: 'Calculate retention and grouped cohort metrics from labeled rows.',
    long_description: 'Produce simple retention percentages from grouped cohort inputs.',
    tags: ['cohort', 'retention', 'analytics'],
    capabilities: [{ name: 'retention', description: 'Calculates cohort retention.', params: { cohorts: 'object[]' }, returns: 'object[]' }],
    source_code: `class Skill {
  retention(params) {
    const cohorts = Array.isArray(params.cohorts) ? params.cohorts : [];
    return cohorts.map(cohort => ({
      label: String(cohort.label || ''),
      retained: Number(cohort.retained || 0),
      total: Number(cohort.total || 0),
      rate: Number(cohort.total || 0) === 0 ? 0 : Number(cohort.retained || 0) / Number(cohort.total || 0)
    }));
  }
}`,
    verify: { capability: 'retention', params: { cohorts: [{ label: '2026-01', retained: 80, total: 100 }, { label: '2026-02', retained: 36, total: 60 }] }, expected: result => Array.isArray(result) && result[0].rate === 0.8 },
  }),
  skill({
    name: 'Anomaly Rules',
    slug: 'anomaly-rules',
    category: 'Data & Analytics',
    description: 'Flag spikes and drops with threshold-based anomaly rules.',
    long_description: 'Use deterministic thresholds to detect sudden changes in a time series.',
    tags: ['anomaly', 'monitoring', 'analytics'],
    capabilities: [{ name: 'detect', description: 'Detects spikes and drops.', params: { series: 'number[]', spikeThreshold: 'number', dropThreshold: 'number' }, returns: 'object[]' }],
    source_code: `class Skill {
  detect(params) {
    const series = Array.isArray(params.series) ? params.series.map(Number) : [];
    const spikeThreshold = Number(params.spikeThreshold || 0.3);
    const dropThreshold = Number(params.dropThreshold || 0.3);
    const anomalies = [];
    for (let index = 1; index < series.length; index += 1) {
      const previous = series[index - 1];
      const current = series[index];
      if (previous === 0) continue;
      const delta = (current - previous) / previous;
      if (delta >= spikeThreshold) anomalies.push({ index, type: 'spike', delta });
      if (delta <= -dropThreshold) anomalies.push({ index, type: 'drop', delta });
    }
    return anomalies;
  }
}`,
    verify: { capability: 'detect', params: { series: [100, 102, 180, 120], spikeThreshold: 0.4, dropThreshold: 0.25 }, expected: result => Array.isArray(result) && result.some(item => item.type === 'spike') && result.some(item => item.type === 'drop') },
  }),
  skill({
    name: 'Forecast Basics',
    slug: 'forecast-basics',
    category: 'Data & Analytics',
    description: 'Project simple forward trends using lightweight averages.',
    long_description: 'Generate a short-horizon moving-average forecast from recent observations.',
    tags: ['forecast', 'analytics', 'time-series'],
    capabilities: [{ name: 'moving_average_forecast', description: 'Forecasts future values using a moving average.', params: { series: 'number[]', window: 'number', horizon: 'number' }, returns: 'number[]' }],
    source_code: `class Skill {
  moving_average_forecast(params) {
    const series = Array.isArray(params.series) ? params.series.map(Number) : [];
    const window = Math.max(1, Number(params.window || 3));
    const horizon = Math.max(1, Number(params.horizon || 1));
    const values = series.slice();
    const forecast = [];
    for (let step = 0; step < horizon; step += 1) {
      const segment = values.slice(-window);
      const avg = segment.reduce((sum, value) => sum + value, 0) / segment.length;
      forecast.push(Number(avg.toFixed(2)));
      values.push(avg);
    }
    return forecast;
  }
}`,
    verify: { capability: 'moving_average_forecast', params: { series: [10, 12, 14, 16], window: 2, horizon: 2 }, expected: result => Array.isArray(result) && result.length === 2 && result[0] === 15 },
  }),
];

function createBearerToken() {
  return jwt.sign({ sub: TARGET_AGENT_ID, allowedDomains: [] }, JWT_SECRET, { expiresIn: '1h' });
}

async function upsertSkills() {
  const records = NEW_OFFICIAL_SKILLS.map(({ verify, ...record }) => record);
  const { data, error } = await supabase
    .from('skills')
    .upsert(records, { onConflict: 'slug' })
    .select('id, slug');

  if (error) {
    throw new Error(`Failed to upsert official skills: ${error.message}`);
  }

  return data || [];
}

async function installAllVerifiedFreeSkills() {
  const { data: skills, error } = await supabase
    .from('skills')
    .select('id, slug')
    .eq('published', true)
    .eq('verified', true)
    .eq('pricing_model', 'free');

  if (error) {
    throw new Error(`Failed to load verified skills: ${error.message}`);
  }

  const installations = (skills || []).map(skillRecord => ({
    agent_id: TARGET_AGENT_ID,
    skill_id: skillRecord.id,
  }));

  if (installations.length > 0) {
    const { error: installError } = await supabase
      .from('skill_installations')
      .upsert(installations, { onConflict: 'agent_id,skill_id' });

    if (installError) {
      throw new Error(`Failed to install verified skills: ${installError.message}`);
    }
  }

  return skills || [];
}

async function verifySkill(token, definition) {
  const response = await fetch(`${APP_URL}/api/skills/use`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      skill_slug: definition.slug,
      capability: definition.verify.capability,
      params: definition.verify.params,
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${definition.slug} verification failed: ${body.error || response.statusText}`);
  }
  if (!definition.verify.expected(body.result)) {
    throw new Error(`${definition.slug} returned an unexpected result: ${JSON.stringify(body.result)}`);
  }

  return body.result;
}

async function main() {
  const upserted = await upsertSkills();
  const installedSkills = await installAllVerifiedFreeSkills();
  const token = createBearerToken();

  const verificationResults = [];
  for (const definition of NEW_OFFICIAL_SKILLS) {
    const result = await verifySkill(token, definition);
    verificationResults.push({ slug: definition.slug, result });
  }

  const { count, error } = await supabase
    .from('skills')
    .select('id', { count: 'exact', head: true })
    .eq('published', true)
    .eq('verified', true)
    .eq('pricing_model', 'free');

  if (error) {
    throw new Error(`Failed to count verified skills: ${error.message}`);
  }

  console.log(JSON.stringify({
    targetAgentId: TARGET_AGENT_ID,
    upserted: upserted.length,
    installedFreeVerifiedSkills: installedSkills.length,
    officialVerifiedFreeSkillCount: count || 0,
    verifiedNewSkills: verificationResults,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
