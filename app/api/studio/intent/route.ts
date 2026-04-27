import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { getRedisClient } from '@/src/storage/redis';
import { toErrorResponse } from '@/src/utils/errors';
import { registerExternalAgent } from '@/src/external-agents/service';
import { executeUniversalToolCall } from '@/src/mcp/registry';

export const runtime = 'nodejs';

// In-memory fallback for when Redis is unavailable
const LOCAL_TOKENS = new Map<string, { value: string; expiresAt: number }>();

function pruneTokens() {
  const now = Date.now();
  for (const [k, e] of LOCAL_TOKENS) { if (e.expiresAt < now) LOCAL_TOKENS.delete(k); }
}

async function tokenSet(key: string, ttlSeconds: number, value: string): Promise<void> {
  try { await getRedisClient().setex(key, ttlSeconds, value); return; } catch { /* fall through */ }
  pruneTokens();
  LOCAL_TOKENS.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

async function tokenGet(key: string): Promise<string | null> {
  try {
    const val = await getRedisClient().get(key);
    if (val !== null) return val;
  } catch { /* fall through */ }
  const entry = LOCAL_TOKENS.get(key);
  if (!entry || entry.expiresAt < Date.now()) { LOCAL_TOKENS.delete(key); return null; }
  return entry.value;
}

async function tokenDel(key: string): Promise<void> {
  try { await getRedisClient().del(key); } catch { /* ignore */ }
  LOCAL_TOKENS.delete(key);
}

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const TOKEN_TTL_SECONDS = 1800; // 30 minutes

const SYSTEM_PROMPT = `You are an AgentOS workflow planner. Given a plain-English instruction, return ONLY valid JSON — no prose, no markdown, no code fences.

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

async function callClaude(instruction: string): Promise<{
  summary: string;
  steps: Array<{ order: number; tool: string; input: Record<string, unknown>; description: string }>;
  schedule: string | null;
  missingParams: string[];
}> {
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
  // Strip any accidental markdown code fences
  const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  return JSON.parse(cleaned) as ReturnType<typeof callClaude> extends Promise<infer T> ? T : never;
}

// POST /api/studio/intent
export async function POST(req: NextRequest) {
  try {
    const ctx = requireAgentContext(req.headers);

    let body: { instruction?: string; confirm?: boolean; confirmToken?: string | null };
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { instruction, confirm = false, confirmToken } = body;

    // ── CONFIRM EXECUTION ───────────────────────────────────────────────────
    if (confirm && confirmToken) {
      const stored = await tokenGet(`intent:token:${confirmToken}`);
      if (!stored) return NextResponse.json({ error: 'Plan expired — please re-submit your instruction and confirm within 30 minutes.' }, { status: 400 });

      const plan = JSON.parse(stored) as {
        summary: string;
        steps: Array<{ order: number; tool: string; input: Record<string, unknown>; description: string }>;
        schedule: string | null;
        workflowName: string;
        agentId: string;
      };

      if (plan.agentId !== ctx.agentId) return NextResponse.json({ error: 'Token mismatch' }, { status: 403 });

      // Delete token immediately (one-time use)
      await tokenDel(`intent:token:${confirmToken}`);

      // Execute steps in order via MCP router
      const results: unknown[] = [];
      for (const step of plan.steps.sort((a, b) => a.order - b.order)) {
        const toolName = step.tool.replace(/^agentos\./, '');

        if (step.tool === 'agentos.agent_deploy') {
          const agentName = typeof step.input.name === 'string' && step.input.name.trim()
            ? step.input.name.trim()
            : 'Studio Agent';
          const desc = typeof step.input.description === 'string' ? step.input.description : null;
          const suffix = crypto.randomBytes(4).toString('hex');
          const agentId = agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) + '-' + suffix;
          const deployResult = await registerExternalAgent({
            agentId,
            name: agentName,
            description: desc,
            ownerEmail: ctx.agentId,
            allowedDomains: ['*'],
            allowedTools: [],
          });
          results.push({ step: step.order, tool: 'agent_deploy', result: { agentId: deployResult.agentId, token: deployResult.token, message: 'Agent deployed successfully' } });
          continue;
        }

        const result = await executeUniversalToolCall({
          agentContext: ctx,
          name: step.tool,
          server: undefined,
          arguments: step.input,
        });
        results.push({ step: step.order, tool: toolName, result });
      }

      // Save workflow to DB
      const supabase = getSupabaseAdmin();
      const { data: wf } = await supabase.from('agent_workflows').insert({
        agent_id: ctx.agentId,
        name: plan.workflowName,
        summary: plan.summary,
        steps: plan.steps,
        schedule: plan.schedule,
        status: 'active',
      }).select('id').single();

      return NextResponse.json({
        executed: true,
        results,
        workflowId: wf?.id ?? null,
        schedule: plan.schedule,
      });
    }

    // ── PLAN GENERATION ─────────────────────────────────────────────────────
    if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
      return NextResponse.json({ error: 'instruction is required' }, { status: 400 });
    }

    const plan = await callClaude(instruction.trim());

    // Generate confirm token
    const token = crypto.randomUUID().replace(/-/g, '');
    await tokenSet(`intent:token:${token}`, TOKEN_TTL_SECONDS, JSON.stringify({
      ...plan,
      workflowName: instruction.trim().slice(0, 80),
      agentId: ctx.agentId,
    }));

    return NextResponse.json({
      summary: plan.summary,
      steps: plan.steps,
      schedule: plan.schedule,
      missingParams: [],
      confirmToken: token,
      requiresInput: false,
    });
  } catch (error: unknown) {
    console.error('[studio/intent]', error instanceof Error ? error.message : error);
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
