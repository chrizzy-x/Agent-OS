import { NextRequest, NextResponse } from 'next/server';
import { listAgentApps, listInstalledAgentApps } from '@/src/appstore/service';
import { requireAgentContext } from '@/src/auth/request';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { listStudioSessions } from '@/src/studio/persistence';
import { listPrivateSubagents } from '@/src/subagents/service';
import { toErrorResponse } from '@/src/utils/errors';
import { listVaultSecrets } from '@/src/vault/service';
import { listWorkspaces } from '@/src/workspaces/service';

export const runtime = 'nodejs';

type SearchKind = 'app' | 'skill' | 'workflow' | 'subagent' | 'session' | 'project' | 'vault' | 'doc';

type SearchResult = {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string;
  href: string;
  actionLabel: string;
  updatedAt: string | null;
};

const DOCS = [
  { id: 'docs-guide', title: 'Platform Guide', subtitle: 'How AgentOS works', href: '/docs/guide' },
  { id: 'docs-api', title: 'API Reference', subtitle: 'Routes, payloads, and examples', href: '/docs/api' },
  { id: 'docs-sdk', title: 'SDK Guide', subtitle: 'Register and manage SDK apps', href: '/docs/sdk' },
  { id: 'docs-templates', title: 'Templates', subtitle: 'Starter templates and flows', href: '/docs/templates' },
];

function matchesSearch(search: string, ...values: Array<string | null | undefined>): boolean {
  if (!search) return true;
  return values.some(value => value?.toLowerCase().includes(search));
}

function sortResults(left: SearchResult, right: SearchResult): number {
  const leftStamp = left.updatedAt ?? '';
  const rightStamp = right.updatedAt ?? '';
  if (leftStamp !== rightStamp) return rightStamp.localeCompare(leftStamp);
  return left.title.localeCompare(right.title);
}

function limitResults<T>(items: T[], limit: number): T[] {
  return items.slice(0, Math.max(1, limit));
}

export async function GET(request: NextRequest) {
  try {
    const ctx = requireAgentContext(request.headers);
    const url = new URL(request.url);
    const search = url.searchParams.get('q')?.trim().toLowerCase() ?? '';
    const type = (url.searchParams.get('type')?.trim().toLowerCase() ?? 'all') as SearchKind | 'all';
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));

    const [apps, installedApps, sessions, workspaces, subagents, workflowsResult, publishedSkillsResult, ownSkillsResult] = await Promise.all([
      listAgentApps({
        viewerAgentId: ctx.agentId,
        includeHidden: true,
        search: search || undefined,
        sort: 'recent',
      }),
      listInstalledAgentApps(ctx.agentId).catch(() => []),
      listStudioSessions(ctx.agentId),
      listWorkspaces(ctx.agentId),
      listPrivateSubagents(ctx.agentId),
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
    ]);

    const installedSlugSet = new Set(installedApps.map(item => item.app.slug));
    const vaultResults: SearchResult[] = [];
    for (const workspace of workspaces) {
      try {
        const payload = await listVaultSecrets({
          ownerAgentId: ctx.agentId,
          workspaceId: workspace.id,
          search: search || undefined,
        });
        for (const secret of payload.secrets) {
          vaultResults.push({
            id: secret.id,
            kind: 'vault',
            title: secret.name,
            subtitle: `${workspace.name} vault secret`,
            href: '/vault',
            actionLabel: 'Open Vault',
            updatedAt: secret.updatedAt,
          });
        }
      } catch {
        // Continue without exposing vault internals.
      }
    }

    const skillMap = new Map<string, SearchResult>();
    for (const row of [...(publishedSkillsResult.data ?? []), ...(ownSkillsResult.data ?? [])] as Array<Record<string, unknown>>) {
      const title = String(row.name ?? 'Skill');
      const subtitle = [row.category, row.description].filter(item => typeof item === 'string' && item).join(' - ');
      if (!matchesSearch(search, title, subtitle, String(row.slug ?? ''))) continue;
      const id = String(row.id);
      skillMap.set(id, {
        id,
        kind: 'skill',
        title,
        subtitle: subtitle || 'Skill',
        href: `/skills/${String(row.slug ?? row.id)}`,
        actionLabel: 'Open Skill',
        updatedAt: String(row.updated_at ?? row.created_at ?? ''),
      });
    }

    const grouped: Record<SearchKind, SearchResult[]> = {
      app: apps
        .filter(app => type === 'all' || type === 'app')
        .map(app => ({
          id: app.id,
          kind: 'app',
          title: app.name,
          subtitle: `${app.category} - ${app.description}`,
          href: `/appstore/${app.slug}`,
          actionLabel: installedSlugSet.has(app.slug) ? 'Open App' : 'View App',
          updatedAt: app.updatedAt,
        })),
      skill: [...skillMap.values()].filter(item => type === 'all' || type === 'skill'),
      workflow: ((workflowsResult.data ?? []) as Array<Record<string, unknown>>)
        .filter(row => matchesSearch(search, String(row.name ?? ''), String(row.summary ?? ''), String(row.status ?? '')))
        .filter(() => type === 'all' || type === 'workflow')
        .map(row => ({
          id: String(row.id),
          kind: 'workflow',
          title: String(row.name ?? 'Workflow'),
          subtitle: typeof row.summary === 'string' && row.summary ? row.summary : String(row.status ?? 'Workflow'),
          href: `/workflows/${String(row.id)}`,
          actionLabel: 'Open Workflow',
          updatedAt: String(row.updated_at ?? row.created_at ?? ''),
        })),
      subagent: subagents
        .filter(item => matchesSearch(search, item.name, item.description ?? '', item.status))
        .filter(() => type === 'all' || type === 'subagent')
        .map(item => ({
          id: item.id,
          kind: 'subagent',
          title: item.name,
          subtitle: item.description ?? 'Private subagent',
          href: `/subagents/${item.id}`,
          actionLabel: 'Open Agent',
          updatedAt: item.updatedAt,
        })),
      session: sessions
        .filter(item => matchesSearch(search, item.title, item.status))
        .filter(() => type === 'all' || type === 'session')
        .map(item => ({
          id: item.id,
          kind: 'session',
          title: item.title,
          subtitle: item.status,
          href: `/studio?session=${encodeURIComponent(item.id)}`,
          actionLabel: 'Open Session',
          updatedAt: item.updatedAt,
        })),
      project: workspaces
        .filter(item => matchesSearch(search, item.name, item.slug, item.plan))
        .filter(() => type === 'all' || type === 'project')
        .map(item => ({
          id: item.id,
          kind: 'project',
          title: item.name,
          subtitle: `${item.plan} workspace`,
          href: '/projects',
          actionLabel: 'Open Projects',
          updatedAt: item.createdAt,
        })),
      vault: vaultResults.filter(() => type === 'all' || type === 'vault'),
      doc: DOCS
        .filter(item => matchesSearch(search, item.title, item.subtitle))
        .filter(() => type === 'all' || type === 'doc')
        .map(item => ({
          ...item,
          kind: 'doc',
          actionLabel: 'Open Doc',
          updatedAt: null,
        })),
    };

    const results = limitResults(
      Object.values(grouped).flat().sort(sortResults),
      limit,
    );

    return NextResponse.json({
      query: search,
      total: results.length,
      groups: Object.fromEntries(
        Object.entries(grouped).map(([key, value]) => [key, limitResults(value.sort(sortResults), 8)]),
      ),
      results,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
