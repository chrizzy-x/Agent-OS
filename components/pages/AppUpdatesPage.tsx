'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import SurfaceShell from '@/components/os/surface-shell';

type UpdateRecord = {
  app: {
    slug: string;
    name: string;
    description: string;
    logoUrl?: string | null;
    manifest: { version: string };
    publisherName?: string;
  };
  currentVersion: string;
  installedVersion: string | null;
  releaseNotes: string | null;
};

function logo(app: UpdateRecord['app']) {
  if (app.logoUrl) return <img src={app.logoUrl} alt="" />;
  return <span>{app.name.slice(0, 2).toUpperCase()}</span>;
}

export default function AppUpdatesPage() {
  const [updates, setUpdates] = useState<UpdateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/apps/updates', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      setUpdates(response.ok ? payload.updates ?? [] : []);
      if (!response.ok) setNotice(payload.error ?? payload.message ?? 'Sign in to view updates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateAll() {
    setWorking('all');
    setNotice('');
    try {
      const response = await fetch('/api/apps/updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      setNotice(response.ok ? `Updated ${payload.total ?? 0} apps.` : payload.error ?? payload.message ?? 'Update failed');
      await load();
    } finally {
      setWorking('');
    }
  }

  async function updateOne(item: UpdateRecord) {
    setWorking(item.app.slug);
    setNotice('');
    try {
      const response = await fetch('/api/apps/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: item.app.slug }),
      });
      const payload = await response.json().catch(() => ({}));
      setNotice(response.ok ? `${item.app.name} updated.` : payload.error ?? payload.message ?? 'Update failed');
      await load();
    } finally {
      setWorking('');
    }
  }

  async function rollback(item: UpdateRecord) {
    setWorking(`rollback:${item.app.slug}`);
    setNotice('');
    try {
      const response = await fetch(`/api/apps/${item.app.slug}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: item.installedVersion }),
      });
      const payload = await response.json().catch(() => ({}));
      setNotice(response.ok ? `${item.app.name} rolled back to ${payload.rolledBackTo}.` : payload.error ?? payload.message ?? 'Rollback failed');
      await load();
    } finally {
      setWorking('');
    }
  }

  return (
    <SurfaceShell
      activePath="/appstore"
      title="App Updates"
      subtitle="Update installed workspace apps and roll back to prior recorded versions."
      actions={<Link href="/appstore" className="market-secondary-action">App Store</Link>}
    >
      <div className="market-shell" data-surface="app-updates">
        <section className="market-section">
          <div className="market-section-head">
            <div>
              <h2>Available Updates</h2>
              <p>{updates.length} updates ready</p>
            </div>
            <button type="button" className="market-primary-action" disabled={working === 'all' || updates.length === 0} onClick={() => void updateAll()}>
              {working === 'all' ? 'Updating' : 'Update All'}
            </button>
          </div>
          {notice ? <div className="market-notice">{notice}</div> : null}
          {loading ? (
            <div className="market-skeleton-grid">
              {Array.from({ length: 3 }).map((_, index) => <div key={index} className="market-skeleton" />)}
            </div>
          ) : updates.length === 0 ? (
            <div className="market-empty compact"><p>No app updates are currently available.</p></div>
          ) : (
            <div className="market-update-list">
              {updates.map(item => (
                <article key={item.app.slug} className="market-update-card">
                  <div className="market-app-logo">{logo(item.app)}</div>
                  <div>
                    <h3>{item.app.name}</h3>
                    <p>{item.app.description}</p>
                    <div className="market-app-meta">
                      <span>Installed {item.installedVersion ?? 'unknown'}</span>
                      <span>Current {item.currentVersion}</span>
                      <span>{item.app.publisherName ?? 'AgentOS Developer'}</span>
                    </div>
                    <p className="market-release-notes">{item.releaseNotes || 'No release notes published.'}</p>
                  </div>
                  <div className="market-update-actions">
                    <button type="button" className="market-primary-action" disabled={working === item.app.slug} onClick={() => void updateOne(item)}>
                      {working === item.app.slug ? 'Updating' : 'Update'}
                    </button>
                    <button type="button" className="market-secondary-action" disabled={!item.installedVersion || working === `rollback:${item.app.slug}`} onClick={() => void rollback(item)}>
                      {working === `rollback:${item.app.slug}` ? 'Rolling Back' : 'Rollback Version'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </SurfaceShell>
  );
}
