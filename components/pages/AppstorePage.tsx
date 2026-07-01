'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import SurfaceShell from '@/components/os/surface-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import type { AgentAppListing } from '@/src/appstore/catalog';
import type { AppDiscoveryPayload } from '@/src/appstore/discovery';
import {
  DeveloperSpotlight,
  formatMarketplaceCount,
  LazyMarketplaceSection,
  ListingBanner,
  ListingMark,
  MarketplaceHero,
} from '@/components/marketplace/MarketplacePrimitives';

type StoreApp = AgentAppListing;

const FALLBACK_DISCOVERY: AppDiscoveryPayload = {
  apps: [],
  installedSlugs: [],
  categories: [],
  sections: [],
  hero: [],
  developerSpotlight: [],
};

function platformLabel(app: StoreApp): string {
  return (app.platforms.length ? app.platforms : app.deviceTargets).slice(0, 3).join(' / ') || 'AgentOS';
}

function actionLabel(installed: boolean): string {
  return installed ? 'Open' : 'Install';
}

function platformBadges(app: StoreApp): string[] {
  const values = new Set((app.platforms.length ? app.platforms : app.deviceTargets).map(item => item.toLowerCase()));
  return ['Web', 'Desktop', 'Android', 'iOS'].filter(item => values.has(item.toLowerCase()) || (item === 'Web' && values.has('agentos cloud')));
}

function AppCard(props: {
  app: StoreApp;
  installed: boolean;
  working: boolean;
  onInstall: (app: StoreApp) => void;
  onOpen: (app: StoreApp) => void;
}) {
  const { app, installed, working } = props;
  return (
    <article className="market-store-card">
      <Link href={`/appstore/${app.slug}`} className="market-store-card-link">
        <ListingBanner name={app.name} imageUrl={app.bannerUrl ?? app.screenshots[0] ?? null} />
        <div className="market-store-card-main">
          <ListingMark name={app.name} imageUrl={app.logoUrl} />
          <div>
            <h3>{app.name}</h3>
            <p>{app.description}</p>
          </div>
        </div>
      </Link>
      <Link href={`/developer/${app.developerHandle}`} className="market-card-developer">{app.publisherName || 'AgentOS Developer'}</Link>
      <div className="market-card-facts">
        <span>{app.rating > 0 ? app.rating.toFixed(1) : 'New'} rating</span>
        <span>v{app.manifest.version}</span>
        <span>{formatMarketplaceCount(app.installCount)} installs</span>
        <span>{platformLabel(app)}</span>
      </div>
      <div className="market-card-facts" aria-label={`${app.name} compatibility`}>
        <span>{app.runtimeType}</span>
        <span>{app.healthStatus}</span>
      </div>
      <div className="market-card-facts" aria-label={`${app.name} platform badges`}>
        {platformBadges(app).map(platform => <span key={platform}>{platform}</span>)}
      </div>
      <div className="market-card-actions">
        <button
          type="button"
          className="market-primary-action"
          disabled={working}
          onClick={() => installed ? props.onOpen(app) : props.onInstall(app)}
        >
          {working ? 'Working' : actionLabel(installed)}
        </button>
        {installed ? <Link href="/apps" className="market-secondary-action">Manage</Link> : null}
      </div>
    </article>
  );
}

function AppRow(props: {
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
    <LazyMarketplaceSection title={props.title} reason={props.reason}>
      <div className="market-horizontal-row market-app-row">
        {props.apps.map(app => (
          <AppCard
            key={app.id}
            app={app}
            installed={props.installedSlugs.has(app.slug)}
            working={props.workingSlug === app.slug}
            onInstall={props.onInstall}
            onOpen={props.onOpen}
          />
        ))}
      </div>
    </LazyMarketplaceSection>
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
    const id = window.setInterval(() => setHeroIndex(index => (index + 1) % discovery.hero.length), 6500);
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
      subtitle="Discover AgentOS products for research, trading, productivity, development, and enterprise workflows."
      actions={(
        <>
          <Link href="/appstore/updates" className="market-secondary-action">Updates</Link>
          {session?.capabilities?.includes('create_app') ? <Link href="/publish/app" className="market-secondary-action">Publish App</Link> : null}
        </>
      )}
    >
      <div className="market-shell" data-surface="appstore">
        <div className="market-search-panel">
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search apps, developers, categories, tags, keywords"
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
          <MarketplaceHero
            bannerUrl={hero.bannerUrl ?? hero.screenshots[0] ?? null}
            logoUrl={hero.logoUrl}
            eyebrow="Featured App"
            name={hero.name}
            description={hero.longDescription || hero.description}
            developerHref={`/developer/${hero.developerHandle}`}
            developerName={hero.publisherName || 'AgentOS Developer'}
            metadata={[platformLabel(hero), `${hero.rating > 0 ? hero.rating.toFixed(1) : 'New'} rating`, `${formatMarketplaceCount(hero.installCount)} installs`]}
            primaryLabel={workingSlug === hero.slug ? 'Working' : installedSlugs.has(hero.slug) ? 'Open' : 'Install'}
            primaryDisabled={workingSlug === hero.slug}
            secondaryHref={`/appstore/${hero.slug}`}
            secondaryLabel="Details"
            onPrimary={() => installedSlugs.has(hero.slug) ? void openApp(hero) : void installToWorkspace(hero)}
          />
        ) : null}

        {notice ? <div className="market-notice">{notice}</div> : null}

        {loading ? (
          <div className="market-skeleton-grid">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="market-skeleton" />)}
          </div>
        ) : discovery.apps.length === 0 ? (
          <div className="market-empty">
            <h2>No apps found</h2>
            <p>No accessible AgentOS apps matched this search.</p>
          </div>
        ) : search.trim() ? (
          <AppRow
            title="Search Results"
            apps={discovery.apps}
            installedSlugs={installedSlugs}
            workingSlug={workingSlug}
            onInstall={app => void installToWorkspace(app)}
            onOpen={app => void openApp(app)}
          />
        ) : (
          <>
            {discovery.sections.map(section => (
              <AppRow
                key={section.id}
                title={section.title}
                reason={section.reason}
                apps={section.apps}
                installedSlugs={installedSlugs}
                workingSlug={workingSlug}
                onInstall={app => void installToWorkspace(app)}
                onOpen={app => void openApp(app)}
              />
            ))}
            <DeveloperSpotlight developers={discovery.developerSpotlight} />
          </>
        )}
      </div>
    </SurfaceShell>
  );
}
