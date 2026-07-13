'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import SurfaceShell from '@/components/os/surface-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import type { AgentAppListing } from '@/src/appstore/catalog';
import { formatCountLabel, formatRatingLabel } from '@/src/data/discipline';
import type { AppDiscoveryPayload } from '@/src/appstore/discovery';
import {
  DeveloperSpotlight,
  LazyMarketplaceSection,
  ListingBanner,
  ListingMark,
  MarketplaceHero,
} from '@/components/marketplace/MarketplacePrimitives';

type StoreApp = AgentAppListing;
type AppFilter = 'all' | 'installed' | 'available' | 'verified' | 'web';

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
  return installed ? 'Open' : 'Review install';
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pricingLabel(app: StoreApp): string {
  const model = textValue(app.pricing.model ?? app.pricing.type ?? app.pricing.plan);
  const amount = Number(app.pricing.amount ?? app.pricing.price ?? app.pricing.monthly);
  if (!model) return 'Pricing not listed';
  if (/^free$/i.test(model)) return 'Free';
  if (Number.isFinite(amount) && amount > 0) return `$${amount.toFixed(2)}`;
  return model.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function verificationLabel(app: StoreApp): string {
  if (app.verified) return 'SDK verified';
  if (app.source === 'external_sdk') return 'SDK registered';
  return 'AgentOS app';
}

function healthLabel(app: StoreApp): string {
  if (app.disabled) return 'Disabled';
  if (app.healthStatus === 'online') return 'Online';
  if (app.healthStatus === 'degraded') return 'Degraded';
  if (app.healthStatus === 'offline') return 'Offline';
  return 'Health unknown';
}

function supportsWeb(app: StoreApp): boolean {
  const values = new Set((app.platforms.length ? app.platforms : app.deviceTargets).map(item => item.toLowerCase()));
  return Boolean(app.distribution.webUrl || app.appUrl || values.has('web') || values.has('agentos cloud'));
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
    <article className="market-store-card" data-installed={installed ? 'true' : 'false'}>
      <Link href={`/appstore/${app.slug}`} className="market-store-card-link">
        <ListingBanner name={app.name} imageUrl={app.bannerUrl ?? app.screenshots[0] ?? null} />
        <div className="market-card-badges" aria-label={`${app.name} store labels`}>
          <span>{pricingLabel(app)}</span>
          {installed ? <span>In Library</span> : <span>Available</span>}
        </div>
        <div className="market-store-card-main">
          <ListingMark name={app.name} imageUrl={app.logoUrl} />
          <div>
            <h3>{app.name}</h3>
            <p>{app.description}</p>
          </div>
        </div>
      </Link>
      <Link href={`/developer/${app.developerHandle}`} className="market-card-developer">By {app.publisherName || 'AgentOS Developer'}</Link>
      <div className="market-card-facts">
        <span>{verificationLabel(app)}</span>
        <span>{supportsWeb(app) ? 'Web-ready' : platformLabel(app)}</span>
        <span>{healthLabel(app)}</span>
      </div>
      <div className="market-card-facts">
        <span>v{app.manifest.version}</span>
        <span>{formatCountLabel(app.installCount, 'install', 'installs')}</span>
        <span>{formatRatingLabel(app.rating, app.reviewCount)}</span>
      </div>
      <div className="market-card-actions">
        {installed ? (
          <button
            type="button"
            className="market-primary-action"
            data-action="open"
            disabled={working}
            onClick={() => props.onOpen(app)}
          >
            {working ? 'Opening...' : actionLabel(true)}
          </button>
        ) : (
          <Link href={`/appstore/${app.slug}`} className="market-primary-action" data-action="review">{actionLabel(false)}</Link>
        )}
        <Link href={installed ? '/library?type=apps' : `/appstore/${app.slug}`} className="market-secondary-action" data-action={installed ? 'library' : 'details'}>
          {installed ? 'Library' : 'Details'}
        </Link>
      </div>
    </article>
  );
}

