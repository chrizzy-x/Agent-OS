'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import {
  Button,
  DataTable,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
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
  subtitle = 'Create focused private agents for research, operations, testing, and vault-aware runtime work.',
}: SubagentsPageProps) {
  const shell = useApplicationShell();
  const [loading, setLoading] = useState(true);
  const [subagents, setSubagents] = useState<Subagent[]>([]);
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
          <DataTable
            columns={['Subagent', 'Visibility', 'Status', 'Capabilities', '']}
            rows={subagents.map(subagent => [
              <div key={`${subagent.id}-name`}>
                <div className="os-entity-title">{subagent.name}</div>
                <div className="os-entity-copy">{subagent.description ?? 'Private subagent'}</div>
              </div>,
              subagent.visibility,
              subagent.status,
              subagent.exposedCapabilities?.join(', ') || 'None',
              <Link key={`${subagent.id}-open`} href={`${basePath}/${subagent.id}`} className="btn-ghost">Open</Link>,
            ])}
          />
        )}
        {message ? <div className="os-entity-copy">{message}</div> : null}
      </WorkspaceShell>
    </div>
  );
}
