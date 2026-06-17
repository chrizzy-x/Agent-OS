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

const TAB_KEYS = ['overview', 'chats', 'files', 'apps', 'skills', 'workflows', 'subagents', 'memory', 'secrets', 'mcp', 'logs'];

function title(value: string): string {
  return value.replace(/^\w/, char => char.toUpperCase());
}

function labelFor(item: Record<string, unknown>): string {
  return String(item.name ?? item.title ?? item.path ?? item.key ?? item.id ?? 'Item');
}

function descriptionFor(item: Record<string, unknown>): string {
  return String(item.description ?? item.summary ?? item.status ?? item.category ?? item.visibility ?? '');
}

function hrefFor(tab: string, item: Record<string, unknown>): string {
  if (tab === 'chats') return `/studio?session=${encodeURIComponent(String(item.id))}`;
  if (tab === 'files') return `/files`;
  if (tab === 'apps') return `/apps`;
  if (tab === 'skills') {
    const skill = item.skill && typeof item.skill === 'object' ? item.skill as Record<string, unknown> : item;
    return `/skills/${String(skill.slug ?? skill.id ?? '')}`;
  }
  if (tab === 'workflows') return `/workflows/${String(item.id)}`;
  if (tab === 'subagents') return `/agents/${String(item.id)}`;
  if (tab === 'memory') return '/memory';
  if (tab === 'secrets') return '/vault';
  if (tab === 'mcp') return '/mcp';
  if (tab === 'logs') return '/search';
  return '/projects';
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

  const rows = useMemo(() => {
    const value = payload?.tabs?.[tab];
    return Array.isArray(value) ? value : [];
  }, [payload?.tabs, tab]);

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
              subtitle={payload.project.description ?? 'Project-owned chats, files, apps, skills, workflows, subagents, memory, secrets, and MCP.'}
              actions={(
                <>
                  <Button href={`/studio?project=${encodeURIComponent(payload.project.id)}`} variant="secondary">Open in Studio</Button>
                  <Button href="/library" variant="secondary">Library</Button>
                </>
              )}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
              {TAB_KEYS.filter(key => key !== 'overview').map(key => (
                <Card key={key} style={{ padding: 12 }}>
                  <div className="os-entity-meta">{title(key)}</div>
                  <div className="os-metric-value">{payload.summary[key] ?? 0}</div>
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
            ) : rows.length === 0 ? (
              <EmptyState title={`No ${tab}`} body={`This project has no ${tab} yet.`} />
            ) : (
              <DataTable
                columns={['Name', 'Detail', '']}
                rows={rows.map(item => {
                  const skill = item.skill && typeof item.skill === 'object' ? item.skill as Record<string, unknown> : item;
                  return [
                    labelFor(skill),
                    descriptionFor(skill),
                    <Link key={`${tab}-${String(item.id)}-open`} href={hrefFor(tab, item)} className="btn-ghost">Open</Link>,
                  ];
                })}
              />
            )}
          </>
        )}
      </WorkspaceShell>
    </div>
  );
}
