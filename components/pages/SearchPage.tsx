'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Nav from '@/components/Nav';
import { Drawer } from '@/components/os/overlays';
import WorkspaceShell from '@/components/os/workspace-shell';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChips,
  LoadingState,
  PageHeader,
  SearchBar,
  StatusPill,
} from '@/components/os/ui';

type SearchKind = 'app' | 'skill' | 'workflow' | 'session' | 'project' | 'vault' | 'doc' | 'connector' | 'ffp_route' | 'ffp_primitive';

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

const FILTERS: Array<'all' | SearchKind> = [
  'all',
  'app',
  'skill',
  'workflow',
  'session',
  'vault',
  'connector',
  'ffp_route',
  'ffp_primitive',
  'doc',
];

const LABELS: Record<SearchKind, string> = {
  app: 'Apps',
  skill: 'Skills',
  workflow: 'Workflows',
  session: 'Sessions',
  project: 'Projects',
  vault: 'Vault',
  doc: 'Docs',
  connector: 'Connectors',
  ffp_route: 'FFP Routes',
  ffp_primitive: 'FFP Primitives',
};

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const initialType = (searchParams.get('type') ?? 'all') as 'all' | SearchKind;

  const [session, setSession] = useState<BrowserSession | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState<'all' | SearchKind>(initialType);
  const [payload, setPayload] = useState<SearchPayload | null>(null);
  const [selected, setSelected] = useState<SearchResult | null>(null);

  useEffect(() => {
    setQuery(initialQuery);
    setType(initialType);
  }, [initialQuery, initialType]);

  useEffect(() => {
    let active = true;
    void fetchBrowserSession()
      .catch(() => null)
      .then(current => {
        if (!active) return;
        setSession(current);
        setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !session) return;
    let active = true;
    setLoading(true);
    void fetch(`/api/search?q=${encodeURIComponent(initialQuery)}&type=${encodeURIComponent(initialType)}&limit=50`, { cache: 'no-store' })
      .then(response => response.json())
      .then(data => {
        if (active) setPayload(data);
      })
      .catch(() => {
        if (active) setPayload(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
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

  function commit(nextQuery: string, nextType: 'all' | SearchKind) {
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set('q', nextQuery.trim());
    if (nextType !== 'all') params.set('type', nextType);
    router.push(params.toString() ? `/search?${params.toString()}` : '/search');
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/search" />
      <WorkspaceShell
        activePath="/search"
        aside={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Quick actions</div>
            <div className="os-drawer-stack">
              <Button href="/studio">Open Studio</Button>
              <Button href="/appstore" variant="secondary">Browse Apps</Button>
              <Button href="/marketplace" variant="secondary">Browse Marketplace</Button>
              <div className="os-entity-copy">Shortcut: Ctrl/Cmd + K</div>
            </div>
          </Card>
        )}
      >
        <PageHeader
          eyebrow="Global Search"
          title="Command center"
          subtitle="Apps, skills, workflows, sessions, Vault secret names, connectors, and FFP runtime routes."
        />

        <div className="os-drawer-stack">
          <SearchBar
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') commit(query, type);
            }}
            placeholder="Search runtime, tools, sessions, and secret names"
          />
          <FilterChips
            items={FILTERS.map(item => item === 'all' ? 'All' : LABELS[item])}
            active={type === 'all' ? 'All' : LABELS[type]}
            onChange={value => {
              const nextType = value === 'All'
                ? 'all'
                : (Object.entries(LABELS).find(([, label]) => label === value)?.[0] ?? 'all') as 'all' | SearchKind;
              setType(nextType);
              commit(query, nextType);
            }}
          />
          <div className="os-inline-actions">
            <Button onClick={() => commit(query, type)}>Search</Button>
            <Button
              variant="secondary"
              onClick={() => {
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
          <EmptyState title="Sign in required" body="Sign in to search runtime entities and workspace data." action={<Button href="/signin">Sign in</Button>} />
        ) : loading ? <LoadingState label="Searching workspace" /> : !payload ? (
          <EmptyState title="Search unavailable" body="The search service did not return results." />
        ) : groupedResults.length === 0 ? (
          <EmptyState title="No results" body={initialQuery ? 'Try another search term or category.' : 'Enter a search term to start.'} />
        ) : (
          <div className="os-drawer-stack">
            {groupedResults.map(([group, items]) => (
              <Card key={group}>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">{LABELS[group]}</div>
                  <StatusPill status={`${items.length} results`} label={`${items.length} results`} />
                </div>
                <div className="os-drawer-stack">
                  {items.map(item => (
                    <Card key={item.id}>
                      <div className="os-entity-head">
                        <div>
                          <div className="os-entity-title">{item.title}</div>
                          <div className="os-entity-copy">{item.subtitle}</div>
                          {item.updatedAt ? <div className="os-entity-meta">{new Date(item.updatedAt).toLocaleString()}</div> : null}
                        </div>
                        <div className="os-inline-actions">
                          <Button variant="secondary" onClick={() => setSelected(item)}>Inspect</Button>
                          <Button href={item.href}>{item.actionLabel}</Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </WorkspaceShell>

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title ?? 'Result'}
        description={selected?.subtitle ?? 'Result details'}
      >
        {selected ? (
          <>
            <Card>
              <div className="os-inline-actions">
                <Badge tone="accent">{LABELS[selected.kind]}</Badge>
                {selected.updatedAt ? <Badge tone="default">{new Date(selected.updatedAt).toLocaleDateString()}</Badge> : null}
              </div>
            </Card>
            <Card>
              <div className="os-entity-copy">{selected.subtitle}</div>
            </Card>
            <Card>
              <div className="os-inline-actions">
                <Button href={selected.href}>{selected.actionLabel}</Button>
              </div>
            </Card>
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
