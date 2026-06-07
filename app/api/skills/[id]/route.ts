import { NextRequest, NextResponse } from 'next/server';
import { assertResourceAccess, normalizeVisibility } from '@/src/access/service';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { readLocalRuntimeState } from '@/src/storage/local-state';
import { requireAgentContext, requireRouteCapability } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// GET /api/skills/:id - Get skill by id or slug
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const isUuid = /^[0-9a-f-]{36}$/i.test(id);

    try {
      const supabase = getSupabaseAdmin();
      const query = supabase
        .from('skills')
        .select(`
          *,
          reviews:skill_reviews(rating, review_title, review_text, created_at, agent_id)
        `);

      const { data, error } = isUuid
        ? await query.eq('id', id).single()
        : await query.eq('slug', id).single();

      if (!error && data) {
        let viewerAgentId: string | null = null;
        try {
          viewerAgentId = requireAgentContext(_request.headers).agentId;
        } catch {
          viewerAgentId = null;
        }
        const skill = data as Record<string, unknown>;
        const visibility = normalizeVisibility(skill.visibility, skill.published === true ? 'public' : 'private');
        if (!viewerAgentId) {
          if (visibility !== 'public' && skill.published !== true) {
            return NextResponse.json({ code: 'NOT_FOUND', error: 'Skill not found', message: 'Skill not found' }, { status: 404 });
          }
        } else {
          await assertResourceAccess({
            viewerAgentId,
            ownerAgentId: String(skill.author_id),
            workspaceId: typeof skill.workspace_id === 'string' ? skill.workspace_id : null,
            visibility,
            sourceType: 'skill',
            sourceId: String(skill.id),
            permission: 'skill:read',
          });
        }
        return NextResponse.json({ skill: omitAgentIdentifierFields(data) });
      }
    } catch {
      // Fall back to local runtime state below.
    }

    const state = await readLocalRuntimeState();
    const skill = state.skills.catalog.find(item => isUuid ? item.id === id : item.slug === id);
    if (!skill || (!skill.published && normalizeVisibility((skill as { visibility?: unknown }).visibility, 'private') !== 'public')) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'Skill not found', message: 'Skill not found' }, { status: 404 });
    }

    return NextResponse.json({
      skill: omitAgentIdentifierFields({
        ...skill,
        reviews: [],
      }),
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

// PUT /api/skills/:id - Update skill (author only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agentCtx = await requireRouteCapability(request.headers, 'skills.create');

    const supabase = getSupabaseAdmin();
    const { data: skill } = await supabase
      .from('skills')
      .select('author_id')
      .eq('id', id)
      .single();

    if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    if (skill.author_id !== agentCtx.agentId) {
      return NextResponse.json({ error: 'You can only update your own skills' }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Disallow updating protected fields
    const { id: _id, author_id: _aid, created_at: _cat, total_installs: _ti, total_calls: _tc, ...allowed } = body;
    void _id; void _aid; void _cat; void _ti; void _tc;

    const publishState = typeof allowed.publish_state === 'string'
      ? allowed.publish_state
      : typeof allowed.status === 'string'
        ? allowed.status
        : null;
    if (publishState && publishState !== 'draft') {
      await requireRouteCapability(request.headers, 'skills.publish');
    }
    if (typeof allowed.published === 'boolean' && allowed.published === true) {
      await requireRouteCapability(request.headers, 'skills.publish');
    }

    const { data, error } = await supabase
      .from('skills')
      .update({
        ...allowed,
        ...(allowed.visibility === 'private' || allowed.visibility === 'workspace' || allowed.visibility === 'public'
          ? { visibility: allowed.visibility }
          : {}),
        ...(publishState ? { publish_state: publishState } : {}),
        ...(publishState ? { published: publishState === 'published' } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ skill: data });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}

// DELETE /api/skills/:id - Delete skill (author only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agentCtx = await requireRouteCapability(request.headers, 'skills.create');

    const supabase = getSupabaseAdmin();
    const { data: skill } = await supabase
      .from('skills')
      .select('author_id')
      .eq('id', id)
      .single();

    if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    if (skill.author_id !== agentCtx.agentId) {
      return NextResponse.json({ error: 'You can only delete your own skills' }, { status: 403 });
    }

    const { error } = await supabase.from('skills').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
