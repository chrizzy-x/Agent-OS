'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import SurfaceShell from '@/components/os/surface-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import type { AgentAppListing } from '@/src/appstore/catalog';
import type { AppDiscoveryPayload } from '@/src/appstore/discovery';

type StoreApp = AgentAppListing;

const FALLBACK_DISCOVERY: AppDiscoveryPayload = {
  apps: [],
  installedSlugs: [],
  categories: [],
  sections: [],
  hero: [],
};

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function appLogo(app: StoreApp) {
  if (app.logoUrl) {
    return <img src={app.logoUrl} alt="" loading="lazy" />;
  }
  return <span>{app.name.slice(0, 2).toUpperCase()}</span>;
}

function platformLabel(app: StoreApp): string {
  return (app.platforms.length ? app.platforms : app.deviceTargets).slice(0, 3).join(' / ') || 'AgentOS';
}

function installLabel(installed: boolean): string {
  return installed ? 'Open' : 'Install';
}

function MarketplaceAppCard(props: {
  app: StoreApp;
  installed: boolean;
  working: boolean;
  onInstall: (app: StoreApp) => void;
  onOpen: (app: StoreApp) => void;
}) {
  const { app, installed, working } = props;
  return (
    <article className="market-app-card">
      <Link href={`/appstore/${app.slug}`} className="market-app-card-main">
        <div className="market-app-logo">{appLogo(app)}</div>
        <div className="market-app-copy">
          <h3>{app.name}</h3>
          <p>{app.description}</p>
        </div>
      </Link>
      <div className="market-app-meta">
        <span>{app.publisherName || 'AgentOS Developer'}</span>
        <span>{app.rating > 0 ? app.rating.toFixed(1) : 'New'} rating</span>
        <span>{formatCount(app.installCount)} installs</span>
      </div>
      <div className="market-platforms">{platformLabel(app)}</div>
      <button
        type="button"
        className="market-primary-action"
        disabled={working}
        onClick={() => installed ? props.onOpen(app) : props.onInstall(app)}
      >
        {working ? 'Working' : installLabel(installed)}
      </button>
    </article>
  );
}

function AppSection(props: {
  title: string;
  reason?: string;
  apps: StoreApp[];
  installedSlugs: Set<string>;
  workingSlug: string;
  onInstall: (app: StoreApp) => void;
  onOpen: (app: StoreApp) => void;
}) {
  if (props.apps.length === 0) return null;
  return (
    <section className="market-section">
      <div className="market-section-head">
        <div>
          <h2>{props.title}</h2>
          {props.reason ? <p>{props.reason}</p> : null}
        </div>
      </div>
      <div className="market-app-grid">
        {props.apps.map(app => (
          <MarketplaceAppCard
            key={app.id}
            app={app}
            installed={props.installedSlugs.has(app.slug)}
            working={props.workingSlug === app.slug}
            onInstall={props.onInstall}
            onOpen={props.onOpen}
          />
        ))}
      </div>
    </section>
  );
}

