import { NextRequest, NextResponse } from 'next/server';
import { listAgentApps, listInstalledAgentApps } from '@/src/appstore/service';
import { requireAgentContext } from '@/src/auth/request';
import { DOCS_CATALOG } from '@/src/docs/catalog';
import { listProjects } from '@/src/projects/service';
import { scoreSearchMatch } from '@/src/search/scoring';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { listStudioSessions } from '@/src/studio/persistence';
import { listAccessibleSubagents } from '@/src/subagents/service';
import { toErrorResponse } from '@/src/utils/errors';
import { listVaultSecrets } from '@/src/vault/service';
import { listWorkspaces } from '@/src/workspaces/service';

export const runtime = 'nodejs';

type SearchKind =
  | 'app'
  | 'skill'
  | 'workflow'
  | 'session'
  | 'project'
  | 'subagent'
  | 'vault'
  | 'doc'
  | 'connector'
  | 'ffp_route'
  | 'ffp_primitive';

type SearchResult = {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string;
  href: string;
  actionLabel: string;
  updatedAt: string | null;
};

type RankedSearchResult = SearchResult & {
  score: number;
};

function shouldIncludeKind(type: SearchKind | 'all', kind: SearchKind): boolean {
  return type === 'all' || type === kind;
}

function sortResults(left: RankedSearchResult, right: RankedSearchResult): number {
  if (left.score !== right.score) return right.score - left.score;
  const leftStamp = left.updatedAt ?? '';
  const rightStamp = right.updatedAt ?? '';
  if (leftStamp !== rightStamp) return rightStamp.localeCompare(leftStamp);
  return left.title.localeCompare(right.title);
}

function limitResults<T>(items: T[], limit: number): T[] {
  return items.slice(0, Math.max(1, limit));
}

function summarizeConnectorTools(raw: unknown): string {
  if (!Array.isArray(raw) || raw.length === 0) return 'No registered tools';
  return raw
    .map(item => item && typeof item === 'object' && typeof (item as Record<string, unknown>).name === 'string'
      ? String((item as Record<string, unknown>).name)
      : null)
    .filter((item): item is string => Boolean(item))
    .slice(0, 3)
    .join(', ') || 'No registered tools';
}

function deriveFfpPrimitive(tool: string): string {
  const normalized = tool.replace(/^agentos\./, '').replace(/^mcp\./, '');
  return normalized.split(/[._]/)[0] || 'runtime';
}

function rankResult(search: string, result: SearchResult, ...fields: Array<string | null | undefined>): RankedSearchResult | null {
  const score = scoreSearchMatch(search, result.title, result.subtitle, ...fields);
  return score > 0 ? { ...result, score } : null;
}

