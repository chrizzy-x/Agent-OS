import { NextRequest, NextResponse } from 'next/server';
import { filterAccessibleResources, normalizeVisibility, resolveViewerWorkspaceIds } from '@/src/access/service';
import { findAccountById } from '@/src/auth/agent-store';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { readLocalRuntimeState } from '@/src/storage/local-state';
import { requireAgentContext, requireRouteCapability } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

const FULL_SKILL_SELECT = 'id,name,slug,version,author_id,author_name,workspace_id,category,description,icon,pricing_model,price_per_call,free_tier_calls,total_installs,total_calls,rating,review_count,primitives_required,capabilities,tags,published,verified,visibility,created_at,updated_at';
const LEGACY_SKILL_SELECT = 'id,name,slug,version,author_id,author_name,category,description,icon,pricing_model,price_per_call,free_tier_calls,total_installs,total_calls,rating,review_count,primitives_required,capabilities,tags,published,verified,created_at,updated_at';

function compareBySort(sort: string, left: Record<string, unknown>, right: Record<string, unknown>): number {
  if (sort === 'recent') {
    return String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''));
  }
  if (sort === 'rating') {
    return Number(right.rating ?? 0) - Number(left.rating ?? 0);
  }
  return Number(right.total_installs ?? 0) - Number(left.total_installs ?? 0);
}

