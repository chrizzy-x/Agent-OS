'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import { fetchBrowserSession, fetchWithBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import WorkspaceShell from '@/components/os/workspace-shell';
import {
  Badge,
  Button,
  Card,
  ConfirmationDialog,
  DataTable,
  EmptyState,
  LoadingState,
  PageHeader,
  SearchBar,
} from '@/components/os/ui';

type InstalledSkill = {
  id: string;
  installed_at: string;
  status?: 'active' | 'disabled' | 'removed';
  permissions_approved?: string[];
  skill: {
    id: string;
    name: string;
    slug: string;
    category: string;
    description: string;
    verified?: boolean;
    rating?: number;
    total_calls?: number;
    permissions_required?: string[];
  } | null;
};

export default function SkillsPage() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState('');
  const [pendingRemove, setPendingRemove] = useState<InstalledSkill | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const currentSession = await fetchBrowserSession().catch(() => null);
      setSession(currentSession);
      if (!currentSession) {
        setInstalled([]);
        return;
      }
      const installedRes = await fetch('/api/skills/installed', { cache: 'no-store' });
      const installedData = await installedRes.json();
      setInstalled(installedData.installed_skills ?? []);
    } catch {
      setInstalled([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredInstalled = useMemo(
    () => installed.filter(entry => {
      const skill = entry.skill;
      return skill && (!search || `${skill.name} ${skill.description} ${skill.category}`.toLowerCase().includes(search.toLowerCase()));
    }),
    [installed, search],
  );

  async function updateSkill(entry: InstalledSkill, status: 'active' | 'disabled' | 'removed') {
    if (!entry.skill) return;
    setWorking(`${status}:${entry.skill.slug}`);
    setMessage('');
    try {
      const permissions = status === 'active'
        ? entry.permissions_approved ?? entry.skill.permissions_required ?? []
        : [];
      const { response } = await fetchWithBrowserSession(`/api/skills/${entry.skill.slug}/installation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, permissionsApproved: permissions }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload.error ?? payload.message ?? 'Skill update failed.');
        return;
      }
      setMessage(status === 'active'
        ? `${entry.skill.name} enabled.`
        : status === 'disabled'
          ? `${entry.skill.name} disabled.`
          : `${entry.skill.name} removed.`);
      setPendingRemove(null);
      await load();
    } finally {
      setWorking('');
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/skills" />
      <WorkspaceShell
        activePath="/skills"
        aside={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Summary</div>
            <div className="os-drawer-stack">
              <div className="os-entity-copy">Installed skills: {installed.length}</div>
              <Button href="/skillstore" variant="secondary">Browse Skills</Button>
            </div>
          </Card>
        )}
      >
        <PageHeader
          eyebrow="Skills"
          title="Installed skills"
          subtitle="Configure, enable, disable, or remove skills already installed in this workspace."
          actions={session?.capabilities?.includes('create_skill') ? <Button href="/developer" variant="secondary">Open Developer Console</Button> : undefined}
        />

        <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search installed skills" />
        {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}

        {loading ? <LoadingState label="Loading skills" /> : !session ? (
          <EmptyState title="Sign in required" body="Sign in to manage installed skills." action={<Button href="/signin">Sign in</Button>} />
        ) : filteredInstalled.length === 0 ? (
          <EmptyState title="No installed skills" body="Use the Skill Store to install focused capabilities into this workspace." action={<Button href="/skillstore">Open Skill Store</Button>} />
        ) : (
          <Card>
            <div className="os-entity-head" style={{ marginBottom: 12 }}>
              <div className="os-entity-title">Installed</div>
              <Badge tone="accent">{filteredInstalled.length}</Badge>
            </div>
            <DataTable
              columns={['Skill', 'Category', 'Installed', 'Status', 'Actions']}
              rows={filteredInstalled.filter(entry => entry.skill).map(entry => [
                <div key={`${entry.id}-skill`}>
                  <div className="os-entity-title">{entry.skill?.name}</div>
                  <div className="os-entity-copy">{entry.skill?.description}</div>
                </div>,
                entry.skill?.category ?? 'Skill',
                new Date(entry.installed_at).toLocaleDateString(),
                entry.status === 'disabled'
                  ? <Badge key={`${entry.id}-disabled`} tone="warning">Disabled</Badge>
                  : entry.skill?.verified === true
                    ? <Badge key={`${entry.id}-verified`} tone="success">Verified</Badge>
                    : <Badge key={`${entry.id}-installed`} tone="default">Installed</Badge>,
                <div key={`${entry.id}-actions`} className="os-inline-actions">
                  <Button href={`/skills/${entry.skill?.slug}`} variant="secondary">Configure</Button>
                  {entry.status === 'disabled'
                    ? <Button variant="secondary" onClick={() => void updateSkill(entry, 'active')} loading={working === `active:${entry.skill?.slug}`}>Enable</Button>
                    : <Button variant="secondary" onClick={() => void updateSkill(entry, 'disabled')} loading={working === `disabled:${entry.skill?.slug}`}>Disable</Button>}
                  <Button variant="danger" onClick={() => setPendingRemove(entry)}>Remove</Button>
                </div>,
              ])}
            />
          </Card>
        )}
      </WorkspaceShell>
      <ConfirmationDialog
        open={Boolean(pendingRemove)}
        title="Remove skill"
        body={`Remove ${pendingRemove?.skill?.name ?? 'this skill'} from this workspace?`}
        confirmLabel="Remove"
        busy={Boolean(pendingRemove?.skill && working === `removed:${pendingRemove.skill.slug}`)}
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => pendingRemove ? void updateSkill(pendingRemove, 'removed') : undefined}
      />
    </div>
  );
}
