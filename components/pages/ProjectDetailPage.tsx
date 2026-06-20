'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { Badge, Button, Card, DataTable, EmptyState, LoadingState, PageHeader, Tabs } from '@/components/os/ui';

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  workspaceId: string;
  updatedAt: string;
};

type ProjectPayload = {
  project: Project;
  tabs: Record<string, Array<Record<string, unknown>> | Record<string, unknown>>;
  summary: Record<string, number>;
};

const TAB_KEYS = ['overview', 'assets', 'workflows', 'memory', 'files', 'settings'];

function title(value: string) {
  return value.replace(/^\w/, char => char.toUpperCase());
}

function labelFor(item: Record<string, unknown>) {
  const skill = item.skill && typeof item.skill === 'object' ? item.skill as Record<string, unknown> : item;
  const app = item.app && typeof item.app === 'object' ? item.app as Record<string, unknown> : skill;
  return String(app.name ?? app.title ?? app.path ?? app.key ?? app.id ?? 'Item');
}

function descriptionFor(item: Record<string, unknown>) {
  const skill = item.skill && typeof item.skill === 'object' ? item.skill as Record<string, unknown> : item;
  const app = item.app && typeof item.app === 'object' ? item.app as Record<string, unknown> : skill;
  return String(app.description ?? app.summary ?? app.status ?? app.category ?? app.visibility ?? '');
}

function hrefFor(tab: string, item: Record<string, unknown>) {
  if (tab === 'files') return '/library?section=downloads';
  if (tab === 'workflows') return `/workflows/${String(item.id)}`;
  if (tab === 'memory') return '/library?section=memory';
  return '/library';
}

export default function ProjectDetailPage({ projectId }: { projectId: string }) {
  const [payload, setPayload] = useState<ProjectPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { cache: 'no-store' });
      const data = await response.json();
      setPayload(response.ok ? data : null);
    } catch {
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const assets = useMemo(() => {
    const tabs = payload?.tabs ?? {};
    return {
      apps: Array.isArray(tabs.apps) ? tabs.apps : [],
      skills: Array.isArray(tabs.skills) ? tabs.skills : [],
      subagents: Array.isArray(tabs.subagents) ? tabs.subagents : [],
    };
  }, [payload?.tabs]);
  const rows = useMemo(() => {
    const source = tab === 'assets' ? [] : payload?.tabs?.[tab];
    return Array.isArray(source) ? source : [];
  }, [payload?.tabs, tab]);
  const assetSections = useMemo<Array<{ label: string; list: Record<string, unknown>[]; href: string }>>(() => [
    { label: 'Apps', list: assets.apps, href: '/library?section=apps' },
    { label: 'Skills', list: assets.skills, href: '/library?section=skills' },
    { label: 'Subagents', list: assets.subagents, href: '/library?section=subagents' },
  ], [assets.apps, assets.skills, assets.subagents]);

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/projects" />
      <WorkspaceShell activePath="/projects">
        {loading ? <LoadingState label="Loading project" /> : !payload ? (
          <EmptyState title="Project unavailable" body="This project could not be loaded." action={<Button href="/projects">Projects</Button>} />
        ) : (
          <>
            <PageHeader
              eyebrow="Project"
              title={payload.project.name}
              subtitle={payload.project.description ?? 'Project-owned context, connected assets, workflows, memory, and files.'}
              actions={(
                <>
                  <Button href={`/studio?project=${encodeURIComponent(payload.project.id)}`} variant="secondary">Open in Studio</Button>
                  <Button href="/library" variant="secondary">Library</Button>
                </>
              )}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
              {[
                ['Assets', assets.apps.length + assets.skills.length + assets.subagents.length],
                ['Workflows', payload.summary.workflows ?? 0],
                ['Memory', payload.summary.memory ?? 0],
                ['Files', payload.summary.files ?? 0],
              ].map(([label, value]) => (
                <Card key={String(label)} style={{ padding: 12 }}>
                  <div className="os-entity-meta">{label}</div>
                  <div className="os-metric-value">{value}</div>
                </Card>
              ))}
            </div>
            <Tabs tabs={TAB_KEYS.map(key => ({ key, label: title(key) }))} active={tab} onChange={setTab} />
            {tab === 'overview' ? (
              <Card>
                <div className="os-entity-head">
                  <div>
                    <div className="os-entity-title">{payload.project.name}</div>
                    <div className="os-entity-copy">{String((payload.tabs.overview as Record<string, unknown>)?.summary ?? 'No activity summary yet.')}</div>
                  </div>
                  <Badge tone={payload.project.status === 'active' ? 'success' : 'warning'}>{payload.project.status}</Badge>
                </div>
              </Card>
            ) : tab === 'assets' ? (
              <div style={{ display: 'grid', gap: 14 }}>
                {assetSections.map(({ label, list, href }) => (
                  <Card key={label}>
                    <div className="os-entity-head" style={{ marginBottom: 12 }}>
                      <div>
                        <div className="os-entity-title">{label}</div>
                        <div className="os-entity-copy">Connected Assets</div>
                      </div>
                      <Button href={String(href)} variant="secondary">Open Library</Button>
                    </div>
                    {list.length === 0 ? (
                      <div className="os-empty-body">No connected {String(label).toLowerCase()}.</div>
                    ) : (
                      <div className="library-card-grid">
                        {list.map(item => (
                          <Card key={`${label}-${String(item.id ?? labelFor(item))}`} style={{ padding: 12 }}>
                            <div className="os-entity-title">{labelFor(item)}</div>
                            <div className="os-entity-copy">{descriptionFor(item)}</div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            ) : tab === 'settings' ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 10 }}>Project Settings</div>
                <div className="os-entity-copy">Workspace: {payload.project.workspaceId}</div>
                <div className="os-entity-copy">Status: {payload.project.status}</div>
                <div className="os-entity-copy">Last activity: {new Date(payload.project.updatedAt).toLocaleString()}</div>
              </Card>
            ) : rows.length === 0 ? (
              <EmptyState title={`No ${tab}`} body={`This project has no ${tab} yet.`} />
            ) : (
              <DataTable
                columns={['Name', 'Detail', '']}
                rows={rows.map(item => [
                  labelFor(item),
                  descriptionFor(item),
                  <Link key={`${tab}-${String(item.id)}-open`} href={hrefFor(tab, item)} className="btn-ghost">Open</Link>,
                ])}
              />
            )}
          </>
        )}
      </WorkspaceShell>
    </div>
  );
}
