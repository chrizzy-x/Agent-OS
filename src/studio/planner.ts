import { getRedisClient } from '../storage/redis.js';

// In-memory fallback for when Redis is unavailable
const LOCAL_TOKENS = new Map<string, { value: string; expiresAt: number }>();

function pruneTokens() {
  const now = Date.now();
  for (const [k, e] of LOCAL_TOKENS) { if (e.expiresAt < now) LOCAL_TOKENS.delete(k); }
}

export async function tokenSet(key: string, ttlSeconds: number, value: string): Promise<void> {
  try { await getRedisClient().setex(key, ttlSeconds, value); return; } catch { /* fall through */ }
  pruneTokens();
  LOCAL_TOKENS.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function tokenGet(key: string): Promise<string | null> {
  try {
    const val = await getRedisClient().get(key);
    if (val !== null) return val;
  } catch { /* fall through */ }
  const entry = LOCAL_TOKENS.get(key);
  if (!entry || entry.expiresAt < Date.now()) { LOCAL_TOKENS.delete(key); return null; }
  return entry.value;
}

export async function tokenDel(key: string): Promise<void> {
  try { await getRedisClient().del(key); } catch { /* ignore */ }
  LOCAL_TOKENS.delete(key);
}

export const TOKEN_TTL_SECONDS = 1800; // 30 minutes

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

export const SYSTEM_PROMPT = `You are an AgentOS workflow planner. Given a plain-English instruction, return ONLY valid JSON — no prose, no markdown, no code fences.

Tool reference (tool_name → required fields → example input):
- net_http_get      → { url }                              → { "url": "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd" }
- net_http_post     → { url, body }                        → { "url": "https://...", "body": {} }
- net_http_put      → { url, body }                        → { "url": "https://...", "body": {} }
- net_http_delete   → { url }                              → { "url": "https://..." }
- mem_set           → { key, value }                       → { "key": "btc_price", "value": 50000 }
- mem_get           → { key }                              → { "key": "btc_price" }
- mem_delete        → { key }                              → { "key": "btc_price" }
- mem_list          → {}                                   → {}
- mem_remember      → { key, content }                     → { "key": "btc_analysis", "content": "BTC skew extreme", "tags": ["btc"] }
- mem_recall        → { query }                            → { "query": "btc" }
- db_query          → { sql }                              → { "sql": "SELECT * FROM prices LIMIT 10" }
- db_insert         → { table, data }                      → { "table": "prices", "data": { "symbol": "BTC", "price": 50000 } }
- db_create_table   → { table, schema }                    → { "table": "prices", "schema": [{ "column": "id", "type": "uuid", "primaryKey": true }, { "column": "price", "type": "float" }] }
- fs_read           → { path }                             → { "path": "data/output.txt" }
- fs_write          → { path, content }                    → { "path": "data/output.txt", "content": "hello" }
- fs_list           → { path }                             → { "path": "data" }
- fs_delete         → { path }                             → { "path": "data/output.txt" }
- proc_execute      → { code, language }                   → { "code": "console.log('hello')", "language": "javascript" }
- proc_schedule     → { expression, tool, input }          → { "expression": "0 * * * *", "tool": "agentos.notify_send", "input": { "channel": "email", "to": "user@example.com", "message": "Price update" } }
- events_publish    → { topic, message }                   → { "topic": "price_updates", "message": { "price": 50000 } }
- events_subscribe  → { topic }                            → { "topic": "price_updates" }
- notify_send       → { channel, to, message, subject? }   → { "channel": "email", "to": "user@example.com", "message": "BTC is $50000", "subject": "Price Alert" }
- notify_send (WhatsApp) →                                 → { "channel": "whatsapp", "to": "+1234567890", "message": "BTC is $50000" }
- notify_send (Telegram) →                                 → { "channel": "telegram", "to": "<chat_id>", "message": "BTC is $50000" }
- notify_send (webhook)  →                                 → { "channel": "webhook", "to": "https://hooks.slack.com/...", "message": "BTC is $50000" }
- agent_deploy      → { name, description? }               → { "name": "My Research Bot", "description": "Monitors crypto prices" }

Return this exact JSON structure:
{
  "summary": "Human readable description of what will happen",
  "steps": [
    {
      "order": 1,
      "tool": "agentos.{tool_name}",
      "input": {},
      "description": "What this step does"
    }
  ],
  "schedule": "cron expression or null",
  "missingParams": []
}

Rules:
- tool must be prefixed with "agentos." e.g. "agentos.net_http_get"
- input must be a valid JSON object matching that tool's expected parameters
- ALWAYS produce a complete, executable plan regardless of how vague the instruction is
- If a URL is not specified, use a sensible public API (e.g. CoinGecko for crypto prices, OpenMeteo for weather)
- If a key name is not specified, infer a sensible one from context (e.g. "btc_price", "eth_price")
- If a value is ambiguous, use the most common/obvious interpretation
- NEVER ask for clarification — always make your best guess and build the plan
- missingParams must always be an empty array []
- schedule is null unless the instruction implies recurring execution (e.g. "every hour", "daily", "every 5 minutes")
- For scheduled tasks, use proc_schedule with the recurring tool as input (e.g. net_http_get or net_http_post)
- For EMAIL tasks: use notify_send with channel "email" and to = the recipient email address
- For WHATSAPP tasks: use notify_send with channel "whatsapp" and to = phone number with country code (e.g. "+1234567890")
- For TELEGRAM tasks: use notify_send with channel "telegram" and to = the Telegram chat ID
- For SLACK/DISCORD tasks: use notify_send with channel "slack" or "discord" and to = the webhook URL
- AgentOS Studio shows results inside the AgentOS UI by default. For "tell me", "show me", "answer", "return", or similar requests, DO NOT use notify_send.
- Use notify_send only when the instruction explicitly names an outbound channel AND includes the exact recipient, chat ID, phone number, email address, or webhook URL.
- NEVER invent recipients such as "user", "me", "tg", "telegram", "<chat_id>", or placeholders.
- If the user asks for Telegram/WhatsApp/SMS/email/webhook delivery but does not provide the destination, omit notify_send and return the result in AgentOS.
- For SCHEDULING tasks (hourly, daily, every N minutes): use proc_schedule with expression (cron), tool (agentos.notify_send or agentos.net_http_get etc), and input
- When user wants to "monitor X and notify every Y": use net_http_get to fetch, mem_set to store, proc_schedule to repeat, notify_send to alert — all as separate steps
- For proc_execute: ALWAYS use language "javascript" — Python and Bash are not available in this environment
- NEVER generate proc_execute with Python or Bash code
- Return ONLY the JSON object, nothing else`;

export interface PlanStep {
  order: number;
  tool: string;
  input: Record<string, unknown>;
  description: string;
}

export interface Plan {
  summary: string;
  steps: PlanStep[];
  schedule: string | null;
  missingParams: string[];
}

const NOTIFY_TOOLS = new Set(['notify_send', 'agentos.notify_send']);
const SCHEDULE_TOOLS = new Set(['proc_schedule', 'agentos.proc_schedule']);
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /\+\d[\d\s().-]{6,}\d/;
const WEBHOOK_RE = /https:\/\/\S+/i;
const TELEGRAM_DEST_RE = /(?:^|\s)(@\w{4,}|-?\d{5,})(?:\s|$)/;

function normalizeToolName(tool: string): string {
  return tool.trim().replace(/^agentos\./, '');
}

function stringInputValue(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === 'string' ? value.trim() : '';
}

function containsLiteral(instruction: string, value: string): boolean {
  return Boolean(value) && instruction.toLowerCase().includes(value.toLowerCase());
}

function hasExplicitNotifyDestination(instruction: string, input: Record<string, unknown>): boolean {
  const channel = stringInputValue(input, 'channel').toLowerCase();
  const to = stringInputValue(input, 'to');

  if (!channel || !to || ['user', 'me', 'tg', 'telegram', '<chat_id>'].includes(to.toLowerCase())) {
    return false;
  }

  if (!containsLiteral(instruction, channel) && channel !== 'webhook') {
    return false;
  }

  if (containsLiteral(instruction, to)) {
    return true;
  }

  if (channel === 'email') return EMAIL_RE.test(instruction) && EMAIL_RE.test(to);
  if (channel === 'sms' || channel === 'whatsapp') return PHONE_RE.test(instruction) && PHONE_RE.test(to);
  if (channel === 'slack' || channel === 'discord' || channel === 'webhook') return WEBHOOK_RE.test(instruction) && WEBHOOK_RE.test(to);
  if (channel === 'telegram') return TELEGRAM_DEST_RE.test(instruction) && TELEGRAM_DEST_RE.test(to);

  return false;
}

function isUnsafeImplicitNotification(instruction: string, step: PlanStep): boolean {
  const tool = normalizeToolName(step.tool);
  if (NOTIFY_TOOLS.has(step.tool) || tool === 'notify_send') {
    return !hasExplicitNotifyDestination(instruction, step.input);
  }

  if (SCHEDULE_TOOLS.has(step.tool) || tool === 'proc_schedule') {
    const nestedTool = typeof step.input.tool === 'string' ? step.input.tool : '';
    const nestedInput = step.input.input && typeof step.input.input === 'object' && !Array.isArray(step.input.input)
      ? step.input.input as Record<string, unknown>
      : {};
    if (normalizeToolName(nestedTool) === 'notify_send') {
      return !hasExplicitNotifyDestination(instruction, nestedInput);
    }
  }

  return false;
}

export function sanitizeStudioPlan(instruction: string, plan: Plan): Plan {
  const safeSteps = plan.steps.filter(step => !isUnsafeImplicitNotification(instruction, step));
  const removedImplicitNotification = safeSteps.length !== plan.steps.length;
  const reindexedSteps = safeSteps.map((step, index) => ({ ...step, order: index + 1 }));
  const hasScheduledStep = reindexedSteps.some(step => normalizeToolName(step.tool) === 'proc_schedule');

  return {
    ...plan,
    summary: removedImplicitNotification
      ? 'AgentOS will run the requested steps and show the result here.'
      : plan.summary,
    steps: reindexedSteps,
    schedule: hasScheduledStep ? plan.schedule : null,
    missingParams: Array.isArray(plan.missingParams) ? plan.missingParams : [],
  };
}

export async function callClaude(instruction: string): Promise<Plan> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Studio AI is not configured. Contact the platform owner to set ANTHROPIC_API_KEY.');

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: instruction }],
    }),
  });

  const data = await res.json() as { content?: Array<{ type: string; text: string }>; error?: { message: string } };
  if (!res.ok) throw new Error(data.error?.message ?? 'Anthropic API error');

  const text = data.content?.find(c => c.type === 'text')?.text ?? '';
  const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  return sanitizeStudioPlan(instruction, JSON.parse(cleaned) as Plan);
}
