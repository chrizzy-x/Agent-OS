'use client';

import { useCallback, useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { Badge, Button, Card, EmptyState, LoadingState, PageHeader } from '@/components/os/ui';

type FfpTempSettings = {
  workspaceId: string | null;
  enabled: boolean;
  status: 'FFP Disabled' | 'FFP Enabled';
  route: string;
  affectedExecutionTypes: string[];
  bypassedExecutionTypes: string[];
  updatedAt: string | null;
};

export default function FfpPage() {
  const [settings, setSettings] = useState<FfpTempSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/ffp/temp', { cache: 'no-store', credentials: 'include' });
      const payload = await response.json();
      setSettings(response.ok ? payload : null);
      if (!response.ok) setError(payload.error ?? 'FFP temp settings unavailable.');
    } catch {
      setSettings(null);
      setError('FFP temp settings unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle() {
    if (!settings) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/ffp/temp', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: settings.workspaceId, enabled: !settings.enabled }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Unable to update FFP temp.');
      setSettings(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update FFP temp.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/ffp" />
      <WorkspaceShell
        activePath="/ffp"
        aside={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>FFP</div>
            <div className="os-drawer-stack">
              <Badge tone={settings?.enabled ? 'success' : 'default'}>{settings?.status ?? 'FFP Disabled'}</Badge>
              <div className="os-entity-copy">Real Fabric Furge Protocol is not live yet.</div>
            </div>
          </Card>
        )}
      >
        <PageHeader
          eyebrow="FFP"
          title="FFP temp"
          subtitle="Temporary multi-agent routing hook for the future Fabric Furge Protocol. No consensus engine is active in this release."
          actions={settings ? (
            <button
              type="button"
              className="os-switch"
              role="switch"
              aria-checked={settings.enabled}
              onClick={() => void toggle()}
              disabled={saving}
            >
              <span />
              {saving ? 'Saving' : settings.enabled ? 'FFP Enabled' : 'FFP Disabled'}
            </button>
          ) : null}
        />

        {loading ? <LoadingState label="Loading FFP temp" /> : !settings ? (
          <EmptyState title="FFP unavailable" body={error || 'Sign in to manage the workspace FFP temp toggle.'} action={<Button href="/signin">Sign in</Button>} />
        ) : (
          <div className="os-drawer-stack">
            {error ? <Card><div className="os-entity-copy">{error}</div></Card> : null}
            <Card>
              <div className="os-entity-head" style={{ marginBottom: 12 }}>
                <div className="os-entity-title">{settings.status}</div>
                <Badge tone={settings.enabled ? 'success' : 'default'}>{settings.enabled ? 'Enabled' : 'Disabled'}</Badge>
              </div>
              <div className="os-entity-copy">{settings.route}</div>
              <div className="os-entity-copy" style={{ marginTop: 8 }}>
                Updated: {settings.updatedAt ? new Date(settings.updatedAt).toLocaleString() : 'Not changed'}
              </div>
            </Card>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Affected execution types</div>
              <div className="os-drawer-stack">
                {settings.affectedExecutionTypes.map(item => <div key={item} className="os-entity-copy">{item}</div>)}
              </div>
            </Card>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Bypasses FFP temp</div>
              <div className="os-drawer-stack">
                {settings.bypassedExecutionTypes.map(item => <div key={item} className="os-entity-copy">{item}</div>)}
              </div>
            </Card>
          </div>
        )}
      </WorkspaceShell>
    </div>
  );
}