function stripScore(result: RankedSearchResult): SearchResult {
  const { score: _score, ...rest } = result;
  return rest;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = requireAgentContext(request.headers);
    const url = new URL(request.url);
    const search = url.searchParams.get('q')?.trim().toLowerCase() ?? '';
    const type = (url.searchParams.get('type')?.trim().toLowerCase() ?? 'all') as SearchKind | 'all';
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
    const workspacePromise = listWorkspaces(ctx.agentId);
    const projectsPromise = listProjects({ ownerAgentId: ctx.agentId, status: 'active' });

    const [apps, installedApps, sessions, workspaces, projects, workflowsResult, publishedSkillsResult, ownSkillsResult, connectorsResult, ffpRoutesResult, subagents] = await Promise.all([
      listAgentApps({
        viewerAgentId: ctx.agentId,
        viewerWorkspaceIds: (await workspacePromise).map(workspace => workspace.id),
        includeHidden: true,
        sort: 'recent',
      }),
      listInstalledAgentApps(ctx.agentId).catch(() => []),
      listStudioSessions(ctx.agentId),
      workspacePromise,
      projectsPromise,
      getSupabaseAdmin()
        .from('agent_workflows')
        .select('id,name,summary,status,workspace_id,updated_at,created_at')
        .eq('agent_id', ctx.agentId)
        .order('updated_at', { ascending: false }),
      getSupabaseAdmin()
        .from('skills')
        .select('id,name,slug,category,description,published,updated_at,created_at')
        .eq('published', true)
        .order('updated_at', { ascending: false }),
      getSupabaseAdmin()
        .from('skills')
        .select('id,name,slug,category,description,published,updated_at,created_at')
        .eq('author_id', ctx.agentId)
        .order('updated_at', { ascending: false }),
      getSupabaseAdmin()
        .from('mcp_servers')
        .select('id,name,description,category,tools,requires_consensus,active,icon,created_at')
        .eq('active', true)
        .order('name', { ascending: true }),
      getSupabaseAdmin()
        .from('ffp_chain_executions')
        .select('id,chain_id,tool,status,error_message,executed_at')
        .order('executed_at', { ascending: false }),
      listAccessibleSubagents({
        viewerAgentId: ctx.agentId,
        workspaceIds: (await workspacePromise).map(workspace => workspace.id),
      }).catch(() => []),
    ]);

    const installedSlugSet = new Set(installedApps.map(item => item.app.slug));
    const vaultResults: RankedSearchResult[] = [];
    for (const workspace of workspaces) {
      try {
        const payload = await listVaultSecrets({
          ownerAgentId: ctx.agentId,
          workspaceId: workspace.id,
          search: search || undefined,
        });
        for (const secret of payload.secrets) {
          const ranked = rankResult(search, {
            id: secret.id,
            kind: 'vault',
            title: secret.name,
            subtitle: `${workspace.name} vault secret`,
            href: '/vault',
            actionLabel: 'Open Vault',
            updatedAt: secret.updatedAt,
          }, workspace.name, secret.name);
          if (ranked && shouldIncludeKind(type, 'vault')) vaultResults.push(ranked);
        }
      } catch {
        // Continue without exposing vault internals.
      }
    }

    const skillMap = new Map<string, RankedSearchResult>();
    for (const row of [...(publishedSkillsResult.data ?? []), ...(ownSkillsResult.data ?? [])] as Array<Record<string, unknown>>) {
      const title = String(row.name ?? 'Skill');
      const subtitle = [row.category, row.description].filter(item => typeof item === 'string' && item).join(' - ');
      const ranked = rankResult(search, {
        id: String(row.id),
        kind: 'skill',
        title,
        subtitle: subtitle || 'Skill',
        href: `/skills/${String(row.slug ?? row.id)}`,
        actionLabel: 'Open Skill',
        updatedAt: String(row.updated_at ?? row.created_at ?? ''),
      }, String(row.slug ?? ''), title, subtitle);
      if (ranked && shouldIncludeKind(type, 'skill')) {
        skillMap.set(ranked.id, ranked);
      }
    }

    const ffpPrimitiveMap = new Map<string, RankedSearchResult>();
    for (const row of (ffpRoutesResult.data ?? []) as Array<Record<string, unknown>>) {
      const primitive = deriveFfpPrimitive(String(row.tool ?? ''));
      const ranked = rankResult(search, {
        id: primitive,
        kind: 'ffp_primitive',
        title: primitive.toUpperCase(),
        subtitle: `FFP primitive from ${String(row.tool ?? 'tool')}`,
        href: `/ffp?drawer=primitive-detail&item=${encodeURIComponent(primitive)}`,
        actionLabel: 'Inspect Primitive',
        updatedAt: typeof row.executed_at === 'string' ? row.executed_at : null,
      }, primitive, String(row.tool ?? ''));
      if (ranked && shouldIncludeKind(type, 'ffp_primitive') && !ffpPrimitiveMap.has(primitive)) {
        ffpPrimitiveMap.set(primitive, ranked);
      }
    }

    const grouped: Record<SearchKind, RankedSearchResult[]> = {
      app: apps
        .flatMap(app => {
          if (!shouldIncludeKind(type, 'app')) return [];
          const ranked = rankResult(search, {
            id: app.id,
            kind: 'app',
            title: app.name,
            subtitle: `${app.category} - ${app.description}`,
            href: `/appstore/${app.slug}`,
            actionLabel: installedSlugSet.has(app.slug) ? 'Open App' : 'View App',
            updatedAt: app.updatedAt,
          }, app.slug, app.category, app.description, app.publisherName);
          return ranked ? [ranked] : [];
        }),
      skill: [...skillMap.values()],
      workflow: ((workflowsResult.data ?? []) as Array<Record<string, unknown>>)
        .flatMap(row => {
          if (!shouldIncludeKind(type, 'workflow')) return [];
          const ranked = rankResult(search, {
            id: String(row.id),
            kind: 'workflow',
            title: String(row.name ?? 'Workflow'),
            subtitle: typeof row.summary === 'string' && row.summary ? row.summary : String(row.status ?? 'Workflow'),
            href: `/workflows/${String(row.id)}`,
            actionLabel: 'Open Workflow',
            updatedAt: String(row.updated_at ?? row.created_at ?? ''),
          }, String(row.name ?? ''), String(row.summary ?? ''), String(row.status ?? ''));
          return ranked ? [ranked] : [];
        }),
      session: sessions
        .flatMap(item => {
          if (!shouldIncludeKind(type, 'session')) return [];
          const ranked = rankResult(search, {
            id: item.id,
            kind: 'session',
            title: item.title,
            subtitle: item.status,
            href: `/studio?session=${encodeURIComponent(item.id)}`,
            actionLabel: 'Open Session',
            updatedAt: item.updatedAt,
          }, item.title, item.status, item.linkedSubagentId ?? '');
          return ranked ? [ranked] : [];
        }),
      project: projects
        .flatMap(item => {
          if (!shouldIncludeKind(type, 'project')) return [];
          const ranked = rankResult(search, {
            id: item.id,
            kind: 'project',
            title: item.name,
            subtitle: item.description ?? `${workspaces.find(workspace => workspace.id === item.workspaceId)?.name ?? 'Workspace'} project`,
            href: `/studio?mode=code&project=${encodeURIComponent(item.id)}`,
            actionLabel: 'Open Project',
            updatedAt: item.updatedAt,
          }, item.name, item.slug, item.description ?? '', item.status);
          return ranked ? [ranked] : [];
        }),
      subagent: subagents
        .flatMap(item => {
          if (!shouldIncludeKind(type, 'subagent')) return [];
          const ranked = rankResult(search, {
            id: item.id,
            kind: 'subagent',
            title: item.name,
            subtitle: item.description ?? `${item.visibility} subagent`,
            href: `/agents/${item.id}`,
            actionLabel: 'Open Subagent',
            updatedAt: item.updatedAt,
          }, item.name, item.description ?? '', item.instructions, item.visibility, item.exposedCapabilities.join(' '));
          return ranked ? [ranked] : [];
        }),
      vault: vaultResults,
      connector: ((connectorsResult.data ?? []) as Array<Record<string, unknown>>)
        .flatMap(row => {
          if (!shouldIncludeKind(type, 'connector')) return [];
          const ranked = rankResult(search, {
            id: String(row.id ?? row.name),
            kind: 'connector',
            title: String(row.name ?? 'Connector'),
            subtitle: `${String(row.category ?? 'Connector')} - ${summarizeConnectorTools(row.tools)}`,
            href: `/connectors?drawer=connector-detail&item=${encodeURIComponent(String(row.name ?? ''))}`,
            actionLabel: 'Inspect Connector',
            updatedAt: typeof row.created_at === 'string' ? row.created_at : null,
          }, String(row.name ?? ''), String(row.description ?? ''), String(row.category ?? ''), summarizeConnectorTools(row.tools));
          return ranked ? [ranked] : [];
        }),
      ffp_route: ((ffpRoutesResult.data ?? []) as Array<Record<string, unknown>>)
        .flatMap(row => {
          if (!shouldIncludeKind(type, 'ffp_route')) return [];
          const ranked = rankResult(search, {
            id: String(row.id),
            kind: 'ffp_route',
            title: `${String(row.chain_id ?? 'chain')} -> ${String(row.tool ?? 'tool')}`,
            subtitle: String(row.status ?? 'recorded'),
            href: `/ffp?drawer=route-detail&item=${encodeURIComponent(String(row.id))}`,
            actionLabel: 'Inspect Route',
            updatedAt: typeof row.executed_at === 'string' ? row.executed_at : null,
          }, String(row.chain_id ?? ''), String(row.tool ?? ''), String(row.status ?? ''), String(row.error_message ?? ''));
          return ranked ? [ranked] : [];
        }),
      ffp_primitive: [...ffpPrimitiveMap.values()],
      doc: DOCS_CATALOG
        .flatMap(item => {
          if (!shouldIncludeKind(type, 'doc')) return [];
          const ranked = rankResult(search, {
            id: item.id,
            kind: 'doc',
            title: item.title,
            subtitle: item.subtitle,
            href: item.href,
            actionLabel: 'Open Doc',
            updatedAt: null,
          }, ...(item.keywords ?? []));
          return ranked ? [ranked] : [];
        }),
    };

    const results = limitResults(
      Object.values(grouped).flat().sort(sortResults).map(stripScore),
      limit,
    );

    return NextResponse.json({
      query: search,
      total: results.length,
      groups: Object.fromEntries(
        Object.entries(grouped).map(([key, value]) => [key, limitResults(value.sort(sortResults).map(stripScore), 8)]),
      ),
      results,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
