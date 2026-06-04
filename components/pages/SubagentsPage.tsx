'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import {
  AgentCard,
  Button,
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
};

type SubagentsPageProps = {
  activePath?: string;
  basePath?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  listLabel?: string;
};

export default function SubagentsPage({
  activePath = '/agents',
  basePath = '/agents',
  eyebrow = 'Agents',
  title = 'Agents',
  subtitle = 'Create focused private agents for research, operations, testing, and vault-aware runtime work.',
  listLabel = 'Agents',
}: SubagentsPageProps) {
  const [loading, setLoading] = useState(true);
  const [subagents, setSubagents] = useState<Subagent[]>([]);
  const [draft, setDraft] = useState({ workspaceId: '', name: '', description: '', instructions: '' });
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subagentsRes, workspacesRes] = await Promise.all([
        fetch('/api/subagents', { cache: 'no-store' }),
        fetch('/api/workspaces', { cache: 'no-store' }),
      ]);
      const subagentsData = await subagentsRes.json();
      const workspacesData = await workspacesRes.json();
      setSubagents(subagentsData.subagents ?? []);
      setDraft(current => ({ ...current, workspaceId: current.workspaceId || workspacesData.workspaces?.[0]?.id || '' }));
    } catch {
      setSubagents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createSubagent() {
    const response = await fetch('/api/subagents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const payload = await response.json();
    setMessage(response.ok ? 'Subagent created' : payload.error ?? 'Create failed');
    if (response.ok) {
      setDraft(current => ({ ...current, name: '', description: '', instructions: '' }));
      await load();
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath={activePath} />
      <WorkspaceShell activePath="/agents">
        <PageHeader
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          actions={<Button onClick={() => void createSubagent()}>Create subagent</Button>}
        />

        <div style={{ display: 'grid', gap: 12 }}>
          <Input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="Agent name" />
          <Input value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} placeholder="Description" />
          <Textarea value={draft.instructions} onChange={event => setDraft(current => ({ ...current, instructions: event.target.value }))} placeholder="Instructions" />
        </div>

        {loading ? <LoadingState label="Loading subagents" /> : subagents.length === 0 ? (
          <EmptyState title="No private agents yet" body="Create a focused subagent for research, operations, or testing." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {subagents.map(subagent => (
              <AgentCard
                key={subagent.id}
                title={subagent.name}
                description={subagent.description ?? 'Private agent'}
                status={subagent.status}
                footer={<Link href={`${basePath}/${subagent.id}`} className="btn-primary">Open</Link>}
              />
            ))}
          </div>
        )}
        {message ? <div className="os-entity-copy">{message}</div> : null}
      </WorkspaceShell>
    </div>
  );
}
