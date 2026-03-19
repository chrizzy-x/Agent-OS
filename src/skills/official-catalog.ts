export type OfficialSkillEntry = {
  slug: string;
  name: string;
  category: string;
  pack: string;
  summary: string;
};

export type OfficialSkillPack = {
  slug: string;
  name: string;
  description: string;
  categories: string[];
};

export const MARKETPLACE_CATEGORIES = [
  'All',
  'AI & ML',
  'Cloud & Deploy',
  'Communication',
  'Content',
  'Data & Analytics',
  'Documents',
  'Finance & Crypto',
  'Network',
  'Research',
  'Security',
  'Support',
  'Utilities',
  'Web & Browser',
] as const;

export const OFFICIAL_SKILL_PACKS: OfficialSkillPack[] = [
  {
    slug: 'core-utilities',
    name: 'Core Utilities',
    description: 'Baseline transformation, formatting, and request-building helpers for most agents.',
    categories: ['Utilities', 'Network', 'Content', 'Data & Analytics'],
  },
  {
    slug: 'finance-and-ops',
    name: 'Finance and Ops',
    description: 'Portfolio, risk, and operational calculation helpers for finance-heavy workflows.',
    categories: ['Finance & Crypto'],
  },
  {
    slug: 'research-and-support',
    name: 'Research and Support',
    description: 'Knowledge, summarization, ticket routing, and SLA helpers for research and support teams.',
    categories: ['Research', 'Support'],
  },
  {
    slug: 'ai-and-evals',
    name: 'AI and Evals',
    description: 'Prompt prep, evaluation, labeling, and heuristic classification utilities for AI workflows.',
    categories: ['AI & ML'],
  },
  {
    slug: 'communication-and-delivery',
    name: 'Communication and Delivery',
    description: 'Message, outreach, meeting, and release communication helpers for shipping teams.',
    categories: ['Communication', 'Cloud & Deploy'],
  },
  {
    slug: 'security-and-analytics',
    name: 'Security and Analytics',
    description: 'Governance, redaction, anomaly, KPI, and forecasting helpers for safer production ops.',
    categories: ['Security', 'Data & Analytics'],
  },
];

