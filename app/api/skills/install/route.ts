import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { readLocalRuntimeState, updateLocalRuntimeState } from '@/src/storage/local-state';
import { requireRouteCapability } from '@/src/auth/request';
import { appendStudioEvent } from '@/src/studio/persistence';
import { validateRequiredSecrets } from '@/src/vault/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const agentCtx = await requireRouteCapability(request.headers, 'skills.install');
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json', message: 'Invalid JSON body' }, { status: 400 });
    }

    const { skill_id } = body as { skill_id?: string };
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : undefined;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined;
    if (!skill_id) {
      return NextResponse.json({ error: 'validation_error', message: 'skill_id is required' }, { status: 400 });
    }

    try {
      const supabase = getSupabaseAdmin();
      const { data: skill, error: skillErr } = await supabase
        .from('skills')
        .select('id, name, total_installs, required_secrets')
        .eq('id', skill_id)
        .eq('published', true)
        .single();

      if (!skillErr && skill) {
        const requiredSecrets = Array.isArray(skill.required_secrets)
          ? skill.required_secrets.filter((item: unknown): item is string => typeof item === 'string')
          : [];
        if (requiredSecrets.length > 0) {
          const validation = await validateRequiredSecrets({
            ownerAgentId: agentCtx.agentId,
            workspaceId,
            names: requiredSecrets,
          });
          if (validation.missing.length > 0) {
            if (sessionId) {
              await appendStudioEvent({
                ownerAgentId: agentCtx.agentId,
                sessionId,
                type: 'secret_required',
                payload: { skillId: skill_id, missing: validation.missing },
              });
            }
            return NextResponse.json(
              {
                code: 'SECRET_REQUIRED',
                error: 'Required secrets are missing for this skill.',
                message: 'Required secrets are missing for this skill.',
                missingSecrets: validation.missing,
              },
              { status: 400 },
            );
          }
        }

        const { data, error } = await supabase
          .from('skill_installations')
          .insert({ agent_id: agentCtx.agentId, skill_id })
          .select()
          .single();

        if (!error) {
          await supabase.from('skills').update({ total_installs: (skill.total_installs ?? 0) + 1 }).eq('id', skill_id);
          if (sessionId) {
            await appendStudioEvent({
              ownerAgentId: agentCtx.agentId,
              sessionId,
              type: 'skill_installed',
              payload: { skillId: skill_id, name: skill.name ?? null },
            });
          }
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
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
