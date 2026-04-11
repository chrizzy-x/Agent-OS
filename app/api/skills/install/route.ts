import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { readLocalRuntimeState, updateLocalRuntimeState } from '@/src/storage/local-state';
import { requireAgentContext } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const agentCtx = requireAgentContext(request.headers);
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json', message: 'Invalid JSON body' }, { status: 400 });
    }

    const { skill_id } = body as { skill_id?: string };
    if (!skill_id) {
      return NextResponse.json({ error: 'validation_error', message: 'skill_id is required' }, { status: 400 });
    }

    try {
      const supabase = getSupabaseAdmin();
      const { data: skill, error: skillErr } = await supabase
        .from('skills')
        .select('id, name, total_installs')
        .eq('id', skill_id)
        .eq('published', true)
        .single();

      if (!skillErr && skill) {
        const { data, error } = await supabase
          .from('skill_installations')
          .insert({ agent_id: agentCtx.agentId, skill_id })
          .select()
          .single();

        if (!error) {
          await supabase.from('skills').update({ total_installs: (skill.total_installs ?? 0) + 1 }).eq('id', skill_id);
          return NextResponse.json({ success: true, installation: data }, { status: 201 });
        }

        if (error.code === '23505') {
          return NextResponse.json({ error: 'conflict', message: 'Skill already installed' }, { status: 409 });
        }
      }
    } catch {
      // Fall back to local store below.
    }

    const state = await readLocalRuntimeState();
    const skill = state.skills.catalog.find(item => item.id === skill_id && item.published);
    if (!skill) {
      return NextResponse.json({ error: 'not_found', message: 'Skill not found or not published' }, { status: 404 });
    }

    const existing = (state.skills.installations[agentCtx.agentId] ?? []).find(item => item.skill_id === skill_id);
    if (existing) {
      return NextResponse.json({ error: 'conflict', message: 'Skill already installed' }, { status: 409 });
    }

    const installation = {
      id: randomUUID(),
      skill_id,
      installed_at: new Date().toISOString(),
    };

    await updateLocalRuntimeState(nextState => {
      nextState.skills.installations[agentCtx.agentId] ??= [];
      nextState.skills.installations[agentCtx.agentId].push(installation);
      const installedSkill = nextState.skills.catalog.find(item => item.id === skill_id);
      if (installedSkill) {
        installedSkill.total_installs += 1;
      }
    });

    return NextResponse.json({ success: true, installation }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, message: err.message }, { status: err.statusCode });
  }
}