export const OFFICIAL_VERIFIED_SKILLS: OfficialSkillEntry[] = [
  { slug: 'text-utils', name: 'Text Utilities', category: 'Utilities', pack: 'core-utilities', summary: 'Normalize text, casing, slugs, and simple string transforms.' },
  { slug: 'math-stats', name: 'Math & Stats', category: 'Data & Analytics', pack: 'core-utilities', summary: 'Compute averages, sums, and small analytical rollups.' },
  { slug: 'csv-processor', name: 'CSV Processor', category: 'Data & Analytics', pack: 'core-utilities', summary: 'Parse CSV text and aggregate selected columns quickly.' },
  { slug: 'json-transformer', name: 'JSON Transformer', category: 'Data & Analytics', pack: 'core-utilities', summary: 'Extract and reshape nested JSON payloads.' },
  { slug: 'http-request-builder', name: 'HTTP Request Builder', category: 'Network', pack: 'core-utilities', summary: 'Build headers, query strings, and response helpers for HTTP workflows.' },
  { slug: 'date-time', name: 'Date & Time', category: 'Utilities', pack: 'core-utilities', summary: 'Format dates, add durations, and compare time windows.' },
  { slug: 'regex-toolkit', name: 'Regex Toolkit', category: 'Utilities', pack: 'core-utilities', summary: 'Extract, test, and replace text using regular-expression helpers.' },
  { slug: 'markdown-toolkit', name: 'Markdown Toolkit', category: 'Content', pack: 'core-utilities', summary: 'Generate checklists, headings, and markdown sections from data.' },
  { slug: 'array-toolkit', name: 'Array Toolkit', category: 'Utilities', pack: 'core-utilities', summary: 'Deduplicate, chunk, sort, and summarize arrays.' },
  { slug: 'url-toolkit', name: 'URL Toolkit', category: 'Network', pack: 'core-utilities', summary: 'Parse origins, query strings, and normalized URL components.' },
  { slug: 'template-renderer', name: 'Template Renderer', category: 'Content', pack: 'core-utilities', summary: 'Render small tokenized templates for messages and reports.' },
  { slug: 'validation-toolkit', name: 'Validation Toolkit', category: 'Utilities', pack: 'core-utilities', summary: 'Validate required fields and common input constraints.' },
  { slug: 'finance-calculator', name: 'Finance Calculator', category: 'Finance & Crypto', pack: 'finance-and-ops', summary: 'Calculate margins, fees, and simple financial ratios.' },
  { slug: 'portfolio-rebalancer', name: 'Portfolio Rebalancer', category: 'Finance & Crypto', pack: 'finance-and-ops', summary: 'Compare target allocations against current portfolio weights.' },
  { slug: 'risk-scoring-toolkit', name: 'Risk Scoring Toolkit', category: 'Finance & Crypto', pack: 'finance-and-ops', summary: 'Score exposures using simple weighted rules.' },
  { slug: 'candle-analyzer', name: 'Candle Analyzer', category: 'Finance & Crypto', pack: 'finance-and-ops', summary: 'Inspect OHLC candles for body, wick, and direction metrics.' },
  { slug: 'research-notes-toolkit', name: 'Research Notes Toolkit', category: 'Research', pack: 'research-and-support', summary: 'Structure research notes, highlights, and evidence summaries.' },
  { slug: 'citation-formatter', name: 'Citation Formatter', category: 'Research', pack: 'research-and-support', summary: 'Format citations consistently for research outputs.' },
  { slug: 'experiment-tracker', name: 'Experiment Tracker', category: 'Research', pack: 'research-and-support', summary: 'Track experiment variants, statuses, and small result summaries.' },
  { slug: 'survey-analyzer', name: 'Survey Analyzer', category: 'Research', pack: 'research-and-support', summary: 'Summarize survey answers and compute quick response metrics.' },
  { slug: 'knowledge-chunker', name: 'Knowledge Chunker', category: 'Research', pack: 'research-and-support', summary: 'Split long text into retrieval-friendly sections.' },
  { slug: 'support-sla-toolkit', name: 'Support SLA Toolkit', category: 'Support', pack: 'research-and-support', summary: 'Measure response windows and SLA breach risk.' },
  { slug: 'ticket-prioritizer', name: 'Ticket Prioritizer', category: 'Support', pack: 'research-and-support', summary: 'Rank support tickets by urgency and business impact.' },
  { slug: 'sentiment-heuristics', name: 'Sentiment Heuristics', category: 'Support', pack: 'research-and-support', summary: 'Classify basic sentiment with deterministic rules.' },
  { slug: 'conversation-summarizer', name: 'Conversation Summarizer', category: 'Support', pack: 'research-and-support', summary: 'Turn chat transcripts into compact summaries and action items.' },
  { slug: 'escalation-router', name: 'Escalation Router', category: 'Support', pack: 'research-and-support', summary: 'Route cases to the right team based on rules and urgency.' },
  { slug: 'prompt-toolkit', name: 'Prompt Toolkit', category: 'AI & ML', pack: 'ai-and-evals', summary: 'Extract variables, generate prompt variants, and inspect prompt structure.' },
  { slug: 'eval-scorecard', name: 'Eval Scorecard', category: 'AI & ML', pack: 'ai-and-evals', summary: 'Calculate pass rates and weighted evaluation summaries.' },
  { slug: 'classifier-heuristics', name: 'Classifier Heuristics', category: 'AI & ML', pack: 'ai-and-evals', summary: 'Label common workflow items with deterministic classifier rules.' },
  { slug: 'embedding-prep', name: 'Embedding Prep', category: 'AI & ML', pack: 'ai-and-evals', summary: 'Estimate tokens and prepare content for embedding pipelines.' },
  { slug: 'dataset-labeler', name: 'Dataset Labeler', category: 'AI & ML', pack: 'ai-and-evals', summary: 'Count labels and enforce dataset annotation consistency.' },
  { slug: 'email-template-builder', name: 'Email Template Builder', category: 'Communication', pack: 'communication-and-delivery', summary: 'Generate subject lines, greetings, and structured outbound email drafts.' },
  { slug: 'slack-message-kit', name: 'Slack Message Kit', category: 'Communication', pack: 'communication-and-delivery', summary: 'Compose concise status, alert, and handoff message blocks.' },
  { slug: 'meeting-notes-formatter', name: 'Meeting Notes Formatter', category: 'Communication', pack: 'communication-and-delivery', summary: 'Turn raw notes into decisions, owners, and next-step summaries.' },
  { slug: 'outreach-sequencer', name: 'Outreach Sequencer', category: 'Communication', pack: 'communication-and-delivery', summary: 'Generate follow-up sequences and cadence suggestions.' },
  { slug: 'contact-normalizer', name: 'Contact Normalizer', category: 'Communication', pack: 'communication-and-delivery', summary: 'Normalize names, phone fields, and role labels for contact lists.' },
  { slug: 'env-auditor', name: 'Env Auditor', category: 'Cloud & Deploy', pack: 'communication-and-delivery', summary: 'Check required environment variables for missing or empty values.' },
  { slug: 'deployment-checklist', name: 'Deployment Checklist', category: 'Cloud & Deploy', pack: 'communication-and-delivery', summary: 'Generate deploy readiness checklists and release gates.' },
  { slug: 'release-note-builder', name: 'Release Note Builder', category: 'Cloud & Deploy', pack: 'communication-and-delivery', summary: 'Convert change items into customer-facing release notes.' },
  { slug: 'statuspage-toolkit', name: 'Statuspage Toolkit', category: 'Cloud & Deploy', pack: 'communication-and-delivery', summary: 'Prepare incident updates and maintenance window notices.' },
  { slug: 'incident-postmortem-kit', name: 'Incident Postmortem Kit', category: 'Cloud & Deploy', pack: 'communication-and-delivery', summary: 'Structure timelines, causes, and follow-up action items after incidents.' },
  { slug: 'password-policy-checker', name: 'Password Policy Checker', category: 'Security', pack: 'security-and-analytics', summary: 'Evaluate passwords against baseline policy rules.' },
  { slug: 'pii-redactor', name: 'PII Redactor', category: 'Security', pack: 'security-and-analytics', summary: 'Mask email addresses, phone numbers, and common identifiers in text.' },
  { slug: 'audit-log-formatter', name: 'Audit Log Formatter', category: 'Security', pack: 'security-and-analytics', summary: 'Normalize audit events into consistent report-friendly records.' },
  { slug: 'secret-scan-lite', name: 'Secret Scan Lite', category: 'Security', pack: 'security-and-analytics', summary: 'Flag obvious token and credential patterns in text blobs.' },
  { slug: 'access-review-toolkit', name: 'Access Review Toolkit', category: 'Security', pack: 'security-and-analytics', summary: 'Summarize role grants and review overdue access records.' },
  { slug: 'sql-helper', name: 'SQL Helper', category: 'Data & Analytics', pack: 'security-and-analytics', summary: 'Build safe where-clause fragments and query summaries.' },
  { slug: 'kpi-scorecard', name: 'KPI Scorecard', category: 'Data & Analytics', pack: 'security-and-analytics', summary: 'Convert raw KPI values into scored status summaries.' },
  { slug: 'cohort-calculator', name: 'Cohort Calculator', category: 'Data & Analytics', pack: 'security-and-analytics', summary: 'Calculate retention and grouped cohort metrics from labeled rows.' },
  { slug: 'anomaly-rules', name: 'Anomaly Rules', category: 'Data & Analytics', pack: 'security-and-analytics', summary: 'Flag spikes and drops with threshold-based anomaly rules.' },
  { slug: 'forecast-basics', name: 'Forecast Basics', category: 'Data & Analytics', pack: 'security-and-analytics', summary: 'Project simple forward trends using lightweight averages.' },
];

export function getOfficialSkillCount(): number {
  return OFFICIAL_VERIFIED_SKILLS.length;
}

export function getOfficialSkillsByPack(packSlug: string): OfficialSkillEntry[] {
  return OFFICIAL_VERIFIED_SKILLS.filter(skill => skill.pack === packSlug);
}