async function fetchSupabaseSkills(params: {
  authorId: string | null;
  category: string | null;
  search: string;
  sort: string;
  page: number;
  limit: number;
}): Promise<{ data: Array<Record<string, unknown>>; count: number }> {
  const supabase = getSupabaseAdmin();
  const offset = (params.page - 1) * params.limit;

  const runQuery = async (selectClause: string) => {
    let query = supabase
      .from('skills')
      .select(selectClause, { count: 'exact' });

    if (params.authorId) query = query.eq('author_id', params.authorId);
    if (params.category && params.category !== 'all' && params.category !== 'All') query = query.ilike('category', params.category);
    if (params.search) query = query.or(`name.ilike.%${params.search}%,description.ilike.%${params.search}%,tags.cs.{${params.search}}`);
    if (params.sort === 'popular') query = query.order('total_installs', { ascending: false });
    if (params.sort === 'recent') query = query.order('created_at', { ascending: false });
    if (params.sort === 'rating') query = query.order('rating', { ascending: false });

    return query.range(offset, offset + params.limit - 1);
  };

  const primary = await runQuery(FULL_SKILL_SELECT);
  if (!primary.error) {
    return {
      data: (primary.data ?? []) as unknown as Array<Record<string, unknown>>,
      count: primary.count ?? 0,
    };
  }
  if (primary.error.code !== '42703') {
    throw primary.error;
  }

  const legacy = await runQuery(LEGACY_SKILL_SELECT);
  if (legacy.error) throw legacy.error;
  return {
    data: ((legacy.data ?? []) as unknown as Array<Record<string, unknown>>).map(skill => ({
      ...skill,
      workspace_id: null,
      visibility: skill.published === true ? 'public' : 'private',
    })),
    count: legacy.count ?? 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search')?.trim().toLowerCase() ?? '';
    const sort = searchParams.get('sort') || 'popular';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    let viewerAgentId: string | null = null;
    try {
      viewerAgentId = requireAgentContext(request.headers).agentId;
    } catch {
      viewerAgentId = null;
    }
    const authorId = searchParams.get('mine') === '1' || searchParams.get('mine') === 'true'
      ? viewerAgentId
      : searchParams.get('author');

    try {
      const { data, count } = await fetchSupabaseSkills({ authorId, category, search, sort, page, limit });
      let skills: Array<Record<string, unknown>> = data.map(skill => ({
        ...skill,
        visibility: normalizeVisibility(skill.visibility, skill.published === true ? 'public' : 'private'),
      }));
      if (viewerAgentId) {
        skills = await filterAccessibleResources({
          viewer: { agentId: viewerAgentId, workspaceIds: await resolveViewerWorkspaceIds(viewerAgentId) },
          resources: skills.map(skill => ({
            ...skill,
            id: String(skill.id),
            ownerAgentId: String(skill.author_id),
            workspaceId: typeof skill.workspace_id === 'string' ? skill.workspace_id : null,
          })),
          sourceType: 'skill',
          permission: 'skill:read',
        }) as Array<Record<string, unknown>>;
      } else {
        skills = skills.filter(skill => skill.visibility === 'public' || skill.published === true);
      }
      return NextResponse.json({ skills: omitAgentIdentifierFields(skills), pagination: { page, limit, total: count ?? 0 } });
    } catch {
      // Fall back to local catalog below.
    }

    const state = await readLocalRuntimeState();
    let skills: Array<Record<string, unknown>> = [...state.skills.catalog].map(skill => ({
      ...skill,
      visibility: normalizeVisibility((skill as { visibility?: unknown }).visibility, skill.published ? 'public' : 'private'),
    }));
    if (authorId) skills = skills.filter(skill => String(skill.author_id ?? '') === authorId);
    if (category && category !== 'all' && category !== 'All') {
      skills = skills.filter(skill => String(skill.category ?? '').toLowerCase() === category.toLowerCase());
    }
    if (search) {
      skills = skills.filter(skill => [
        String(skill.name ?? ''),
        String(skill.description ?? ''),
        String(skill.category ?? ''),
        ...(Array.isArray(skill.tags) ? skill.tags.map(tag => String(tag)) : []),
      ].join(' ').toLowerCase().includes(search));
    }
    if (viewerAgentId) {
      skills = await filterAccessibleResources({
        viewer: { agentId: viewerAgentId },
        resources: skills.map(skill => ({
          ...skill,
          id: String(skill.id),
          ownerAgentId: String(skill.author_id ?? ''),
          workspaceId: typeof skill.workspace_id === 'string' ? skill.workspace_id : null,
        })),
        sourceType: 'skill',
        permission: 'skill:read',
      }) as Array<Record<string, unknown>>;
    } else {
      skills = skills.filter(skill => skill.visibility === 'public' || skill.published);
    }

    skills.sort((left, right) => compareBySort(sort, left as unknown as Record<string, unknown>, right as unknown as Record<string, unknown>));
    const total = skills.length;
    const offset = (page - 1) * limit;
    return NextResponse.json({
      skills: omitAgentIdentifierFields(skills.slice(offset, offset + limit)),
      pagination: { page, limit, total },
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const agentCtx = await requireRouteCapability(request.headers, 'skills.create');
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body', message: 'Invalid JSON body' }, { status: 400 });
    }

    const { name, slug, category, description } = body as Record<string, unknown>;
    if (!name || !slug || !category) {
      return NextResponse.json({ error: 'Missing required fields: name, slug, category', message: 'Missing required fields: name, slug, category' }, { status: 400 });
    }

    const publishState = typeof body.publish_state === 'string'
      ? body.publish_state
      : typeof body.status === 'string'
        ? body.status
        : 'draft';
    const visibility = body.visibility === 'workspace' || body.visibility === 'public' ? body.visibility : 'private';
    const isPublished = publishState === 'published' || visibility === 'public';

    const supabase = getSupabaseAdmin();
    const account = await findAccountById(agentCtx.agentId);
    const insertPayload = {
      name: String(name),
      slug: String(slug),
      category: String(category),
      description: typeof description === 'string' ? description : '',
      long_description: typeof body.long_description === 'string' ? body.long_description : null,
      icon: typeof body.icon === 'string' ? body.icon : '[skill]',
      author_id: agentCtx.agentId,
      author_name: account?.name ?? 'AgentOS Publisher',
      workspace_id: typeof body.workspaceId === 'string' ? body.workspaceId : null,
      pricing_model: typeof body.pricing_model === 'string' ? body.pricing_model : 'free',
      price_per_call: typeof body.price_per_call === 'number' ? body.price_per_call : 0,
      free_tier_calls: typeof body.free_tier_calls === 'number' ? body.free_tier_calls : 100,
      capabilities: Array.isArray(body.capabilities) ? body.capabilities : [],
      permissions_required: Array.isArray(body.permissions_required) ? body.permissions_required : [],
      required_secrets: Array.isArray(body.required_secrets) ? body.required_secrets : [],
      source_code: typeof body.source_code === 'string' ? body.source_code : '',
      primitives_required: Array.isArray(body.primitives_required) ? body.primitives_required : [],
      tags: Array.isArray(body.tags) ? body.tags : [],
      publish_state: publishState,
      published: isPublished,
      visibility,
    };

    let { data, error } = await supabase
      .from('skills')
      .insert(insertPayload)
      .select('id, slug')
      .single();

    if (error?.code === '42703') {
      const { workspace_id: _workspaceId, visibility: _visibility, ...legacyInsertPayload } = insertPayload;
      ({ data, error } = await supabase
        .from('skills')
        .insert(legacyInsertPayload)
        .select('id, slug')
        .single());
    }

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A skill with this slug already exists', message: 'A skill with this slug already exists' }, { status: 409 });
      }
      throw error;
    }
    if (!data) {
      throw new Error('Skill creation did not return an identifier');
    }

    return NextResponse.json({ id: data.id, slug: data.slug }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