function sectionTitle(title: string): string {
  if (title === 'Recommended For You') return 'Recommended';
  if (title === 'Because You Use AgentOS') return 'Built for AgentOS';
  if (title === 'Top Installed') return 'Most installed';
  return title;
}

function appMatchesFilter(app: StoreApp, installed: boolean, filter: AppFilter): boolean {
  if (filter === 'installed') return installed;
  if (filter === 'available') return !installed;
  if (filter === 'verified') return app.verified;
  if (filter === 'web') return supportsWeb(app);
  return true;
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
  const [filter, setFilter] = useState<AppFilter>('all');

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
  const visibleApps = useMemo(
    () => discovery.apps.filter(app => appMatchesFilter(app, installedSlugs.has(app.slug), filter)),
    [discovery.apps, filter, installedSlugs],
  );
  const filters = useMemo(() => [
    { id: 'all' as const, label: 'All apps', count: discovery.apps.length },
    { id: 'installed' as const, label: 'In Library', count: discovery.apps.filter(app => installedSlugs.has(app.slug)).length },
    { id: 'available' as const, label: 'Available', count: discovery.apps.filter(app => !installedSlugs.has(app.slug)).length },
    { id: 'verified' as const, label: 'SDK verified', count: discovery.apps.filter(app => app.verified).length },
    { id: 'web' as const, label: 'Web-ready', count: discovery.apps.filter(supportsWeb).length },
  ], [discovery.apps, installedSlugs]);

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
      subtitle="Install SDK-backed apps into Library. Universal MCP connectors stay separate from App Store apps."
      actions={(
        <>
          <Link href="/appstore/updates" className="market-secondary-action" data-action="updates">App updates</Link>
          {session?.capabilities?.includes('create_app') ? <Link href="/publish/app" className="market-secondary-action" data-action="publish">Publish app</Link> : null}
        </>
      )}
    >
      <div className="market-shell" data-surface="appstore">
        <div className="market-search-panel">
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search apps by name, developer, task, or category"
            aria-label="Search apps"
          />
        </div>

        <div className="market-filter-row" aria-label="App filters">
          {filters.map(item => (
            <button key={item.id} type="button" className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)}>
              <span>{item.label}</span>
              <b>{item.count}</b>
            </button>
          ))}
        </div>

        <div className="market-result-summary" aria-live="polite">
          {loading ? 'Loading App Store listings...' : `${visibleApps.length} ${visibleApps.length === 1 ? 'app' : 'apps'} shown from live discovery`}
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
            metadata={[pricingLabel(hero), verificationLabel(hero), supportsWeb(hero) ? 'Web-ready' : platformLabel(hero), formatRatingLabel(hero.rating, hero.reviewCount), formatCountLabel(hero.installCount, 'install', 'installs')]}
            primaryLabel={workingSlug === hero.slug ? 'Working...' : installedSlugs.has(hero.slug) ? 'Open' : 'Review install'}
            primaryDisabled={workingSlug === hero.slug}
            secondaryHref={`/appstore/${hero.slug}`}
            secondaryLabel="Details"
            onPrimary={() => installedSlugs.has(hero.slug) ? void openApp(hero) : window.location.assign(`/appstore/${hero.slug}`)}
          />
        ) : null}

        {notice ? <div className="market-notice">{notice}</div> : null}

        {loading ? (
          <div className="market-skeleton-grid">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="market-skeleton" />)}
          </div>
        ) : visibleApps.length === 0 ? (
          <div className="market-empty">
            <h2>No matching apps</h2>
            <p>{search.trim() || filter !== 'all' || category !== 'All' ? 'No accessible App Store listings match the current search and filters.' : 'No published AgentOS apps are available from the backend yet.'}</p>
            <Link href="/studio" className="market-secondary-action" data-action="open">Open Super AgentOS</Link>
          </div>
        ) : search.trim() ? (
          <AppRow
            title="Search Results"
            apps={visibleApps}
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
                title={sectionTitle(section.title)}
                reason={section.reason}
                apps={section.apps.filter(app => appMatchesFilter(app, installedSlugs.has(app.slug), filter))}
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
