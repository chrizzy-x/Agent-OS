import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { requireAgentContext } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// POST /api/skills/:id/review — submit or update a review for a skill
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agentCtx = requireAgentContext(request.headers);

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { rating, review_title, review_text } = body as {
      rating?: number;
      review_title?: string;
      review_text?: string;
    };

    // Validate rating
    if (rating === undefined || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'rating must be an integer from 1 to 5' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Resolve skill by uuid or slug
    const isUuid = /^[0-9a-f-]{36}$/i.test(id);
    const { data: skill, error: skillErr } = isUuid
      ? await supabase.from('skills').select('id,author_id').eq('id', id).single()
      : await supabase.from('skills').select('id,author_id').eq('slug', id).single();

    if (skillErr || !skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    // Authors can't review their own skill
    if (skill.author_id === agentCtx.agentId) {
      return NextResponse.json({ error: 'You cannot review your own skill' }, { status: 403 });
    }

    // Upsert review (one review per agent per skill)
    const { data: review, error: reviewErr } = await supabase
      .from('skill_reviews')
      .upsert(
        {
          skill_id: skill.id,
          agent_id: agentCtx.agentId,
          rating,
          review_title: review_title?.trim() || null,
          review_text: review_text?.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'skill_id,agent_id' }
      )
      .select()
      .single();

    if (reviewErr) {
      return NextResponse.json({ error: reviewErr.message }, { status: 500 });
    }

    // Refresh rating average on the skill (best-effort)
    supabase.rpc('refresh_skill_rating', { p_skill_id: skill.id }).then(() => {});

    return NextResponse.json({ success: true, review }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}

// GET /api/skills/:id/review — get reviews for a skill (public)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const isUuid = /^[0-9a-f-]{36}$/i.test(id);
  const { data: skill } = isUuid
    ? await supabase.from('skills').select('id').eq('id', id).single()
    : await supabase.from('skills').select('id').eq('slug', id).single();

  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('skill_reviews')
    .select('rating,review_title,review_text,created_at,updated_at,agent_id')
    .eq('skill_id', skill.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ reviews: data ?? [] });
}
