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
- proc_execute      → { code, language }                   → { "code": "print('hello')", "language": "python" }
- proc_schedule     → { expression, tool, input }          → { "expression": "*/5 * * * *", "tool": "net_http_get", "input": { "url": "https://..." } }
- events_publish    → { topic, message }                   → { "topic": "price_updates", "message": { "price": 50000 } }
- events_subscribe  → { topic }                            → { "topic": "price_updates" }
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
- schedule is null unless the instruction implies recurring execution (e.g. "every minute", "daily")
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
  return JSON.parse(cleaned) as Plan;
}
