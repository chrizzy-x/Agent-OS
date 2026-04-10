import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { getRedisClient } from '@/src/storage/redis';
import { toErrorResponse } from '@/src/utils/errors';
import { executeUniversalToolCall } from '@/src/mcp/registry';

export const runtime = 'nodejs';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const TOKEN_TTL_SECONDS = 300; // 5 minutes

const SYSTEM_PROMPT = `You are an AgentOS workflow planner. Given a plain-English instruction, return ONLY valid JSON — no prose, no markdown, no code fences.

Available primitives and their tools:
- net: net_http_get, net_http_post, net_http_put, net_http_delete
- mem: mem_set, mem_get, mem_delete, mem_list, mem_remember, mem_recall
- db: db_query, db_insert, db_update, db_delete, db_create_table
- fs: fs_read, fs_write, fs_list, fs_delete
- proc: proc_execute, proc_schedule
- events: events_publish, events_subscribe

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
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured');

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
    const redis = getRedisClient();

    // ── CONFIRM EXECUTION ───────────────────────────────────────────────────
    if (confirm && confirmToken) {
      const stored = await redis.get(`intent:token:${confirmToken}`);
      if (!stored) return NextResponse.json({ error: 'Confirm token expired or invalid' }, { status: 400 });

      const plan = JSON.parse(stored) as {
        summary: string;
        steps: Array<{ order: number; tool: string; input: Record<string, unknown>; description: string }>;
        schedule: string | null;
        workflowName: string;
        agentId: string;
      };

      if (plan.agentId !== ctx.agentId) return NextResponse.json({ error: 'Token mismatch' }, { status: 403 });

      // Delete token immediately (one-time use)
      await redis.del(`intent:token:${confirmToken}`);

      // Execute steps in order via MCP router
      const results: unknown[] = [];
      for (const step of plan.steps.sort((a, b) => a.order - b.order)) {
        const toolName = step.tool.replace(/^agentos\./, '');
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
    await redis.setex(`intent:token:${token}`, TOKEN_TTL_SECONDS, JSON.stringify({
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
