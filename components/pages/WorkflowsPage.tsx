'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import {
  ActivityFeed,
  AppShell,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  SearchBar,
  SidebarNav,
  SidebarSection,
  Tabs,
  Textarea,
  WorkflowCard,
} from '@/components/os/ui';

type Workflow = {
  id: string;
  name: string;
  summary: string | null;
  steps: Array<{ order: number; tool: string; description: string; input: Record<string, unknown> }>;
  graph_state?: Record<string, unknown>;
  code_state?: string | null;
  canonical_doc?: Record<string, unknown>;
  status: string;
  schedule: string | null;
  last_result?: unknown;
  last_error?: string | null;
  version?: number;
};

const TABS = ['Chat', 'Visual', 'Code', 'Runs', 'Settings'];

export default function WorkflowsPage({ selectedId }: { selectedId?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeId, setActiveId] = useState(selectedId ?? '');
  const [tab, setTab] = useState('Chat');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/workflows', { cache: 'no-store' });
      const data = await res.json();
      const rows = data.workflows ?? [];
      setWorkflows(rows);
      if (!activeId && rows.length > 0) {
        setActiveId(selectedId ?? rows[0].id);
      }
    } catch {
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  }, [activeId, selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => workflows.filter(item => !search || `${item.name} ${item.summary ?? ''}`.toLowerCase().includes(search.toLowerCase())),
    [search, workflows],
  );
  const active = useMemo(
    () => filtered.find(item => item.id === activeId) ?? filtered[0] ?? null,
    [activeId, filtered],
  );

  async function runWorkflow() {
    if (!active) return;
    setWorking(true);
    setNotice('');
    try {
      const res = await fetch('/api/agent/workflows/run-due', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: active.id, force: true }),
      });
      const data = await res.json();
      setNotice(res.ok ? `Run started (${data.ran ?? 0}).` : data.error ?? 'Run failed');
      await load();
    } catch {
      setNotice('Run failed');
    } finally {
      setWorking(false);
    }
  }

  async function toggleStatus() {
    if (!active) return;
    setWorking(true);
    setNotice('');
    try {
      const nextStatus = active.status === 'paused' ? 'active' : 'paused';
      const res = await fetch(`/api/agent/workflows/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      setNotice(res.ok ? `Workflow ${nextStatus}.` : data.error ?? 'Status update failed');
      await load();
    } catch {
      setNotice('Status update failed');
    } finally {
      setWorking(false);
    }
  }

  function validateWorkflow() {
    if (!active) return;
    const issues: string[] = [];
    if ((active.steps?.length ?? 0) === 0 && !active.code_state && !active.graph_state) {
      issues.push('No steps, graph, or code found.');
    }
    if ((active.steps ?? []).some(step => !step.tool)) {
      issues.push('One or more steps are missing a tool.');
    }
    if (!active.summary?.trim()) {
      issues.push('Summary is empty.');
    }
    if (active.last_error) {
      issues.push(`Last run failed: ${active.last_error}`);
    }
    setNotice(issues.length === 0 ? 'Validation passed. Workflow has runnable structure and metadata.' : `Validation failed: ${issues.join(' ')}`);
  }

  function sendToStudio() {
    if (!active) return;
    const prompt = `Review workflow "${active.name}" and improve reliability, validation, scheduling, and run safety. Current summary: ${active.summary || 'None'}. Current steps: ${(active.steps ?? []).map(step => step.tool).join(', ') || 'None'}.`;
    router.push(`/studio?prompt=${encodeURIComponent(prompt)}`);
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/projects" />
      <AppShell
        activePath="/workflows"
        sidebar={(
          <>
            <SidebarSection title="Workflows">
              <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search workflows" />
              <SidebarNav items={filtered.map(workflow => ({
                href: `/workflows/${workflow.id}`,
                label: workflow.name,
                subtitle: workflow.schedule || workflow.status,
                active: active?.id === workflow.id,
              }))} />
            </SidebarSection>
            <SidebarSection title="Node library">
              <SidebarNav items={[
                { label: 'Trigger' },
                { label: 'Action' },
                { label: 'Condition' },
                { label: 'Transform' },
                { label: 'Delay' },
                { label: 'Webhook' },
                { label: 'Sub-workflow' },
              ]} />
            </SidebarSection>
          </>
        )}
        aside={(
          <>
            <SidebarSection title="Inspector">
              {active ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="os-entity-title">Selected workflow</div>
                  <div className="os-entity-copy">{active.summary || 'No summary provided.'}</div>
                  <div className="os-entity-copy">{active.steps.length} steps</div>
                  <div className="os-entity-copy">{active.schedule || 'No schedule'}</div>
                  <div className="os-entity-copy">Status: {active.last_error ? 'error' : active.status}</div>
                </div>
              ) : <div className="os-empty-body">Select a workflow.</div>}
            </SidebarSection>
            <SidebarSection title="Recent runs">
              <ActivityFeed
                items={filtered.slice(0, 5).map(item => ({
                  id: item.id,
                  title: item.name,
                  subtitle: item.last_error || 'Ready',
                  status: item.last_error ? 'error' : item.status,
                }))}
              />
            </SidebarSection>
          </>
        )}
      >
        <PageHeader
          eyebrow="Workflow builder"
          title={active?.name || 'Workflows'}
          subtitle={active?.summary || 'Build, run, schedule, and publish workflows.'}
          actions={(
            <>
              <Button variant="secondary" onClick={() => void runWorkflow()}>{working ? 'Working...' : 'Test Run'}</Button>
              {active ? <Button variant="secondary" onClick={() => void toggleStatus()}>{working ? 'Working...' : active.status === 'paused' ? 'Resume' : 'Pause'}</Button> : null}
              <Button variant="ghost" onClick={validateWorkflow}>Validate</Button>
              <Button variant="ghost" onClick={sendToStudio}>AI Assist</Button>
              <Button href={`/publishing/new${active ? `?workflowId=${active.id}` : ''}`}>Publish</Button>
            </>
          )}
        />

        {notice ? <Card><div className="os-entity-copy">{notice}</div></Card> : null}

        {loading ? <LoadingState label="Loading workflows" /> : !active ? (
          <EmptyState title="No workflows yet" body="Create your first workflow from Studio or the workflow API." />
        ) : (
          <>
            <Card>
              <Tabs tabs={TABS.map(item => ({ key: item, label: item }))} active={tab} onChange={setTab} />
            </Card>

            {tab === 'Chat' ? (
              <WorkflowCard
                title={active.name}
                description={active.summary || 'No summary provided.'}
                status={active.last_error ? 'error' : active.status}
                footer={<div className="os-entity-copy">{active.steps.length} steps | {active.schedule || 'Manual'}</div>}
              />
            ) : null}

            {tab === 'Visual' ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Graph</div>
                <pre className="os-code-block">{JSON.stringify(active.graph_state ?? { nodes: [], edges: [] }, null, 2)}</pre>
              </Card>
            ) : null}

            {tab === 'Code' ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Code</div>
                <Textarea readOnly value={active.code_state || JSON.stringify(active.canonical_doc ?? active.steps, null, 2)} />
              </Card>
            ) : null}

            {tab === 'Runs' ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Run history</div>
                <pre className="os-code-block">{JSON.stringify(active.last_result ?? { status: active.status, error: active.last_error }, null, 2)}</pre>
              </Card>
            ) : null}

            {tab === 'Settings' ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Workflow settings</div>
                <div className="os-entity-copy">Version {active.version ?? 1} | {active.schedule || 'No schedule'} | Visibility is selected in the publish wizard.</div>
              </Card>
            ) : null}
          </>
        )}
      </AppShell>
    </div>
  );
}
