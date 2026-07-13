'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import SurfaceShell from '@/components/os/surface-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import type { AgentAppListing } from '@/src/appstore/catalog';
import { formatMetricCount, formatRatingLabel } from '@/src/data/discipline';
import { ListingBanner, ListingMark } from '@/components/marketplace/MarketplacePrimitives';

export type AppDetailRecord = AgentAppListing & {
  reviews?: Array<{ id?: string; rating?: number; reviewTitle?: string; reviewText?: string; createdAt?: string }>;
};

type Installation = {
  permissionsApproved?: string[];
  installedVersion?: string | null;
  updateAvailable?: boolean;
  status?: 'active' | 'disabled' | 'removed';
  favorite?: boolean;
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

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pricingLabel(app: AppDetailRecord): string {
  const model = textValue(app.pricing.model ?? app.pricing.type ?? app.pricing.plan);
  const amount = Number(app.pricing.amount ?? app.pricing.price ?? app.pricing.monthly);
  if (!model) return 'Pricing not listed';
  if (/^free$/i.test(model)) return 'Free';
  if (Number.isFinite(amount) && amount > 0) return `$${amount.toFixed(2)}`;
  return model.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function verificationLabel(app: AppDetailRecord): string {
  if (app.verified) return 'SDK verified';
  if (app.source === 'external_sdk') return 'SDK registered';
  return 'AgentOS app';
}

function sourceLabel(app: AppDetailRecord): string {
  return app.source === 'external_sdk' ? 'SDK app' : 'AgentOS app';
}

function healthLabel(app: AppDetailRecord): string {
  if (app.disabled) return 'Disabled';
  if (app.healthStatus === 'online') return 'Online';
  if (app.healthStatus === 'degraded') return 'Degraded';
  if (app.healthStatus === 'offline') return 'Offline';
  return 'Health unknown';
}

function supportsWeb(app: AppDetailRecord): boolean {
  const values = new Set((app.platforms.length ? app.platforms : app.deviceTargets).map(item => item.toLowerCase()));
  return Boolean(app.distribution.webUrl || app.appUrl || values.has('web') || values.has('agentos cloud'));
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
  const [permissionsReviewed, setPermissionsReviewed] = useState(false);

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
  const permissionKey = permissions.join('|');
  const platforms = app ? uniqueList(app.platforms.length ? app.platforms : app.deviceTargets) : [];
  const features = app ? (app.features.length ? app.features : app.manifest.commands.map(command => command.description).filter(Boolean)) : [];
  const versionHistory = app ? app.versionHistory : [];
  const requiredSecrets = app ? uniqueList([...(app.requiredSecrets ?? []), ...(app.manifest.requiredSecrets ?? [])]) : [];
  const installReady = permissions.length === 0 || permissionsReviewed;

  useEffect(() => {
    setPermissionsReviewed(permissions.length === 0);
  }, [permissionKey, permissions.length]);

  async function installToWorkspace() {
    if (!app) return;
    if (!installReady) {
      setNotice('Review and approve the requested permissions before adding this app to Library.');
      return;
    }
    setWorking('workspace');
    setNotice('');
    try {
      const response = await fetch('/api/apps/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: app.slug,
          workspaceId: shell.activeWorkspaceId,
          permissionsApproved: permissionsReviewed ? permissions : [],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(payload.error ?? payload.message ?? 'Install failed');
        return;
      }
      setNotice('Added to Library.');
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
      setNotice('Opened app.');
    } finally {
      setWorking('');
    }
  }

  async function updateLibraryConfiguration() {
    if (!app || !installed) return;
    setWorking('configure');
    setNotice('');
    try {
      const response = await fetch(`/api/apps/${app.slug}/installation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionsApproved: permissionsReviewed ? permissions : [] }),
      });
      const payload = await response.json().catch(() => ({}));
      setNotice(response.ok ? 'Library configuration updated.' : payload.error ?? payload.message ?? 'Configuration update failed');
      if (response.ok) await load(false);
    } finally {
      setWorking('');
    }
  }

  async function removeFromLibrary() {
    if (!app || !installed) return;
    setWorking('remove');
    setNotice('');
    try {
      const response = await fetch(`/api/apps/${app.slug}/installation`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      setNotice(response.ok ? 'Removed from Library.' : payload.error ?? payload.message ?? 'Remove failed');
      if (response.ok) await load(false);
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
            <Link href="/appstore" className="market-secondary-action" data-action="back">Back to App Store</Link>
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
                  <span>{app.category}</span>
                  <span>{pricingLabel(app)}</span>
                  <span>{verificationLabel(app)}</span>
                  <span>Version {app.manifest.version}</span>
                  <span>Updated {new Date(app.updatedAt).toLocaleDateString()}</span>
                  <span>{supportsWeb(app) ? 'Web-ready' : platforms.join(' / ') || 'AgentOS'}</span>
                </div>
              </div>
              <div className="market-detail-actions">
                <button type="button" className="market-primary-action" data-action={installed ? 'update' : 'add'} disabled={working === 'workspace' || !installReady} title={!installReady ? 'Review permissions before adding this app to Library.' : undefined} onClick={() => void installToWorkspace()}>
                  {working === 'workspace' ? 'Working...' : installed ? 'Update in Library' : 'Add to Library'}
                </button>
                {installed ? <Link href={`/library?type=apps&q=${encodeURIComponent(app.name)}`} className="market-secondary-action" data-action="configure">Configure in Library</Link> : null}
                <button
                  type="button"
                  className="market-secondary-action"
                  data-action="device"
                  disabled={!installed || working === 'device'}
                  title={!installed ? 'Add this app to Library before installing it to a device.' : undefined}
                  onClick={() => void installToDevice()}
                >
                  {working === 'device' ? 'Working...' : 'Install on device'}
                </button>
                <button
                  type="button"
                  className="market-secondary-action"
                  data-action="open"
                  disabled={!installed || working === 'launch'}
                  title={!installed ? 'Add this app to Library before opening it.' : undefined}
                  onClick={() => void launch()}
                >
                  {working === 'launch' ? 'Opening...' : 'Open app'}
                </button>
                {installed ? (
                  <button type="button" className="market-secondary-action" data-action="save" disabled={working === 'configure'} onClick={() => void updateLibraryConfiguration()}>
                    {working === 'configure' ? 'Saving...' : 'Save permissions'}
                  </button>
                ) : null}
                {installed ? (
                  <button type="button" className="market-secondary-action danger" data-action="remove" disabled={working === 'remove'} onClick={() => void removeFromLibrary()}>
                    {working === 'remove' ? 'Removing...' : 'Remove from Library'}
                  </button>
                ) : null}
              </div>
            </section>

            {notice ? <div className="market-notice">{notice}</div> : null}

            <section className="market-section">
              <div className="market-section-head"><h2>Install Review</h2></div>
              <div className="market-install-review">
                <div>
                  <span>Library status</span>
                  <strong>{installed ? 'In Library' : 'Not in Library'}</strong>
                </div>
                <div>
                  <span>Pricing</span>
                  <strong>{pricingLabel(app)}</strong>
                </div>
                <div>
                  <span>Vault setup</span>
                  <strong>{requiredSecrets.length ? `${requiredSecrets.length} secret ${requiredSecrets.length === 1 ? 'required' : 'required'}` : 'No Vault secret required'}</strong>
                </div>
                <label className="market-permission-review">
                  <input
                    type="checkbox"
                    checked={permissionsReviewed}
                    onChange={event => setPermissionsReviewed(event.target.checked)}
                    disabled={permissions.length === 0}
                  />
                  <span>{permissions.length ? `I reviewed ${permissions.length} requested ${permissions.length === 1 ? 'permission' : 'permissions'}.` : 'No permissions requested.'}</span>
                </label>
              </div>
            </section>

            <section className="market-metric-grid" aria-label="App analytics">
              <div><span>Downloads</span><strong>{formatMetricCount(app.downloadCount, 'No downloads recorded')}</strong></div>
              <div><span>Active Users</span><strong>{formatMetricCount(app.activeUserCount, 'No active users recorded')}</strong></div>
              <div><span>Rating</span><strong>{formatRatingLabel(app.rating, app.reviewCount)}</strong></div>
              <div><span>Reviews</span><strong>{formatMetricCount(app.reviewCount, 'No reviews yet')}</strong></div>
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Overview</h2></div>
              <div className="market-info-grid">
                <div><span>Developer</span><strong>{app.publisherName || 'AgentOS Developer'}</strong></div>
                <div><span>Category</span><strong>{app.category}</strong></div>
                <div><span>Short description</span><strong>{app.description}</strong></div>
                <div><span>Pricing</span><strong>{pricingLabel(app)}</strong></div>
                <div><span>SDK status</span><strong>{verificationLabel(app)}</strong></div>
                <div><span>Source</span><strong>{sourceLabel(app)}</strong></div>
                <div><span>Platforms</span><strong>{platforms.join(', ') || 'AgentOS'}</strong></div>
                <div><span>Last Updated</span><strong>{new Date(app.updatedAt).toLocaleDateString()}</strong></div>
                <div><span>Status</span><strong>{readiness?.appUnavailableReason ?? (installed ? 'In Library' : 'Available')}</strong></div>
                <div><span>Health</span><strong>{healthLabel(app)}</strong></div>
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
                <div><span>Average</span><strong>{formatRatingLabel(app.rating, app.reviewCount)}</strong></div>
                <div><span>Reviews</span><strong>{formatMetricCount(app.reviewCount, 'No reviews yet')}</strong></div>
                <div><span>Installs</span><strong>{formatMetricCount(app.installCount, 'No installs yet')}</strong></div>
                <div><span>Downloads</span><strong>{formatMetricCount(app.downloadCount, 'No downloads recorded')}</strong></div>
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
              <div className="market-section-head"><h2>Vault Requirements</h2></div>
              {requiredSecrets.length || readiness?.missingSecrets.length ? (
                <div className="market-skill-tags">
                  {uniqueList([...(requiredSecrets ?? []), ...(readiness?.missingSecrets ?? [])]).map(secret => <span key={secret}>{secret}</span>)}
                </div>
              ) : (
                <div className="market-empty compact"><p>No Vault secret required.</p></div>
              )}
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Compatibility</h2></div>
              <div className="market-info-grid">
                <div><span>Platforms</span><strong>{platforms.join(', ') || 'AgentOS'}</strong></div>
                <div><span>Device Targets</span><strong>{app.deviceTargets.join(', ') || 'Web'}</strong></div>
                <div><span>Runtime</span><strong>{app.runtimeType}</strong></div>
                <div><span>Compatibility</span><strong>{supportsWeb(app) ? 'Web-ready' : 'Device install only'}</strong></div>
                <div><span>Version</span><strong>{app.manifest.version}</strong></div>
              </div>
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Release Notes</h2></div>
              <div className="market-release-panel">
                <p>{app.releaseNotes || 'Release notes not provided.'}</p>
              </div>
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Version History</h2></div>
              {((app.changelog ?? []).length || versionHistory.length) ? (
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
              ) : (
                <div className="market-empty compact"><p>No version history published.</p></div>
              )}
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
