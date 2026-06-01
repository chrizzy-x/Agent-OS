'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Nav from '@/components/Nav';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import {
  AppShell,
  Button,
  Card,
  EmptyState,
  FilterChips,
  LoadingState,
  PageHeader,
  SearchBar,
  SidebarNav,
  SidebarSection,
  StatusPill,
} from '@/components/os/ui';

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

type SearchPayload = {
  total: number;
  groups: Partial<Record<SearchKind, SearchResult[]>>;
};

const FILTERS = [
  'all',
  'app',
  'skill',
  'workflow',
  'subagent',
  'session',
  'project',
  'vault',
  'doc',
];

const LABELS: Record<SearchKind, string> = {
  app: 'Apps',
  skill: 'Skills',
  workflow: 'Workflows',
  subagent: 'Agents',
  session: 'Sessions',
  project: 'Projects',
  vault: 'Vault',
  doc: 'Docs',
};

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const initialType = searchParams.get('type') ?? 'all';

  const [session, setSession] = useState<BrowserSession | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState(initialType);
  const [payload, setPayload] = useState<SearchPayload | null>(null);

  useEffect(() => {
    setQuery(initialQuery);
    setType(initialType);
  }, [initialQuery, initialType]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const current = await fetchBrowserSession().catch(() => null);
      if (!active) return;
      setSession(current);
      setReady(true);
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !session) return;

    let active = true;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(initialQuery)}&type=${encodeURIComponent(initialType)}&limit=50`, {
          cache: 'no-store',
        });
        const data = await res.json();
        if (active) setPayload(res.ok ? data : null);
      } catch {
        if (active) setPayload(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [initialQuery, initialType, ready, session]);

  const groupedResults = useMemo(
    () =>
      (Object.entries(payload?.groups ?? {}) as Array<[SearchKind, SearchResult[]]>)
        .filter(([, items]) => items.length > 0)
        .sort((left, right) => FILTERS.indexOf(left[0]) - FILTERS.indexOf(right[0])),
    [payload],
  );

  function commit(nextQuery: string, nextType: string) {
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set('q', nextQuery.trim());
    if (nextType !== 'all') params.set('type', nextType);
    router.push(params.toString() ? `/search?${params.toString()}` : '/search');
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/search" />
      <AppShell
        sidebar={(
          <SidebarSection title="Search">
            <SidebarNav
              items={[
                { href: '/studio', label: 'Studio' },
                { href: '/search', label: 'Global Search', active: true },
                { href: '/appstore', label: 'Apps' },
                { href: '/vault', label: 'Vault' },
              ]}
              />
          </SidebarSection>
        )}
        aside={(
          <SidebarSection title="Quick actions">
            <div style={{ display: 'grid', gap: 10 }}>
              <Button href="/studio">Open Studio</Button>
              <Button href="/appstore" variant="secondary">Browse Apps</Button>
              <Button href="/vault" variant="secondary">Open Vault</Button>
              <div className="os-entity-copy">Shortcut: Ctrl/Cmd + K</div>
            </div>
          </SidebarSection>
        )}
      >
        <PageHeader
          eyebrow="Workspace Search"
          title="Search everything"
          subtitle="Apps, skills, workflows, sessions, projects, vault secret names, and docs."
        />

        <div style={{ display: 'grid', gap: 12 }}>
          <SearchBar
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') commit(query, type);
            }}
            placeholder="Search apps, workflows, sessions, secret names, docs..."
          />
          <FilterChips
            items={FILTERS.map(item => item === 'all' ? 'all' : LABELS[item as SearchKind])}
            active={type === 'all' ? 'all' : LABELS[type as SearchKind]}
            onChange={value => {
              const nextType = value === 'all'
                ? 'all'
                : (Object.entries(LABELS).find(([, label]) => label === value)?.[0] ?? 'all');
              setType(nextType);
              commit(query, nextType);
            }}
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button onClick={() => commit(query, type)}>Search</Button>
            <Button variant="secondary" onClick={() => {
              setQuery('');
              setType('all');
              router.push('/search');
            }}
            >
              Clear
            </Button>
          </div>
        </div>

        {!ready ? <LoadingState label="Loading search" /> : !session ? (
          <EmptyState title="Sign in required" body="Sign in to search workspace apps, sessions, workflows, and vault names." action={<Button href="/signin">Sign in</Button>} />
        ) : loading ? <LoadingState label="Searching workspace" /> : !payload ? (
          <EmptyState title="Search unavailable" body="The search service did not return results for this workspace." />
        ) : groupedResults.length === 0 ? (
          <EmptyState title="No results" body={initialQuery ? 'Try another search term or switch categories.' : 'Enter a search term to scan apps, sessions, workflows, and docs.'} />
        ) : (
          <div style={{ display: 'grid', gap: 20 }}>
            {groupedResults.map(([group, items]) => (
              <Card key={group}>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">{LABELS[group]}</div>
                  <StatusPill status={`${items.length} results`} label={`${items.length} results`} />
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {items.map(item => (
                    <div
                      key={item.id}
                      style={{
                        display: 'grid',
                        gap: 10,
                        padding: 12,
                        borderRadius: 14,
                        border: '1px solid var(--border)',
                        background: 'rgba(255,255,255,0.02)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ display: 'grid', gap: 6 }}>
                          <div className="os-entity-title">{item.title}</div>
                          <div className="os-entity-copy">{item.subtitle}</div>
                          {item.updatedAt ? <div className="os-entity-meta">{new Date(item.updatedAt).toLocaleString()}</div> : null}
                        </div>
                        <Button href={item.href} variant="secondary">{item.actionLabel}</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </AppShell>
    </div>
  );
}
