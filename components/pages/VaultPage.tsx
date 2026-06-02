'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import {
  AppShell,
  Button,
  Card,
  DataTable,
  EmptyState,
  Input,
  LoadingState,
  MetricCard,
  PageHeader,
  SearchBar,
  SecretCard,
  SidebarNav,
  SidebarSection,
} from '@/components/os/ui';

type Secret = {
  id: string;
  name: string;
  maskedValue: string;
  status: string;
  version: number;
  updatedAt: string;
};

type HistoryEntry = {
  id: string;
  action: string;
  createdAt: string;
};

export default function VaultPage() {
  const [loading, setLoading] = useState(true);
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState<Secret | null>(null);
  const [search, setSearch] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [vaultRes, historyRes] = await Promise.all([
        fetch(`/api/vault?search=${encodeURIComponent(search)}`, { cache: 'no-store' }),
        fetch('/api/vault/history', { cache: 'no-store' }),
      ]);
      const vaultData = await vaultRes.json();
      const historyData = await historyRes.json();
      const nextSecrets = vaultData.secrets ?? [];
      setSecrets(nextSecrets);
      setHistory(historyData.history ?? []);
      setSelected(current => nextSecrets.find((item: Secret) => item.id === current?.id) ?? nextSecrets[0] ?? null);
    } catch {
      setSecrets([]);
      setHistory([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => ({
    total: secrets.length,
    active: secrets.filter(item => item.status === 'active').length,
    revoked: secrets.filter(item => item.status === 'disabled').length,
    auditEvents: history.length,
  }), [history.length, secrets]);

  async function saveSecret() {
    const response = await fetch('/api/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: draftName, value: draftValue }),
    });
    const payload = await response.json();
    setMessage(response.ok ? 'Secret saved' : payload.error ?? 'Save failed');
    setDraftName('');
    setDraftValue('');
    await load();
  }

  async function updateSecret(action: 'rotate' | 'disable' | 'enable') {
    if (!selected) return;
    const response = await fetch('/api/vault', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secretId: selected.id, action, value: draftValue || undefined }),
    });
    const payload = await response.json();
    setMessage(response.ok ? `Secret ${action}d` : payload.error ?? 'Update failed');
    setDraftValue('');
    await load();
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/vault" />
      <AppShell
        sidebar={(
          <SidebarSection title="Vault">
            <SidebarNav
              items={[
                { href: '/vault', label: 'Secrets', active: true },
                { href: '/vault#history', label: 'Audit history' },
              ]}
            />
          </SidebarSection>
        )}
        aside={(
          <SidebarSection title="Secret details">
            {selected ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <SecretCard title={selected.name} maskedValue={selected.maskedValue} status={selected.status} />
                <div className="os-entity-copy">Updated {new Date(selected.updatedAt).toLocaleString()}</div>
                <div className="os-entity-copy">Version {selected.version}</div>
                <Button variant="secondary" onClick={() => void updateSecret('rotate')}>Rotate</Button>
                <Button variant="ghost" onClick={() => void updateSecret(selected.status === 'active' ? 'disable' : 'enable')}>
                  {selected.status === 'active' ? 'Revoke' : 'Restore'}
                </Button>
              </div>
            ) : <div className="os-empty-body">Select a secret.</div>}
          </SidebarSection>
        )}
      >
        <PageHeader
          eyebrow="Vault"
          title="Secrets and access"
          subtitle="Manage secrets, tokens, certificates, assignments, and audit history without exposing plaintext values."
          actions={<Button onClick={() => void saveSecret()}>New secret</Button>}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <MetricCard label="Total secrets" value={summary.total} />
          <MetricCard label="Active" value={summary.active} />
          <MetricCard label="Audit events" value={summary.auditEvents} />
          <MetricCard label="Revoked" value={summary.revoked} />
        </div>

        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', gap: 12 }}>
            <Input value={draftName} onChange={event => setDraftName(event.target.value.toUpperCase())} placeholder="SECRET_NAME" />
            <Input value={draftValue} onChange={event => setDraftValue(event.target.value)} placeholder="Secret value" type="password" />
            <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search" />
          </div>
        </Card>

        {loading ? <LoadingState label="Loading vault" /> : secrets.length === 0 ? (
          <EmptyState title="No secrets stored" body="Save your first secret to start assigning runtime access." />
        ) : (
          <Card>
            <DataTable
              columns={['Name', 'Masked value', 'Version', 'Last updated', 'Status', 'Actions']}
              rows={secrets.map(secret => [
                <button key={`${secret.id}-pick`} type="button" onClick={() => setSelected(secret)} style={{ background: 'transparent', border: 0, padding: 0, color: 'var(--text-primary)', cursor: 'pointer' }}>{secret.name}</button>,
                secret.maskedValue,
                `v${secret.version}`,
                new Date(secret.updatedAt).toLocaleString(),
                secret.status,
                <div key={`${secret.id}-actions`} style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn-ghost" onClick={() => setSelected(secret)}>Open</button>
                </div>,
              ])}
            />
          </Card>
        )}

        <div id="history">
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Audit trail</div>
            {history.length === 0 ? <div className="os-empty-body">No audit events yet.</div> : (
              <DataTable
                columns={['Action', 'Timestamp']}
                rows={history.slice(0, 12).map(item => [item.action, new Date(item.createdAt).toLocaleString()])}
              />
            )}
          </Card>
        </div>
        {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}
      </AppShell>
    </div>
  );
}
