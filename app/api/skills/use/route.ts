import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { verifyAgentToken, extractBearerToken } from '@/src/auth/agent-identity';
import { runInNewContext } from 'vm';

export const runtime = 'nodejs';

// POST /api/skills/use - Execute a skill capability
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const token = extractBearerToken(request.headers.get('Authorization') ?? undefined);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let agentCtx;
  try {
    agentCtx = verifyAgentToken(token);
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { skill_slug, capability, params } = body as {
    skill_slug?: string;
    capability?: string;
    params?: Record<string, unknown>;
  };

  if (!skill_slug || !capability) {
    return NextResponse.json({ error: 'skill_slug and capability are required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Fetch skill
  const { data: skill, error: skillErr } = await supabase
    .from('skills')
    .select('id,slug,source_code,capabilities,pricing_model,price_per_call,free_tier_calls,total_calls,published')
    .eq('slug', skill_slug)
    .single();

  if (skillErr || !skill) {
    return NextResponse.json({ error: `Skill '${skill_slug}' not found` }, { status: 404 });
  }

  if (!skill.published) {
    return NextResponse.json({ error: 'Skill is not published' }, { status: 403 });
  }

  // Check installation
  const { data: installation } = await supabase
    .from('skill_installations')
    .select('id')
    .eq('agent_id', agentCtx.agentId)
    .eq('skill_id', skill.id)
    .single();

  if (!installation) {
    return NextResponse.json(
      { error: `Skill '${skill_slug}' is not installed. Call POST /api/skills/install first.` },
      { status: 403 }
    );
  }

  // Validate capability name is safe (alphanumeric + underscore only)
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(capability)) {
    return NextResponse.json({ error: 'Invalid capability name' }, { status: 400 });
  }

  // Validate capability exists on the skill
  const caps = Array.isArray(skill.capabilities) ? skill.capabilities : [];
  const capDef = caps.find((c: { name: string }) => c.name === capability);
  if (!capDef) {
    const available = caps.map((c: { name: string }) => c.name).join(', ');
    return NextResponse.json(
      { error: `Capability '${capability}' not found. Available: ${available}` },
      { status: 400 }
    );
  }

  // Execute in sandbox using Node's built-in vm module
  let result: unknown;
  let execError: string | null = null;
  try {
    const sandbox = {
      params: params ?? {},
      result: undefined as unknown,
      console: { log: () => {}, error: () => {}, warn: () => {} }, // no-op console
    };

    const code = `
      ${skill.source_code}
      const _skill = new Skill({});
      result = _skill['${capability}'](params);
    `;

    runInNewContext(code, sandbox, { timeout: 10_000 });
    result = sandbox.result;
  } catch (err: unknown) {
    execError = err instanceof Error ? err.message : String(err);
  }

  const executionTimeMs = Date.now() - startTime;

  // Log usage (best-effort)
  supabase.from('skill_usage').insert({
    agent_id: agentCtx.agentId,
    skill_id: skill.id,
    capability_name: capability,
    execution_time_ms: executionTimeMs,
    success: !execError,
    error_message: execError,
    cost: skill.price_per_call ?? 0,
  }).then(() => {
    if (!execError) {
      supabase.from('skills')
        .update({ total_calls: (skill.total_calls ?? 0) + 1 })
        .eq('id', skill.id)
        .then(() => {});
    }
  });

  if (execError) {
    return NextResponse.json(
      { error: execError, execution_time_ms: executionTimeMs },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, result, execution_time_ms: executionTimeMs });
}
