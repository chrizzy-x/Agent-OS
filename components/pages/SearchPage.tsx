'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import SurfaceShell from '@/components/os/surface-shell';
import { Drawer } from '@/components/os/overlays';
import {
  SEARCH_HISTORY_KEY,
  SEARCH_PINNED_KEY,
  pushRecentSearch,
  readPinnedResults,
  readRecentSearches,
  togglePinnedResult,
  type SearchResultPin,
} from '@/src/search/client-state';
import { fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSession, type BrowserSessionAuthState } from '@/src/auth/browser-session';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChips,
  LoadingState,
  SearchBar,
  StatusPill,
} from '@/components/os/ui';

type SearchKind =
  | 'app'
  | 'installed_app'
  | 'skill'
  | 'installed_skill'
  | 'workflow'
  | 'session'
  | 'project'
  | 'library'
  | 'subagent'
  | 'file'
  | 'memory'
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

type SearchPayload = {
  total: number;
  groups: Partial<Record<SearchKind, SearchResult[]>>;
  results: SearchResult[];
};

const FILTERS: Array<'all' | SearchKind> = [
  'all',
  'installed_app',
  'app',
  'installed_skill',
  'skill',
  'workflow',
  'session',
  'project',
  'library',
  'subagent',
  'file',
  'memory',
  'vault',
  'doc',
  'connector',
  'ffp_route',
  'ffp_primitive',
];

const LABELS: Record<SearchKind, string> = {
  app: 'Apps',
  installed_app: 'Installed Apps',
  skill: 'Skills',
  installed_skill: 'Installed Skills',
  workflow: 'Workflows',
  session: 'Sessions',
  project: 'Projects',
  library: 'Library',
  subagent: 'Agents',
  file: 'Files',
  memory: 'Memory',
  vault: 'Vault',
  doc: 'Docs',
  connector: 'Connectors',
  ffp_route: 'FFP Routes',
  ffp_primitive: 'FFP Primitives',
};

