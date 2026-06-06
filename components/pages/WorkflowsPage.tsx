'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { useRouteDrawer } from '@/components/os/drawer-state';
import { Drawer } from '@/components/os/overlays';
import WorkspaceShell from '@/components/os/workspace-shell';
import { summarizeValue, summarizeWorkflowRun } from '@/src/ui/presenters';
import {
  ActivityFeed,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  SearchBar,
  SidebarNav,
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

type WorkflowDrawer = 'workflow-spec' | 'workflow-runtime';

export default function WorkflowsPage({ selectedId }: { selectedId?: string }) {
  const router = useRouter();
  const drawer = useRouteDrawer<WorkflowDrawer>();
  const [loading, setLoading] = useState(true);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeId, setActiveId] = useState(selectedId ?? '');
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
      <Nav activePath="/workflows" />
      <WorkspaceShell
        activePath="/workflows"
        aside={(
          <>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Workflow list</div>
              <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search workflows" />
              <div style={{ marginTop: 12 }}>
                <SidebarNav items={filtered.map(item => ({
                  href: `/workflows/${item.id}`,
                  label: item.name,
                  subtitle: item.schedule || `${item.steps.length} steps`,
                  active: item.id === active?.id,
                  badge: item.last_error ? 'error' : item.status,
                }))} />
              </div>
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Recent runs</div>
              <ActivityFeed
                items={filtered.slice(0, 5).map(item => ({
                  id: item.id,
                  title: item.name,
                  subtitle: item.last_error || 'Ready',
                  status: item.last_error ? 'error' : item.status,
                }))}
              />
            </Card>
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
              <Button variant="secondary" onClick={() => drawer.openDrawer('workflow-spec')}>Spec</Button>
              <Button variant="secondary" onClick={() => drawer.openDrawer('workflow-runtime')}>Runtime</Button>
              <Button href={`/publishing/new${active ? `?workflowId=${active.id}` : ''}`}>Publish</Button>
            </>
          )}
        />

        {notice ? <Card><div className="os-entity-copy">{notice}</div></Card> : null}

        {loading ? <LoadingState label="Loading workflows" /> : !active ? (
          <EmptyState title="No workflows yet" body="Create your first workflow from Studio or the workflow API." />
        ) : (
          <>
            <WorkflowCard
              title={active.name}
              description={active.summary || 'No summary provided.'}
              status={active.last_error ? 'error' : active.status}
              footer={<div className="os-entity-copy">{active.steps.length} steps | {active.schedule || 'Manual'} | Version {active.version ?? 1}</div>}
            />

            <Card>
              <div className="os-entity-head" style={{ marginBottom: 12 }}>
                <div className="os-entity-title">Flow</div>
                <Button variant="secondary" onClick={() => drawer.openDrawer('workflow-spec')}>Developer view</Button>
              </div>
              {(active.steps ?? []).length === 0 ? (
                <div className="os-empty-body">No explicit steps stored for this workflow yet.</div>
              ) : (
                <ActivityFeed items={active.steps.map(step => ({
                  id: `${step.order}-${step.tool}`,
                  title: step.tool,
                  subtitle: step.description || summarizeValue(step.input),
                }))} />
              )}
            </Card>

            <Card>
              <div className="os-entity-head" style={{ marginBottom: 12 }}>
                <div className="os-entity-title">Latest run</div>
                <Button variant="secondary" onClick={() => drawer.openDrawer('workflow-runtime')}>Runtime details</Button>
              </div>
              <div className="os-entity-copy">{summarizeWorkflowRun(active.last_result ?? { status: active.status, error: active.last_error })}</div>
              {active.last_error ? <div className="os-entity-copy" style={{ marginTop: 12 }}>Last error: {active.last_error}</div> : null}
            </Card>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Settings</div>
              <div className="os-entity-copy">Schedule: {active.schedule || 'Manual'}</div>
              <div className="os-entity-copy">Visibility is managed during publishing.</div>
            </Card>
          </>
        )}
      </WorkspaceShell>

      <Drawer
        open={Boolean(drawer.current)}
        onClose={drawer.closeDrawer}
        title={drawer.current?.id === 'workflow-spec' ? 'Workflow spec' : 'Workflow runtime'}
        description="Advanced workflow details"
      >
        {!active ? <EmptyState title="Workflow unavailable" body="Select a workflow to inspect." /> : drawer.current?.id === 'workflow-spec' ? (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Workflow structure</div>
              <div className="os-entity-copy">Nodes: {Array.isArray(active.graph_state?.nodes) ? active.graph_state?.nodes.length : active.steps.length}</div>
              <div className="os-entity-copy">Edges: {Array.isArray(active.graph_state?.edges) ? active.graph_state?.edges.length : 0}</div>
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Workflow summary</div>
              <div className="os-entity-copy">{active.summary || 'No workflow summary was saved yet.'}</div>
              <div className="os-entity-copy" style={{ marginTop: 12 }}>Developer payloads are available through runtime logs only.</div>
            </Card>
          </div>
        ) : (
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Latest run summary</div>
            <div className="os-entity-copy">{summarizeWorkflowRun(active.last_result ?? { status: active.status, error: active.last_error })}</div>
          </Card>
        )}
      </Drawer>
    </div>
  );
}
