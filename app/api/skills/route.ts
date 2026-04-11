import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { readLocalRuntimeState } from '@/src/storage/local-state';
import { requireAgentContext } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

function compareBySort(sort: string, left: Record<string, unknown>, right: Record<string, unknown>): number {
  if (sort === 'recent') {
    return String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''));
  }
  if (sort === 'rating') {
    return Number(right.rating ?? 0) - Number(left.rating ?? 0);
  }
  return Number(right.total_installs ?? 0) - Number(left.total_installs ?? 0);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search')?.trim().toLowerCase() ?? '';
    const sort = searchParams.get('sort') || 'popular';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const authorId = searchParams.get('author');

    try {
      const supabase = getSupabaseAdmin();
      let query = supabase
        .from('skills')
        .select('id,name,slug,version,author_id,author_name,category,description,icon,pricing_model,price_per_call,free_tier_calls,total_installs,total_calls,rating,review_count,primitives_required,capabilities,tags,published,verified,created_at', { count: 'exact' })
        .eq('published', true);

      if (authorId) query = query.eq('author_id', authorId);
      if (category && category !== 'all' && category !== 'All') query = query.ilike('category', category);
      if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,tags.cs.{${search}}`);
      if (sort === 'popular') query = query.order('total_installs', { ascending: false });
      if (sort === 'recent') query = query.order('created_at', { ascending: false });
      if (sort === 'rating') query = query.order('rating', { ascending: false });

      const offset = (page - 1) * limit;
      const { data, error, count } = await query.range(offset, offset + limit - 1);
      if (!error) {
        return NextResponse.json({ skills: data ?? [], pagination: { page, limit, total: count ?? 0 } });
      }
    } catch {
      // Fall back to local catalog below.
    }

    const state = await readLocalRuntimeState();
    let skills = [...state.skills.catalog].filter(skill => skill.published);
    if (authorId) skills = skills.filter(skill => skill.author_id === authorId);
    if (category && category !== 'all' && category !== 'All') skills = skills.filter(skill => skill.category.toLowerCase() === category.toLowerCase());
    if (search) {
      skills = skills.filter(skill => [skill.name, skill.description, skill.category, ...skill.tags].join(' ').toLowerCase().includes(search));
    }

    skills.sort((left, right) => compareBySort(sort, left as unknown as Record<string, unknown>, right as unknown as Record<string, unknown>));
    const total = skills.length;
    const offset = (page - 1) * limit;
    return NextResponse.json({
      skills: skills.slice(offset, offset + limit),
      pagination: { page, limit, total },
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const agentCtx = requireAgentContext(request.headers);
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body', message: 'Invalid JSON body' }, { status: 400 });
    }

    const { name, slug, category } = body as Record<string, unknown>;
    if (!name || !slug || !category) {
      return NextResponse.json({ error: 'Missing required fields: name, slug, category', message: 'Missing required fields: name, slug, category' }, { status: 400 });
    }

    return NextResponse.json({ id: `${agentCtx.agentId}:${slug}`, slug }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, message: err.message }, { status: err.statusCode });
  }
}