function pinShape(item: SearchResult): SearchResultPin {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    href: item.href,
  };
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const initialType = (searchParams.get('type') ?? 'all') as 'all' | SearchKind;

  const [session, setSession] = useState<BrowserSession | null>(null);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState<'all' | SearchKind>(initialType);
  const [payload, setPayload] = useState<SearchPayload | null>(null);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [pinnedResults, setPinnedResults] = useState<SearchResultPin[]>([]);

  useEffect(() => {
    setQuery(initialQuery);
    setType(initialType);
  }, [initialQuery, initialType]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setRecentSearches(readRecentSearches(window.localStorage.getItem(SEARCH_HISTORY_KEY)));
    setPinnedResults(readPinnedResults(window.localStorage.getItem(SEARCH_PINNED_KEY)));
  }, []);

  useEffect(() => {
    let active = true;
    void fetchBrowserSessionState()
      .catch(() => ({ state: 'signed_out' as const, session: null }))
      .then(current => {
        if (!active) return;
        setSession(current.session);
        setAuthState(current.state);
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
    void fetchWithBrowserSession(`/api/search?q=${encodeURIComponent(initialQuery)}&type=${encodeURIComponent(initialType)}&limit=50`, { cache: 'no-store' })
      .then(async ({ response, authState: nextAuthState }) => {
        if (active) setAuthState(nextAuthState);
        return response.json();
      })
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

  function persistRecent(nextQuery: string) {
    if (typeof window === 'undefined') return;
    const next = pushRecentSearch(readRecentSearches(window.localStorage.getItem(SEARCH_HISTORY_KEY)), nextQuery);
    window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
    setRecentSearches(next);
  }

  function commit(nextQuery: string, nextType: 'all' | SearchKind) {
    const trimmed = nextQuery.trim();
    const params = new URLSearchParams();
    if (trimmed) {
      params.set('q', trimmed);
      persistRecent(trimmed);
    }
    if (nextType !== 'all') params.set('type', nextType);
    router.push(params.toString() ? `/search?${params.toString()}` : '/search');
  }

  function togglePin(item: SearchResult) {
    if (typeof window === 'undefined') return;
    const next = togglePinnedResult(readPinnedResults(window.localStorage.getItem(SEARCH_PINNED_KEY)), pinShape(item));
    window.localStorage.setItem(SEARCH_PINNED_KEY, JSON.stringify(next));
    setPinnedResults(next);
  }

  function isPinned(item: SearchResult) {
    return pinnedResults.some(pin => pin.id === item.id && pin.kind === item.kind);
  }

  return (
    <>
      <SurfaceShell
        activePath="/search"
        title="Search"
        subtitle="Search chats, projects, Library assets, installed apps, installed skills, workflows, files, memory, Vault, MCP, FFP, and docs."
      >
        <div className="os-drawer-stack">
          <Card>
            <div className="os-inline-actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div className="os-entity-copy">Shortcut: Ctrl/Cmd + K</div>
              <div className="os-inline-actions">
                <Button href="/studio">Open Studio</Button>
                <Button href="/appstore" variant="secondary">Browse Apps</Button>
                <Button href="/skills" variant="secondary">Browse Skills</Button>
              </div>
            </div>
          </Card>
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 8 }}>Search mode</div>
            <div className="os-entity-copy">Search covers Super AgentOS context, Library assets, installed apps, installed skills, workflows, sessions, projects, files, memory, Vault names, docs, connectors, and FFP records.</div>
          </Card>
          <SearchBar
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') commit(query, type);
            }}
            placeholder="Search chats, projects, apps, skills, workflows, agents, Vault items, connectors, or docs"
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
          authState === 'expired'
            ? <EmptyState title="Session expired" body="Sign in again to search your AgentOS." action={<Button href="/signin">Sign in again</Button>} />
            : <EmptyState title="Sign in required" body="Sign in to search your AgentOS." action={<Button href="/signin">Sign in</Button>} />
        ) : loading ? <LoadingState label="Searching" /> : !payload ? (
          <EmptyState title="Search unavailable" body="The search service did not return results." />
        ) : (
          <div className="os-drawer-stack">
            {!initialQuery ? (
              <>
                <Card>
                  <div className="os-entity-head" style={{ marginBottom: 12 }}>
                    <div className="os-entity-title">Pinned results</div>
                    <StatusPill status={`${pinnedResults.length} pinned`} label={`${pinnedResults.length} pinned`} />
                  </div>
                  {pinnedResults.length === 0 ? (
                    <div className="os-empty-body">Pin apps, workflows, sessions, or docs you revisit often.</div>
                  ) : (
                    <div className="os-drawer-stack">
                      {pinnedResults.map(item => (
                        <Card key={`${item.kind}:${item.id}`}>
                          <div className="os-entity-head">
                            <div>
                              <div className="os-entity-title">{item.title}</div>
                              <div className="os-entity-copy">{LABELS[item.kind as SearchKind] ?? item.kind}</div>
                            </div>
                            <Button href={item.href}>Open</Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </Card>
                <Card>
                  <div className="os-entity-head" style={{ marginBottom: 12 }}>
                    <div className="os-entity-title">Recent searches</div>
                    <StatusPill status={`${recentSearches.length} recent`} label={`${recentSearches.length} recent`} />
                  </div>
                  {recentSearches.length === 0 ? (
                    <div className="os-empty-body">Run a search and it will appear here.</div>
                  ) : (
                    <div className="os-inline-actions" style={{ flexWrap: 'wrap' }}>
                      {recentSearches.map(item => (
                        <Button key={item} variant="secondary" onClick={() => commit(item, 'all')}>{item}</Button>
                      ))}
                    </div>
                  )}
                </Card>
              </>
            ) : null}

            {groupedResults.length === 0 ? (
              <EmptyState title="No results" body={initialQuery ? 'Try another search term or category.' : 'Enter a search term to start.'} />
            ) : groupedResults.map(([group, items]) => (
              <Card key={group}>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">{LABELS[group]}</div>
                  <StatusPill status={`${items.length} results`} label={`${items.length} results`} />
                </div>
                <div className="os-drawer-stack">
                  {items.map(item => (
                    <Card key={`${item.kind}:${item.id}`}>
                      <div className="os-entity-head">
                        <div>
                          <div className="os-entity-title">{item.title}</div>
                          <div className="os-entity-copy">{item.subtitle}</div>
                          {item.updatedAt ? <div className="os-entity-meta">{new Date(item.updatedAt).toLocaleString()}</div> : null}
                        </div>
                        <div className="os-inline-actions">
                          <Button variant="secondary" onClick={() => togglePin(item)}>{isPinned(item) ? 'Unpin' : 'Pin'}</Button>
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
      </SurfaceShell>

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
                <Button variant="secondary" onClick={() => togglePin(selected)}>{isPinned(selected) ? 'Unpin' : 'Pin'}</Button>
                <Button href={selected.href}>{selected.actionLabel}</Button>
              </div>
            </Card>
          </>
        ) : null}
      </Drawer>
    </>
  );
}
