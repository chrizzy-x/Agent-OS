'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import {
  Button,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  Tabs,
  Textarea,
} from '@/components/os/ui';

type Subagent = {
  id: string;
  name: string;
  description: string | null;
  instructions: string;
  status: string;
  workspaceId: string;
  visibility: 'private' | 'workspace' | 'public';
  exposedCapabilities?: string[];
};

type SubagentsPageProps = {
  activePath?: string;
  basePath?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
};

export default function SubagentsPage({
  activePath = '/subagents',
  basePath = '/subagents',
  eyebrow = 'Subagents',
  title = 'Subagents',
  subtitle = 'Private workforce: roles, memory stance, skills, permissions, and operating status.',
}: SubagentsPageProps) {
  const shell = useApplicationShell();
  const [loading, setLoading] = useState(true);
  const [subagents, setSubagents] = useState<Subagent[]>([]);
  const [view, setView] = useState<'grid' | 'org'>('grid');
  const [draft, setDraft] = useState({
    workspaceId: '',
    name: '',
    description: '',
    instructions: '',
    visibility: 'private',
    exposedCapabilities: '',
  });
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subagentsRes, workspacesRes] = await Promise.all([
        fetch(`/api/subagents${shell.activeWorkspaceId ? `?workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' }),
        fetch('/api/workspaces', { cache: 'no-store' }),
      ]);
      const subagentsData = await subagentsRes.json();
      const workspacesData = await workspacesRes.json();
      setSubagents(subagentsData.subagents ?? []);
      setDraft(current => ({ ...current, workspaceId: shell.activeWorkspaceId || current.workspaceId || workspacesData.workspaces?.[0]?.id || '' }));
    } catch {
      setSubagents([]);
    } finally {
      setLoading(false);
    }
  }, [shell.activeWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createSubagent() {
    const response = await fetch('/api/subagents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...draft,
        exposedCapabilities: draft.exposedCapabilities
          .split(',')
          .map(item => item.trim())
          .filter(Boolean),
      }),
    });
    const payload = await response.json();
    setMessage(response.ok ? 'Subagent created' : payload.error ?? 'Create failed');
    if (response.ok) {
      setDraft(current => ({ ...current, name: '', description: '', instructions: '', exposedCapabilities: '' }));
      await load();
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath={activePath} />
      <WorkspaceShell activePath={activePath}>
        <PageHeader
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          actions={<Button onClick={() => void createSubagent()}>Create subagent</Button>}
        />

        <div style={{ display: 'grid', gap: 10 }}>
          <Input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="Subagent name" />
          <Input value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} placeholder="Description" />
          <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', gap: 10 }}>
            <select
              value={draft.visibility}
              onChange={event => setDraft(current => ({ ...current, visibility: event.target.value as 'private' | 'workspace' | 'public' }))}
              style={{ minHeight: 34, borderRadius: 7, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', color: 'inherit', padding: '0 10px' }}
            >
              <option value="private">private</option>
              <option value="workspace">workspace</option>
              <option value="public">public</option>
            </select>
            <Input
              value={draft.exposedCapabilities}
              onChange={event => setDraft(current => ({ ...current, exposedCapabilities: event.target.value }))}
              placeholder="Capabilities, comma-separated"
            />
          </div>
          <Textarea value={draft.instructions} onChange={event => setDraft(current => ({ ...current, instructions: event.target.value }))} placeholder="Instructions" />
          <label className="os-inline-actions">
            <input
              type="checkbox"
              checked={draft.visibility === 'private'}
              onChange={event => setDraft(current => ({ ...current, visibility: event.target.checked ? 'private' : 'workspace' }))}
            />
            Private Mode
          </label>
        </div>

        {loading ? <LoadingState label="Loading subagents" /> : subagents.length === 0 ? (
          <EmptyState title="No private subagents yet" body="Create a focused subagent for research, operations, or testing." />
        ) : (
          <div className="os-drawer-stack">
            <Tabs
              tabs={[
                { key: 'grid', label: 'Grid' },
                { key: 'org', label: 'Organization Chart' },
              ]}
              active={view}
              onChange={key => setView(key as 'grid' | 'org')}
            />
            {view === 'grid' ? (
              <div className="subagent-grid">
                {subagents.map(subagent => (
                  <article key={subagent.id} className="subagent-card">
                    <div className="os-inline-actions">
                      <div>
                        <div className="os-entity-title">{subagent.name}</div>
                        <div className="os-entity-copy">{subagent.description ?? 'Private subagent'}</div>
                      </div>
                      <span className="os-status-pill">{subagent.status}</span>
                    </div>
                    <dl className="subagent-facts">
                      <div><dt>Role</dt><dd>{subagent.visibility} workforce agent</dd></div>
                      <div><dt>Memory</dt><dd>Workspace scoped</dd></div>
                      <div><dt>Skills</dt><dd>{subagent.exposedCapabilities?.join(', ') || 'None assigned'}</dd></div>
                      <div><dt>Permissions</dt><dd>{subagent.visibility === 'private' ? 'Private only' : 'Workspace visible'}</dd></div>
                    </dl>
                    <Link href={`${basePath}/${subagent.id}`} className="btn-ghost">Open</Link>
                  </article>
                ))}
              </div>
            ) : (
              <div className="subagent-org">
                <div className="subagent-org-root">Workspace Lead</div>
                <div className="subagent-org-grid">
                  {subagents.map(subagent => (
                    <Link key={subagent.id} href={`${basePath}/${subagent.id}`} className="subagent-org-node">
                      <strong>{subagent.name}</strong>
                      <span>{subagent.description ?? subagent.visibility}</span>
                      <small>{subagent.status}</small>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {message ? <div className="os-entity-copy">{message}</div> : null}
      </WorkspaceShell>
    </div>
  );
}
