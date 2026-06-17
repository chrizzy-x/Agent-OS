'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import WorkspaceShell from '@/components/os/workspace-shell';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  LoadingState,
  PageHeader,
  SearchBar,
} from '@/components/os/ui';

type InstalledSkill = {
  id: string;
  installed_at: string;
  skill: {
    id: string;
    name: string;
    slug: string;
    category: string;
    description: string;
    verified?: boolean;
    rating?: number;
    total_calls?: number;
  } | null;
};

type PublishedSkill = {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  verified?: boolean;
  visibility?: 'private' | 'workspace' | 'public';
};

export default function SkillsPage() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [published, setPublished] = useState<PublishedSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const currentSession = await fetchBrowserSession().catch(() => null);
      setSession(currentSession);
      if (!currentSession) {
        setInstalled([]);
        setPublished([]);
        return;
      }
      const [installedRes, publishedRes] = await Promise.all([
        fetch('/api/skills/installed', { cache: 'no-store' }),
        fetch('/api/skills?mine=1&sort=recent&limit=20', { cache: 'no-store' }),
      ]);
      const installedData = await installedRes.json();
      const publishedData = await publishedRes.json();
      setInstalled(installedData.installed_skills ?? []);
      setPublished(publishedData.skills ?? []);
    } catch {
      setInstalled([]);
      setPublished([]);
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
  const filteredPublished = useMemo(
    () => published.filter(skill => !search || `${skill.name} ${skill.description} ${skill.category}`.toLowerCase().includes(search.toLowerCase())),
    [published, search],
  );

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/skills/installed" />
      <WorkspaceShell
        activePath="/skills/installed"
        aside={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Summary</div>
            <div className="os-drawer-stack">
              <div className="os-entity-copy">Installed skills: {installed.length}</div>
              <div className="os-entity-copy">Published by you: {published.length}</div>
              <Button href="/skills" variant="secondary">Browse Skills</Button>
            </div>
          </Card>
        )}
      >
        <PageHeader
          eyebrow="Skills"
          title="Installed and owned skills"
          subtitle="Manage the skills already in your workspace, then use the Skill Store for discovery and installation."
          actions={session?.capabilities?.includes('create_skill') ? <Button href="/developer" variant="secondary">Open Developer Console</Button> : undefined}
        />

        <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search installed and owned skills" />

        {loading ? <LoadingState label="Loading skills" /> : !session ? (
          <EmptyState title="Sign in required" body="Sign in to manage installed skills." action={<Button href="/signin">Sign in</Button>} />
        ) : (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-entity-head" style={{ marginBottom: 12 }}>
                <div className="os-entity-title">Installed</div>
                <Badge tone="accent">{filteredInstalled.length}</Badge>
              </div>
              {filteredInstalled.length === 0 ? (
                <EmptyState title="No installed skills" body="Use the Skill Store to install focused capabilities into this workspace." action={<Button href="/skills">Open Skill Store</Button>} />
              ) : (
                <DataTable
                  columns={['Skill', 'Category', 'Installed', 'Status', '']}
                  rows={filteredInstalled.filter(entry => entry.skill).map(entry => [
                    <div key={`${entry.id}-skill`}>
                      <div className="os-entity-title">{entry.skill?.name}</div>
                      <div className="os-entity-copy">{entry.skill?.description}</div>
                    </div>,
                    entry.skill?.category ?? 'Skill',
                    new Date(entry.installed_at).toLocaleDateString(),
                    entry.skill?.verified === true ? <Badge key={`${entry.id}-verified`} tone="success">Verified</Badge> : <Badge key={`${entry.id}-installed`} tone="default">Installed</Badge>,
                    <Button key={`${entry.id}-open`} href={`/skills/${entry.skill?.slug}`} variant="secondary">Open</Button>,
                  ])}
                />
              )}
            </Card>

            <Card>
              <div className="os-entity-head" style={{ marginBottom: 12 }}>
                <div className="os-entity-title">Published by you</div>
                <Badge tone="default">{filteredPublished.length}</Badge>
              </div>
              {filteredPublished.length === 0 ? (
                <div className="os-empty-body">No published skills from this workspace yet.</div>
              ) : (
                <DataTable
                  columns={['Skill', 'Category', 'Visibility', '']}
                  rows={filteredPublished.map(skill => [
                    <div key={`${skill.id}-skill`}>
                      <div className="os-entity-title">{skill.name}</div>
                      <div className="os-entity-copy">{skill.description}</div>
                    </div>,
                    skill.category,
                    skill.visibility ?? 'private',
                    <Button key={`${skill.id}-open`} href={`/skills/${skill.slug}`} variant="secondary">Open</Button>,
                  ])}
                />
              )}
            </Card>
          </div>
        )}
      </WorkspaceShell>
    </div>
  );
}