export default function AppstorePage() {
  const shell = useApplicationShell();
  const cache = useRef(new Map<string, AppDiscoveryPayload>());
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [discovery, setDiscovery] = useState<AppDiscoveryPayload>(FALLBACK_DISCOVERY);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [workingSlug, setWorkingSlug] = useState('');
  const [heroIndex, setHeroIndex] = useState(0);

  const loadDiscovery = useCallback(async () => {
    const key = `${search.trim()}::${category}`;
    const cached = cache.current.get(key);
    if (cached) {
      setDiscovery(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('search', search.trim());
      if (category !== 'All') query.set('category', category);
      const [res, currentSession] = await Promise.all([
        fetch(`/api/apps/discovery?${query.toString()}`, { cache: 'no-store' }),
        fetchBrowserSession().catch(() => null),
      ]);
      const payload = res.ok ? await res.json() as AppDiscoveryPayload : FALLBACK_DISCOVERY;
      cache.current.set(key, payload);
      setDiscovery(payload);
      setSession(currentSession);
    } catch {
      setDiscovery(FALLBACK_DISCOVERY);
    } finally {
      setLoading(false);
    }
  }, [category, search]);

  useEffect(() => {
    const id = window.setTimeout(() => void loadDiscovery(), 120);
    return () => window.clearTimeout(id);
  }, [loadDiscovery]);

  useEffect(() => {
    if (discovery.hero.length <= 1) return;
    const id = window.setInterval(() => setHeroIndex(index => (index + 1) % discovery.hero.length), 6000);
    return () => window.clearInterval(id);
  }, [discovery.hero.length]);

  const categories = useMemo(() => ['All', ...discovery.categories], [discovery.categories]);
  const installedSlugs = useMemo(() => new Set(discovery.installedSlugs), [discovery.installedSlugs]);
  const hero = discovery.hero[heroIndex % Math.max(discovery.hero.length, 1)] ?? discovery.apps[0] ?? null;

  async function installToWorkspace(app: StoreApp) {
    setWorkingSlug(app.slug);
    setNotice('');
    try {
      const response = await fetch('/api/apps/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: app.slug,
          workspaceId: shell.activeWorkspaceId,
          permissionsApproved: app.permissionsRequired,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(payload.error ?? payload.message ?? 'Install failed');
        return;
      }
      cache.current.clear();
      setNotice(`${app.name} added to your workspace.`);
      await loadDiscovery();
    } finally {
      setWorkingSlug('');
    }
  }

  async function openApp(app: StoreApp) {
    setWorkingSlug(app.slug);
    setNotice('');
    try {
      const response = await fetch(`/api/apps/${app.slug}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: app.distribution.webUrl || app.appUrl ? 'web' : 'pwa' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(payload.error ?? payload.message ?? 'Launch failed');
        return;
      }
      if (typeof payload.openUrl === 'string') {
        window.open(payload.openUrl, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setWorkingSlug('');
    }
  }

  return (
    <SurfaceShell
      activePath="/appstore"
      title="App Store"
      subtitle="Discover, install, launch, manage, and update AgentOS applications."
      actions={(
        <>
          <Link href="/appstore/updates" className="market-secondary-action">Updates</Link>
          {session?.capabilities?.includes('create_app') ? <Link href="/developer/publish" className="market-secondary-action">Publish</Link> : null}
        </>
      )}
    >
      <div className="market-shell" data-surface="appstore">
        <div className="market-search-panel">
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search apps, developers, keywords, tags, categories"
            aria-label="Search apps"
          />
        </div>

        <div className="market-chip-row" aria-label="App categories">
          {categories.map(item => (
            <button key={item} type="button" className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>
              {item}
            </button>
          ))}
        </div>

        {hero ? (
          <section className="market-hero">
            <div className="market-hero-logo">{appLogo(hero)}</div>
            <div className="market-hero-copy">
              <span>{hero.publisherName || 'AgentOS Developer'}</span>
              <h2>{hero.name}</h2>
              <p>{hero.longDescription || hero.description}</p>
              <div className="market-hero-meta">
                <span>{platformLabel(hero)}</span>
                <span>{hero.rating > 0 ? hero.rating.toFixed(1) : 'New'} rating</span>
                <span>{formatCount(hero.installCount)} installs</span>
              </div>
            </div>
            <div className="market-hero-actions">
              <button
                type="button"
                className="market-primary-action"
                disabled={workingSlug === hero.slug}
                onClick={() => installedSlugs.has(hero.slug) ? void openApp(hero) : void installToWorkspace(hero)}
              >
                {workingSlug === hero.slug ? 'Working' : installedSlugs.has(hero.slug) ? 'Open' : 'Install'}
              </button>
              <Link href={`/appstore/${hero.slug}`} className="market-secondary-action">Details</Link>
            </div>
          </section>
        ) : null}

        {notice ? <div className="market-notice">{notice}</div> : null}

        {loading ? (
          <div className="market-skeleton-grid">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="market-skeleton" />)}
          </div>
        ) : discovery.apps.length === 0 ? (
          <div className="market-empty">
            <h2>No apps found</h2>
            <p>No accessible AgentOS SDK apps matched this search.</p>
          </div>
        ) : search.trim() ? (
          <AppSection
            title="Search Results"
            apps={discovery.apps}
            installedSlugs={installedSlugs}
            workingSlug={workingSlug}
            onInstall={app => void installToWorkspace(app)}
            onOpen={app => void openApp(app)}
          />
        ) : (
          discovery.sections.map(section => (
            <AppSection
              key={section.id}
              title={section.title}
              reason={section.reason}
              apps={section.apps}
              installedSlugs={installedSlugs}
              workingSlug={workingSlug}
              onInstall={app => void installToWorkspace(app)}
              onOpen={app => void openApp(app)}
            />
          ))
        )}
      </div>
    </SurfaceShell>
  );
}
