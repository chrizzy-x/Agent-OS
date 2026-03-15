import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { requireAgentContext } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// GET /api/skills - List published skills (marketplace)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const search = searchParams.get('search');
  const sort = searchParams.get('sort') || 'popular';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));
  const authorId = searchParams.get('author');

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('skills')
    .select('id,name,slug,version,author_id,author_name,category,description,icon,pricing_model,price_per_call,free_tier_calls,total_installs,total_calls,rating,review_count,primitives_required,capabilities,tags,published,verified,created_at', { count: 'exact' })
    .eq('published', true);

  if (authorId) {
    query = query.eq('author_id', authorId);
  }
  if (category && category !== 'all' && category !== 'All') {
    query = query.ilike('category', category);
  }
  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,tags.cs.{${search}}`);
  }

  if (sort === 'popular') {
    query = query.order('total_installs', { ascending: false });
  } else if (sort === 'recent') {
    query = query.order('created_at', { ascending: false });
  } else if (sort === 'rating') {
    query = query.order('rating', { ascending: false });
  }

  const offset = (page - 1) * limit;
  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    skills: data ?? [],
    pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
  });
}

// POST /api/skills - Publish a new skill
export async function POST(request: NextRequest) {
  let agentCtx;
  try {
    agentCtx = requireAgentContext(request.headers);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, slug, category, description, long_description, icon, pricing_model,
    price_per_call, free_tier_calls, capabilities, source_code,
    primitives_required, tags, homepage_url, repository_url } = body as Record<string, unknown>;

  if (!name || !slug || !category) {
    return NextResponse.json({ error: 'Missing required fields: name, slug, category' }, { status: 400 });
  }

  // Validate slug format
  if (typeof slug === 'string' && !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: 'Slug must be lowercase letters, numbers, and hyphens only' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('skills')
    .insert({
      name,
      slug,
      author_id: agentCtx.agentId,
      author_name: agentCtx.agentId.slice(0, 16),
      category,
      description: description || null,
      long_description: long_description || null,
      icon: icon || '📦',
      pricing_model: pricing_model || 'free',
      price_per_call: price_per_call || 0,
      free_tier_calls: free_tier_calls || 100,
      capabilities: capabilities || [],
      source_code: source_code || null,
      primitives_required: primitives_required || [],
      tags: tags || [],
      homepage_url: homepage_url || null,
      repository_url: repository_url || null,
      published: true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A skill with that slug already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ skill: data }, { status: 201 });
}
