'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import SurfaceShell from '@/components/os/surface-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import type { AgentAppListing } from '@/src/appstore/catalog';
import { ListingBanner, ListingMark } from '@/components/marketplace/MarketplacePrimitives';

export type AppDetailRecord = AgentAppListing & {
  reviews?: Array<{ id?: string; rating?: number; reviewTitle?: string; reviewText?: string; createdAt?: string }>;
};

type Installation = {
  permissionsApproved?: string[];
  installedVersion?: string | null;
  updateAvailable?: boolean;
  status?: 'active' | 'disabled' | 'removed';
};

type AppReadiness = {
  installation: Installation | null;
  requiredPermissions: string[];
  missingPermissions: string[];
  missingSecrets: string[];
  missingSkills: string[];
  ready: boolean;
  updateAvailable: boolean;
  targets: Array<{ target: 'web' | 'android' | 'ios'; url: string }>;
  appUnavailableReason?: string | null;
};

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function logo(app: AppDetailRecord) {
  return <ListingMark name={app.name} imageUrl={app.logoUrl} className="market-detail-logo" />;
}

function uniqueList(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function targetForDevice(app: AppDetailRecord): string {
  const platforms = app.platforms.map(item => item.toLowerCase());
  if (platforms.includes('desktop')) return 'desktop';
  if (platforms.includes('android')) return 'android';
  if (platforms.includes('ios')) return 'ios';
  return 'pwa';
}

export default function AppDetailPage({
  initialApp = null,
}: {
  initialApp?: AppDetailRecord | null;
  initialViewerOwnsApp?: boolean;
}) {
  const params = useParams<{ slug: string }>();
  const shell = useApplicationShell();
  const slug = params?.slug ?? '';
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [app, setApp] = useState<AppDetailRecord | null>(initialApp);
  const [readiness, setReadiness] = useState<AppReadiness | null>(null);
  const [similar, setSimilar] = useState<AppDetailRecord[]>([]);
  const [loading, setLoading] = useState(initialApp === null);
  const [working, setWorking] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (withLoading = true) => {
    if (!slug) return;
    if (withLoading) setLoading(true);
    try {
      const currentSession = await fetchBrowserSession().catch(() => null);
      const [appRes, readinessRes, discoveryRes] = await Promise.all([
        fetch(`/api/apps/${slug}`, { cache: 'no-store' }),
        currentSession ? fetch(`/api/apps/${slug}/readiness`, { cache: 'no-store' }).catch(() => null) : Promise.resolve(null),
        fetch('/api/apps/discovery', { cache: 'no-store' }).catch(() => null),
      ]);
      const appData = await appRes.json().catch(() => ({}));
      const nextApp = appData.app ?? null;
      const readinessData = readinessRes ? await readinessRes.json().catch(() => ({})) : null;
      const discoveryData = discoveryRes ? await discoveryRes.json().catch(() => ({})) : {};
      setSession(currentSession);
      setApp(nextApp);
      setReadiness(readinessData ? {
        installation: readinessData.installation ?? null,
        requiredPermissions: readinessData.requiredPermissions ?? [],
        missingPermissions: readinessData.missingPermissions ?? [],
        missingSecrets: readinessData.missingSecrets ?? [],
        missingSkills: readinessData.missingSkills ?? [],
        ready: readinessData.ready === true,
        updateAvailable: readinessData.updateAvailable === true,
        targets: readinessData.targets ?? [],
        appUnavailableReason: typeof readinessData.appUnavailableReason === 'string' ? readinessData.appUnavailableReason : null,
      } : null);
      const allApps = Array.isArray(discoveryData.apps) ? discoveryData.apps as AppDetailRecord[] : [];
      setSimilar(nextApp ? allApps.filter(item => item.slug !== nextApp.slug && item.category === nextApp.category).slice(0, 6) : []);
    } catch {
      setApp(null);
      setReadiness(null);
      setSimilar([]);
    } finally {
      if (withLoading) setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (initialApp && initialApp.slug === slug) {
      setApp(initialApp);
      setLoading(false);
      void load(false);
      return;
    }
    void load(true);
  }, [initialApp, load, slug]);

  const installed = Boolean(readiness?.installation && readiness.installation.status !== 'removed');
  const permissions = useMemo(
    () => uniqueList(readiness?.requiredPermissions.length ? readiness.requiredPermissions : app ? [...app.permissionsRequired, ...app.manifest.permissions] : []),
    [app, readiness?.requiredPermissions],
  );
  const platforms = app ? uniqueList(app.platforms.length ? app.platforms : app.deviceTargets) : [];
  const features = app ? (app.features.length ? app.features : app.manifest.commands.map(command => command.description).filter(Boolean)) : [];
  const versionHistory = app ? (app.versionHistory.length ? app.versionHistory : [{
    id: `${app.id}-current`,
    version: app.manifest.version,
    changeSummary: 'Current production release.',
    createdAt: app.updatedAt,
  }]) : [];

  async function installToWorkspace() {
    if (!app) return;
    setWorking('workspace');
    setNotice('');
    try {
      const response = await fetch('/api/apps/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: app.slug,
          workspaceId: shell.activeWorkspaceId,
          permissionsApproved: permissions,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(payload.error ?? payload.message ?? 'Install failed');
        return;
      }
      setNotice('Installed to workspace.');
      await load(false);
    } finally {
      setWorking('');
    }
  }

  async function installToDevice() {
    if (!app) return;
    setWorking('device');
    setNotice('');
    try {
      const response = await fetch(`/api/apps/${app.slug}/device-install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: targetForDevice(app),
          workspaceId: shell.activeWorkspaceId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      setNotice(response.ok ? 'Installed to device. Offline reinstall remains available from workspace package cache.' : payload.error ?? payload.message ?? 'Device install failed');
    } finally {
      setWorking('');
    }
  }

  async function launch() {
    if (!app) return;
    setWorking('launch');
    setNotice('');
    try {
      const response = await fetch(`/api/apps/${app.slug}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'web' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(payload.error ?? payload.message ?? 'Launch failed');
        return;
      }
      if (typeof payload.openUrl === 'string') window.open(payload.openUrl, '_blank', 'noopener,noreferrer');
      setNotice('Launched.');
    } finally {
      setWorking('');
    }
  }

  return (
    <SurfaceShell activePath="/appstore" title={app?.name ?? 'App'} subtitle={app?.description}>
      <div className="market-shell" data-surface="app-detail">
        {loading ? (
          <div className="market-skeleton market-detail-skeleton" />
        ) : !app ? (
          <div className="market-empty">
            <h2>App not found</h2>
            <p>This app is private, unavailable, or unpublished.</p>
            <Link href="/appstore" className="market-secondary-action">Back to App Store</Link>
          </div>
        ) : (
          <>
            <section className="market-detail-hero">
              <ListingBanner name={app.name} imageUrl={app.bannerUrl ?? app.screenshots[0] ?? null} className="market-detail-backdrop" />
              {logo(app)}
              <div className="market-detail-copy">
                <Link href={`/developer/${app.developerHandle}`} className="market-developer-link">{app.publisherName || 'AgentOS Developer'}</Link>
                <h2>{app.name}</h2>
                <p>{app.longDescription || app.description}</p>
                <div className="market-hero-meta">
                  <span>Version {app.manifest.version}</span>
                  <span>Updated {new Date(app.updatedAt).toLocaleDateString()}</span>
                  <span>{platforms.join(' / ') || 'AgentOS'}</span>
                </div>
              </div>
              <div className="market-detail-actions">
                <button type="button" className="market-primary-action" disabled={working === 'workspace'} onClick={() => void installToWorkspace()}>
                  {working === 'workspace' ? 'Working' : installed ? 'Reinstall To Workspace' : 'Install To Workspace'}
                </button>
                <button type="button" className="market-secondary-action" disabled={working === 'device'} onClick={() => void installToDevice()}>
                  {working === 'device' ? 'Working' : 'Install To Device'}
                </button>
                <button type="button" className="market-secondary-action" disabled={!installed || working === 'launch'} onClick={() => void launch()}>
                  {working === 'launch' ? 'Opening' : 'Open'}
                </button>
                {installed ? <Link href="/apps" className="market-secondary-action">Manage</Link> : null}
              </div>
            </section>

            {notice ? <div className="market-notice">{notice}</div> : null}

            <section className="market-metric-grid" aria-label="App analytics">
              <div><span>Downloads</span><strong>{formatCount(app.downloadCount || app.installCount)}</strong></div>
              <div><span>Active Users</span><strong>{formatCount(app.activeUserCount)}</strong></div>
              <div><span>Rating</span><strong>{app.rating > 0 ? app.rating.toFixed(1) : 'New'}</strong></div>
              <div><span>Reviews</span><strong>{formatCount(app.reviewCount)}</strong></div>
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Overview</h2></div>
              <div className="market-info-grid">
                <div><span>Developer</span><strong>{app.publisherName || 'AgentOS Developer'}</strong></div>
                <div><span>Platforms</span><strong>{platforms.join(', ') || 'AgentOS'}</strong></div>
                <div><span>Last Updated</span><strong>{new Date(app.updatedAt).toLocaleDateString()}</strong></div>
                <div><span>Status</span><strong>{readiness?.appUnavailableReason ?? (installed ? 'Installed' : 'Available')}</strong></div>
                <div><span>Website</span><strong>{app.websiteUrl ? <a href={app.websiteUrl} target="_blank" rel="noreferrer">Open</a> : 'Not published'}</strong></div>
                <div><span>Documentation</span><strong>{app.documentationUrl ? <a href={app.documentationUrl} target="_blank" rel="noreferrer">Open</a> : 'Not published'}</strong></div>
              </div>
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Description</h2></div>
              <div className="market-release-panel">
                <p>{app.longDescription || app.description}</p>
              </div>
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Developer</h2></div>
              <div className="market-info-grid">
                <div><span>Name</span><strong>{app.publisherName || 'AgentOS Developer'}</strong></div>
                <div><span>Handle</span><strong>{app.developerHandle}</strong></div>
                <div><span>Website</span><strong>{app.websiteUrl ? <a href={app.websiteUrl} target="_blank" rel="noreferrer">Open</a> : 'Not published'}</strong></div>
                <div><span>Repository</span><strong>{app.repositoryUrl ? <a href={app.repositoryUrl} target="_blank" rel="noreferrer">Open</a> : 'Not published'}</strong></div>
              </div>
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Ratings</h2></div>
              <div className="market-metric-grid">
                <div><span>Average</span><strong>{app.rating > 0 ? app.rating.toFixed(1) : 'New'}</strong></div>
                <div><span>Reviews</span><strong>{formatCount(app.reviewCount)}</strong></div>
                <div><span>Installs</span><strong>{formatCount(app.installCount)}</strong></div>
                <div><span>Downloads</span><strong>{formatCount(app.downloadCount)}</strong></div>
              </div>
            </section>

            {app.videoUrl ? (
              <section className="market-section">
                <div className="market-section-head"><h2>Video</h2></div>
                <div className="market-video-frame">
                  <a href={app.videoUrl} target="_blank" rel="noreferrer">Open product video</a>
                </div>
              </section>
            ) : null}

            <section className="market-section">
              <div className="market-section-head"><h2>Screenshots</h2></div>
              {app.screenshots.length ? (
                <div className="market-screenshot-row">
                  {app.screenshots.map(src => <img key={src} src={src} alt={`${app.name} screenshot`} loading="lazy" />)}
                </div>
              ) : (
                <div className="market-empty compact"><p>No screenshots published.</p></div>
              )}
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Features</h2></div>
              {features.length ? (
                <div className="market-feature-grid">
                  {features.map(feature => <div key={feature}>{feature}</div>)}
                </div>
              ) : (
                <div className="market-empty compact"><p>No feature breakdown published.</p></div>
              )}
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Permissions</h2></div>
              {permissions.length ? (
                <div className="market-skill-tags">
                  {permissions.map(permission => <span key={permission}>{permission}</span>)}
                </div>
              ) : (
                <div className="market-empty compact"><p>No permissions requested.</p></div>
              )}
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Compatibility</h2></div>
              <div className="market-info-grid">
                <div><span>Platforms</span><strong>{platforms.join(', ') || 'AgentOS'}</strong></div>
                <div><span>Device Targets</span><strong>{app.deviceTargets.join(', ') || 'Web'}</strong></div>
                <div><span>Runtime</span><strong>{app.runtimeType}</strong></div>
                <div><span>Version</span><strong>{app.manifest.version}</strong></div>
              </div>
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Release Notes</h2></div>
              <div className="market-release-panel">
                <p>{app.releaseNotes || versionHistory[0]?.changeSummary || 'Release notes not provided.'}</p>
              </div>
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Version History</h2></div>
              <div className="market-timeline">
                {((app.changelog ?? []).length ? (app.changelog ?? []).map((item, index) => ({
                  id: `${app.id}-changelog-${index}`,
                  version: app.manifest.version,
                  changeSummary: item,
                  createdAt: app.updatedAt,
                })) : versionHistory).map(entry => (
                  <article key={entry.id}>
                    <strong>Version {entry.version}</strong>
                    <p>{entry.changeSummary || 'Release notes not provided.'}</p>
                    <span>{new Date(entry.createdAt).toLocaleDateString()}</span>
                  </article>
                ))}
              </div>
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Reviews</h2></div>
              {app.reviews?.length ? (
                <div className="market-review-grid">
                  {app.reviews.map((review, index) => (
                    <article key={review.id ?? index}>
                      <strong>{review.rating ? `${review.rating}/5` : 'Review'}</strong>
                      <p>{review.reviewText || review.reviewTitle || 'No review text.'}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="market-empty compact"><p>No public reviews yet.</p></div>
              )}
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Similar Apps</h2></div>
              {similar.length ? (
                <div className="market-app-grid">
                  {similar.map(item => (
                    <article key={item.id} className="market-app-card">
                      <Link href={`/appstore/${item.slug}`} className="market-app-card-main">
                        <ListingMark name={item.name} imageUrl={item.logoUrl} className="market-app-logo" />
                        <div className="market-app-copy">
                          <h3>{item.name}</h3>
                          <p>{item.description}</p>
                        </div>
                      </Link>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="market-empty compact"><p>No similar apps published.</p></div>
              )}
            </section>
          </>
        )}
      </div>
    </SurfaceShell>
  );
}
