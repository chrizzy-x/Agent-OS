import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { requireAgentContext } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// GET /api/skills/:id - Get skill by id or slug
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  // Try by UUID first, then by slug
  const isUuid = /^[0-9a-f-]{36}$/i.test(id);
  const query = supabase
    .from('skills')
    .select(`
      *,
      reviews:skill_reviews(rating, review_title, review_text, created_at, agent_id)
    `);

  const { data, error } = isUuid
    ? await query.eq('id', id).single()
    : await query.eq('slug', id).single();

  if (error || !data) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
  }

  return NextResponse.json({ skill: data });
}

// PUT /api/skills/:id - Update skill (author only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agentCtx = requireAgentContext(request.headers);

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

    const { data, error } = await supabase
      .from('skills')
      .update({ ...allowed, updated_at: new Date().toISOString() })
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
    const agentCtx = requireAgentContext(request.headers);

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
