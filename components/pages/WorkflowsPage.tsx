'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { useRouteDrawer } from '@/components/os/drawer-state';
import { Drawer } from '@/components/os/overlays';
import WorkspaceShell from '@/components/os/workspace-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import { fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSessionAuthState } from '@/src/auth/browser-session';
import { summarizeValue, summarizeWorkflowRun } from '@/src/ui/presenters';
import {
  ActivityFeed,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
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
  visibility?: 'private' | 'workspace' | 'public';
  schedule: string | null;
  task_id?: string | null;
  last_result?: unknown;
  last_error?: string | null;
  last_run_at?: string | null;
  version?: number;
};

type PublicWorkflow = {
  id: string;
  name: string;
  summary: string;
  status: string;
  visibility: 'public';
  schedule: string | null;
  version: number;
  stepCount: number;
  starred: boolean;
  forked: boolean;
  monetization: 'not_monetized';
  pricingLabel: string;
  requiresVaultConfiguration: boolean;
  privateContextRemoved: boolean;
  privacyNote: string;
};

type WorkflowDrawer = 'workflow-spec' | 'workflow-runtime';

type ExecutionStatus = 'QUEUED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

type ExecutionRecord = {
  id: string;
  title: string;
  status: ExecutionStatus | string;
  workflowId?: string | null;
  output?: unknown;
  error?: Record<string, unknown> | null;
  failure?: Record<string, unknown> | null;
  recoveryAction?: string | null;
  recoveryRequestedAt?: string | null;
  durationMs?: number | null;
  startedAt?: string | null;
  pausedAt?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ExecutionLogRecord = {
  id: string;
  executionId: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  message: string;
  data?: Record<string, unknown>;
  createdAt: string;
};

const ACTIVE_EXECUTION_STATUSES = new Set(['QUEUED', 'RUNNING', 'PAUSED']);
const RETRYABLE_EXECUTION_STATUSES = new Set(['FAILED', 'CANCELLED']);

function normalizeStatus(value: unknown): ExecutionStatus {
  const upper = String(value ?? 'QUEUED').toUpperCase();
  if (upper === 'RUNNING' || upper === 'PAUSED' || upper === 'COMPLETED' || upper === 'FAILED' || upper === 'CANCELLED') return upper;
  return 'QUEUED';
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleString();
}

function formatDuration(value?: number | null) {
  if (typeof value !== 'number') return 'No duration recorded';
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1)} sec`;
}

function scheduleIntervalMs(expression: string | null | undefined): number | null {
  if (!expression) return null;
  const everyMin = expression.match(/^\*\/([1-9]\d*)\s+\*\s+\*\s+\*\s+\*$/);
  if (everyMin) return Number(everyMin[1]) * 60 * 1000;
  const everyHour = expression.match(/^0\s+\*\/([1-9]\d*)\s+\*\s+\*\s+\*$/);
  if (everyHour) return Number(everyHour[1]) * 60 * 60 * 1000;
  if (/^0\s+\*\s+\*\s+\*\s+\*$/.test(expression) || expression === '@hourly') return 60 * 60 * 1000;
  if (/^0\s+0\s+\*\s+\*\s+\*$/.test(expression) || expression === '@daily' || expression === '@midnight') return 24 * 60 * 60 * 1000;
  return null;
}

function scheduleLabel(expression: string | null | undefined) {
  if (!expression) return 'Manual';
  const everyMin = expression.match(/^\*\/([1-9]\d*)\s+\*\s+\*\s+\*\s+\*$/);
  if (everyMin) return `Every ${everyMin[1]} minute${everyMin[1] === '1' ? '' : 's'}`;
  const everyHour = expression.match(/^0\s+\*\/([1-9]\d*)\s+\*\s+\*\s+\*$/);
  if (everyHour) return `Every ${everyHour[1]} hour${everyHour[1] === '1' ? '' : 's'}`;
  if (expression === '@hourly' || expression === '0 * * * *') return 'Hourly';
  if (expression === '@daily' || expression === '@midnight' || expression === '0 0 * * *') return 'Daily';
  return expression;
}

function nextRunLabel(workflow: Workflow) {
  if (!workflow.schedule) return 'Manual only';
  if (workflow.status === 'paused') return 'Paused until recurring is enabled';
  const interval = scheduleIntervalMs(workflow.schedule);
  if (!interval) return 'Schedule saved; backend cron support required';
  if (!workflow.last_run_at) return 'Due on next scheduler pass';
  const next = new Date(new Date(workflow.last_run_at).getTime() + interval);
  return Number.isNaN(next.getTime()) ? 'Due on next scheduler pass' : formatDateTime(next.toISOString());
}

function lifecycleCloseLabel(status: ExecutionStatus) {
  if (status === 'QUEUED') return 'Queued';
  if (status === 'RUNNING') return 'Running';
  if (status === 'PAUSED') return 'Paused';
  if (status === 'FAILED') return 'Failed';
  if (status === 'CANCELLED') return 'Cancelled';
  return 'Completed';
}

function readableFailure(execution?: ExecutionRecord | null, workflow?: Workflow | null) {
  const failure = execution?.failure ?? execution?.error;
  if (failure) return summarizeWorkflowRun(failure);
  if (workflow?.last_error) return workflow.last_error;
  return '';
}

export default function WorkflowsPage({ selectedId }: { selectedId?: string }) {
  const shell = useApplicationShell();
  const router = useRouter();
  const drawer = useRouteDrawer<WorkflowDrawer>();
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeId, setActiveId] = useState(selectedId ?? '');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [executionsLoading, setExecutionsLoading] = useState(false);
  const [selectedExecutionId, setSelectedExecutionId] = useState('');
  const [executionLogs, setExecutionLogs] = useState<ExecutionLogRecord[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState('');
  const [publicWorkflows, setPublicWorkflows] = useState<PublicWorkflow[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sessionState = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
      setAuthState(sessionState.state);
      if (!sessionState.session) {
        setWorkflows([]);
        setPublicWorkflows([]);
        return;
      }
      const { response, authState: nextAuthState } = await fetchWithBrowserSession(`/api/agent/workflows${shell.activeWorkspaceId ? `?workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' });
      setAuthState(nextAuthState);
      const data = await response.json();
      const rows = data.workflows ?? [];
      setWorkflows(rows);
      if (!activeId && rows.length > 0) {
        setActiveId(selectedId ?? rows[0].id);
      }
      setDiscoveryLoading(true);
      try {
        const { response: discoveryResponse } = await fetchWithBrowserSession('/api/agent/workflows?discover=public', { cache: 'no-store' });
        const discoveryData = await discoveryResponse.json();
        setPublicWorkflows(Array.isArray(discoveryData.workflows) ? discoveryData.workflows : []);
      } catch {
        setPublicWorkflows([]);
      } finally {
        setDiscoveryLoading(false);
      }
    } catch {
      setWorkflows([]);
      setPublicWorkflows([]);
    } finally {
      setLoading(false);
    }
  }, [activeId, selectedId, shell.activeWorkspaceId]);

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
  const selectedExecution = useMemo(
    () => executions.find(item => item.id === selectedExecutionId) ?? executions[0] ?? null,
    [executions, selectedExecutionId],
  );
  const latestExecution = executions[0] ?? null;
  const selectedStatus = normalizeStatus(selectedExecution?.status);
  const latestStatus = normalizeStatus(latestExecution?.status ?? active?.status);
  const canRetrySelected = Boolean(selectedExecution && RETRYABLE_EXECUTION_STATUSES.has(selectedStatus));
  const canCancelSelected = Boolean(selectedExecution && ACTIVE_EXECUTION_STATUSES.has(selectedStatus));
  const scheduleChanged = scheduleDraft.trim() !== (active?.schedule ?? '');

  const loadExecutions = useCallback(async (workflowId: string) => {
    setExecutionsLoading(true);
    try {
      const params = new URLSearchParams({ workflowId, sourceType: 'workflow', status: 'all', limit: '25' });
      if (shell.activeWorkspaceId) params.set('workspaceId', shell.activeWorkspaceId);
      const { response, authState: nextAuthState } = await fetchWithBrowserSession(`/api/executions?${params.toString()}`, { cache: 'no-store' });
      setAuthState(nextAuthState);
      const data = await response.json();
      const rows = Array.isArray(data.executions) ? data.executions : [];
      setExecutions(rows);
      setSelectedExecutionId(current => current && rows.some((item: ExecutionRecord) => item.id === current) ? current : rows[0]?.id ?? '');
    } catch {
      setExecutions([]);
      setSelectedExecutionId('');
    } finally {
      setExecutionsLoading(false);
    }
  }, [shell.activeWorkspaceId]);

  const loadExecutionLogs = useCallback(async (executionId: string) => {
    if (!executionId) {
      setExecutionLogs([]);
      return;
    }
    setLogsLoading(true);
    try {
      const { response, authState: nextAuthState } = await fetchWithBrowserSession(`/api/executions/${executionId}`, { cache: 'no-store' });
      setAuthState(nextAuthState);
      const data = await response.json();
      setExecutionLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      setExecutionLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active?.id || authState === 'signed_out' || authState === 'expired') {
      setExecutions([]);
      setSelectedExecutionId('');
      setExecutionLogs([]);
      return;
    }
    void loadExecutions(active.id);
  }, [active?.id, authState, loadExecutions]);

  useEffect(() => {
    void loadExecutionLogs(selectedExecution?.id ?? '');
  }, [loadExecutionLogs, selectedExecution?.id]);

  useEffect(() => {
    setScheduleDraft(active?.schedule ?? '');
  }, [active?.id, active?.schedule]);

  async function runWorkflow() {
    if (!active) return;
    setWorking(true);
    setNotice('');
    try {
      const { response: res } = await fetchWithBrowserSession('/api/agent/workflows/run-due', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: active.id, force: true }),
      });
      const data = await res.json();
      const executionId = typeof data.executionId === 'string' ? data.executionId : undefined;
      setNotice(res.ok ? `Run recorded${executionId ? ` as ${executionId}` : ''}.` : data.error ?? 'Run failed');
      await load();
      await loadExecutions(active.id);
      if (executionId) setSelectedExecutionId(executionId);
    } catch {
      setNotice('Run failed');
    } finally {
      setWorking(false);
    }
  }

  async function requestRunAction(execution: ExecutionRecord, action: 'retry' | 'cancel' | 'inspect') {
    setWorking(true);
    setNotice('');
    try {
      const { response: res } = await fetchWithBrowserSession(`/api/executions/${execution.id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setNotice(res.ok ? `Execution ${action} requested.` : data.error ?? `Execution ${action} failed`);
      if (active?.id) await loadExecutions(active.id);
      await loadExecutionLogs(execution.id);
    } catch {
      setNotice(`Execution ${action} failed`);
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
      const { response: res } = await fetchWithBrowserSession(`/api/agent/workflows/${active.id}`, {
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

  async function saveSchedule(nextSchedule = scheduleDraft) {
    if (!active) return;
    setWorking(true);
    setNotice('');
    const schedule = nextSchedule.trim();
    try {
      const { response: res } = await fetchWithBrowserSession(`/api/agent/workflows/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: schedule || null, status: schedule ? 'active' : active.status }),
      });
      const data = await res.json();
      setNotice(res.ok ? (schedule ? 'Recurring schedule saved.' : 'Recurring schedule removed.') : data.error ?? 'Schedule update failed');
      await load();
      if (active.id) await loadExecutions(active.id);
    } catch {
      setNotice('Schedule update failed');
    } finally {
      setWorking(false);
    }
  }

  async function toggleRecurring() {
    if (!active || !active.schedule) return;
    setWorking(true);
    setNotice('');
    const nextStatus = active.status === 'paused' ? 'active' : 'paused';
    try {
      const { response: res } = await fetchWithBrowserSession(`/api/agent/workflows/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      setNotice(res.ok ? (nextStatus === 'active' ? 'Recurring workflow enabled.' : 'Recurring workflow disabled.') : data.error ?? 'Recurring update failed');
      await load();
    } catch {
      setNotice('Recurring update failed');
    } finally {
      setWorking(false);
    }
  }

  async function requestDiscoveryAction(workflow: PublicWorkflow, action: 'star' | 'fork') {
    setWorking(true);
    setNotice('');
    try {
      const { response: res } = await fetchWithBrowserSession(`/api/agent/workflows/${workflow.id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? `${action} failed`);
        return;
      }
      if (action === 'star') {
        setPublicWorkflows(current => current.map(item => item.id === workflow.id ? { ...item, starred: true } : item));
        setNotice('Workflow starred into your Library. Workflows are shared, not monetized.');
        return;
      }
      const forkedId = typeof data.workflow?.id === 'string' ? data.workflow.id : '';
      setPublicWorkflows(current => current.map(item => item.id === workflow.id ? { ...item, forked: true } : item));
      setNotice('Workflow forked privately. Configure your own Vault secrets before running it.');
      await load();
      if (forkedId) {
        setActiveId(forkedId);
        router.push(`/workflows/${forkedId}`);
      }
    } catch {
      setNotice(`${action} failed`);
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

  function renderDiscovery() {
    return (
      <Card>
        <div className="os-entity-head" style={{ marginBottom: 12 }}>
          <div>
            <div className="os-entity-title">Public workflow discovery</div>
            <div className="os-entity-copy">Star or fork shared workflows. Workflows are not monetized assets.</div>
          </div>
          <Badge tone="default">not monetized</Badge>
        </div>
        {discoveryLoading ? (
          <div className="os-empty-body">Loading public workflows.</div>
        ) : publicWorkflows.length === 0 ? (
          <EmptyState title="No public workflows yet" body="Public workflow sharing is ready, but no discoverable workflows are available in this workspace." />
        ) : (
          <div className="os-feed">
            {publicWorkflows.map(workflow => (
              <div className="os-feed-item" key={workflow.id}>
                <div className="os-feed-head">
                  <strong>{workflow.name}</strong>
                  <Badge tone="success">public</Badge>
                </div>
                <div className="os-feed-subtitle">{workflow.summary}</div>
                <div className="os-entity-copy" style={{ marginTop: 8 }}>
                  {workflow.stepCount} steps | {scheduleLabel(workflow.schedule)} | {workflow.pricingLabel}
                </div>
                {workflow.requiresVaultConfiguration ? (
                  <div className="os-entity-copy" style={{ marginTop: 8 }}>Fork requires your own Vault secret configuration.</div>
                ) : null}
                {workflow.privateContextRemoved ? (
                  <div className="os-entity-copy" style={{ marginTop: 8 }}>Private project and workspace references are stripped on fork.</div>
                ) : null}
                <div className="os-inline-actions" style={{ marginTop: 12 }}>
                  <Button
                    variant="secondary"
                    onClick={() => void requestDiscoveryAction(workflow, 'star')}
                    disabled={working || workflow.starred}
                    disabledReason={working ? 'Another workflow action is running.' : 'This workflow is already starred in your Library.'}
                  >
                    {workflow.starred ? 'Starred' : 'Star'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void requestDiscoveryAction(workflow, 'fork')}
                    disabled={working || workflow.forked}
                    disabledReason={working ? 'Another workflow action is running.' : 'This workflow is already forked into your Library.'}
                  >
                    {workflow.forked ? 'Forked' : 'Fork privately'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    );
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
                  subtitle: item.schedule ? scheduleLabel(item.schedule) : `${item.steps.length} steps`,
                  active: item.id === active?.id,
                  badge: item.last_error ? 'error' : item.status,
                }))} />
              </div>
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Recent runs</div>
              {active && executions.length > 0 ? (
                <ActivityFeed
                  items={executions.slice(0, 5).map(item => ({
                    id: item.id,
                    title: item.title,
                    subtitle: formatDateTime(item.updatedAt),
                    status: normalizeStatus(item.status),
                  }))}
                />
              ) : (
                <div className="os-empty-body">{executionsLoading ? 'Loading runs.' : 'No workflow runs recorded yet.'}</div>
              )}
            </Card>
          </>
        )}
      >
        <PageHeader
          eyebrow="Workflows"
          title={active?.name || 'Workflows'}
          subtitle={active?.summary || 'Templates, my workflows, scheduled jobs, running jobs, failures, execution history, and public workflows.'}
          actions={active ? (
            <>
              <Button variant="secondary" onClick={() => void runWorkflow()} loading={working} loadingLabel="Working...">Manual Run</Button>
              <Button variant="secondary" onClick={() => void toggleStatus()}>{working ? 'Working...' : active.status === 'paused' ? 'Resume' : 'Pause'}</Button>
              <Button variant="ghost" onClick={validateWorkflow}>Validate</Button>
              <Button variant="ghost" onClick={sendToStudio}>Studio Assist</Button>
              <Button variant="secondary" onClick={() => drawer.openDrawer('workflow-spec')}>Spec</Button>
              <Button variant="secondary" onClick={() => drawer.openDrawer('workflow-runtime')}>Runtime</Button>
            </>
          ) : undefined}
        />

        {notice ? <Card><div className="os-entity-copy">{notice}</div></Card> : null}

        {loading ? <LoadingState label="Loading workflows" /> : authState === 'signed_out' || authState === 'expired' ? (
          <EmptyState title={authState === 'expired' ? 'Session expired' : 'Sign in required'} body="Sign in to manage workspace workflows." action={<Button href="/signin">{authState === 'expired' ? 'Sign in again' : 'Sign in'}</Button>} />
        ) : !active ? (
          <>
            <EmptyState title="No workflows yet" body="Create your first workflow from Studio or the workflow API." action={<Button href="/studio?mode=workflow">Open Workflow Builder</Button>} />
            {renderDiscovery()}
          </>
        ) : (
          <>
            <WorkflowCard
              title={active.name}
              description={active.summary || 'No summary provided.'}
              status={active.last_error ? 'error' : active.status}
              footer={<div className="os-entity-copy">{active.steps.length} steps | {scheduleLabel(active.schedule)} | Version {active.version ?? 1}</div>}
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
                <div className="os-inline-actions">
                  <Badge tone={latestStatus === 'FAILED' || active.last_error ? 'danger' : ACTIVE_EXECUTION_STATUSES.has(latestStatus) ? 'accent' : latestStatus === 'COMPLETED' ? 'success' : 'default'}>{latestStatus}</Badge>
                  <Button variant="secondary" onClick={() => drawer.openDrawer('workflow-runtime')}>Runtime details</Button>
                </div>
              </div>
              {executionsLoading ? (
                <div className="os-entity-copy">Loading execution history.</div>
              ) : latestExecution ? (
                <ActivityFeed
                  items={[
                    {
                      id: `${latestExecution.id}-started`,
                      title: 'Started',
                      subtitle: formatDateTime(latestExecution.startedAt ?? latestExecution.createdAt),
                      status: normalizeStatus(latestExecution.status),
                    },
                    {
                      id: `${latestExecution.id}-finished`,
                      title: lifecycleCloseLabel(normalizeStatus(latestExecution.status)),
                      subtitle: formatDateTime(latestExecution.completedAt ?? latestExecution.cancelledAt ?? latestExecution.updatedAt),
                      status: normalizeStatus(latestExecution.status),
                    },
                    {
                      id: `${latestExecution.id}-duration`,
                      title: 'Duration',
                      subtitle: formatDuration(latestExecution.durationMs),
                    },
                  ]}
                />
              ) : (
                <div className="os-empty-body">No run has been recorded for this workflow yet. Manual Run will create a tracked execution.</div>
              )}
              <div className="os-entity-copy" style={{ marginTop: 12 }}>{summarizeWorkflowRun(latestExecution?.output ?? active.last_result ?? { status: active.status, error: active.last_error })}</div>
              {readableFailure(latestExecution, active) ? <div className="os-entity-copy" style={{ marginTop: 12 }}>Failure: {readableFailure(latestExecution, active)}</div> : null}
            </Card>

            <Card>
              <div className="os-entity-head" style={{ marginBottom: 12 }}>
                <div>
                  <div className="os-entity-title">Run history</div>
                  <div className="os-entity-copy">Last run: {formatDateTime(latestExecution?.updatedAt ?? null)} | Next run: {nextRunLabel(active)}</div>
                </div>
                <Button variant="ghost" onClick={() => active.id && void loadExecutions(active.id)} loading={executionsLoading} loadingLabel="Refreshing...">Refresh</Button>
              </div>
              {executions.length === 0 ? (
                <div className="os-empty-body">No execution records are available yet.</div>
              ) : (
                <div className="os-feed" data-testid="workflow-run-history">
                  {executions.map(item => {
                    const status = normalizeStatus(item.status);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`os-feed-item${item.id === selectedExecution?.id ? ' active' : ''}`}
                        onClick={() => {
                          setSelectedExecutionId(item.id);
                          drawer.openDrawer('workflow-runtime');
                        }}
                      >
                        <div className="os-feed-head">
                          <strong>{item.title}</strong>
                          <Badge tone={status === 'FAILED' ? 'danger' : ACTIVE_EXECUTION_STATUSES.has(status) ? 'accent' : status === 'COMPLETED' ? 'success' : 'default'}>{status}</Badge>
                        </div>
                        <div className="os-feed-subtitle">{formatDateTime(item.updatedAt)} | {formatDuration(item.durationMs)}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card>
              <div className="os-entity-head" style={{ marginBottom: 12 }}>
                <div>
                  <div className="os-entity-title">Recurring schedule</div>
                  <div className="os-entity-copy">Enable, disable, or edit recurring workflow execution.</div>
                </div>
                <Badge tone={!active.schedule ? 'default' : active.status === 'paused' ? 'warning' : 'success'}>{!active.schedule ? 'manual' : active.status === 'paused' ? 'disabled' : 'enabled'}</Badge>
              </div>
              <div className="os-entity-copy">Current schedule: {scheduleLabel(active.schedule)}</div>
              <div className="os-entity-copy">Last run: {formatDateTime(active.last_run_at ?? latestExecution?.updatedAt ?? null)}</div>
              <div className="os-entity-copy">Next run: {nextRunLabel(active)}</div>
              {active.last_error ? <div className="os-entity-copy">Failure state: {active.last_error}</div> : null}
              <div className="os-entity-copy">Visibility: {active.visibility ?? 'private'}</div>
              <div className="os-inline-actions" style={{ marginTop: 12 }}>
                <Button variant="ghost" onClick={() => setScheduleDraft('@hourly')}>Hourly</Button>
                <Button variant="ghost" onClick={() => setScheduleDraft('@daily')}>Daily</Button>
                <Button variant="ghost" onClick={() => setScheduleDraft('*/15 * * * *')}>15 min</Button>
                <Button variant="ghost" onClick={() => setScheduleDraft('')}>Manual</Button>
              </div>
              <div style={{ marginTop: 12 }}>
                <Input
                  aria-label="Workflow schedule"
                  value={scheduleDraft}
                  onChange={event => setScheduleDraft(event.target.value)}
                  placeholder="@hourly, @daily, */15 * * * *"
                />
                <div className="os-entity-copy" style={{ marginTop: 8 }}>Supported schedules: @hourly, @daily, */N * * * *, 0 * * * *, 0 */N * * *, 0 0 * * *.</div>
              </div>
              <div className="os-inline-actions" style={{ marginTop: 12 }}>
                <Button
                  variant="secondary"
                  onClick={() => void saveSchedule()}
                  disabled={working || !scheduleChanged}
                  disabledReason={working ? 'Another workflow action is running.' : 'Change the schedule before saving.'}
                >
                  Save schedule
                </Button>
                <Button
                  variant={active.status === 'paused' ? 'secondary' : 'destructive'}
                  onClick={() => void toggleRecurring()}
                  disabled={working || !active.schedule}
                  disabledReason={working ? 'Another workflow action is running.' : 'Add a schedule before enabling or disabling recurring runs.'}
                >
                  {active.status === 'paused' ? 'Enable recurring' : 'Disable recurring'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void saveSchedule('')}
                  disabled={working || !active.schedule}
                  disabledReason={working ? 'Another workflow action is running.' : 'No recurring schedule is saved.'}
                >
                  Remove schedule
                </Button>
              </div>
            </Card>
            {renderDiscovery()}
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
          <div className="os-drawer-stack" data-testid="workflow-runtime-drawer">
            <Card>
              <div className="os-entity-head" style={{ marginBottom: 12 }}>
                <div>
                  <div className="os-entity-title">Run lifecycle</div>
                  <div className="os-entity-copy">{selectedExecution?.title ?? active.name}</div>
                </div>
                <Badge tone={selectedStatus === 'FAILED' || active.last_error ? 'danger' : ACTIVE_EXECUTION_STATUSES.has(selectedStatus) ? 'accent' : selectedStatus === 'COMPLETED' ? 'success' : 'default'}>{selectedStatus}</Badge>
              </div>
              {selectedExecution ? (
                <ActivityFeed
                  items={[
                    {
                      id: `${selectedExecution.id}-queued`,
                      title: 'Registered',
                      subtitle: formatDateTime(selectedExecution.createdAt),
                      status: 'QUEUED',
                    },
                    {
                      id: `${selectedExecution.id}-started`,
                      title: 'Executing',
                      subtitle: formatDateTime(selectedExecution.startedAt),
                      status: selectedStatus,
                    },
                    {
                      id: `${selectedExecution.id}-closed`,
                      title: lifecycleCloseLabel(selectedStatus),
                      subtitle: formatDateTime(selectedExecution.completedAt ?? selectedExecution.cancelledAt ?? selectedExecution.pausedAt ?? selectedExecution.updatedAt),
                      status: selectedStatus,
                    },
                  ]}
                />
              ) : (
                <div className="os-empty-body">No execution record is available for this workflow yet.</div>
              )}
            </Card>

            <Card>
              <div className="os-entity-head" style={{ marginBottom: 12 }}>
                <div>
                  <div className="os-entity-title">Run actions</div>
                  <div className="os-entity-copy">Retry and cancel requests are recorded through the execution service.</div>
                </div>
              </div>
              <div className="os-inline-actions">
                <Button
                  variant="secondary"
                  onClick={() => selectedExecution && void requestRunAction(selectedExecution, 'retry')}
                  disabled={!selectedExecution || !canRetrySelected || working}
                  disabledReason={!selectedExecution ? 'Select a run before retrying.' : !canRetrySelected ? 'Retry is available after a failed or cancelled run.' : 'Another workflow action is running.'}
                >
                  Retry
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => selectedExecution && void requestRunAction(selectedExecution, 'cancel')}
                  disabled={!selectedExecution || !canCancelSelected || working}
                  disabledReason={!selectedExecution ? 'Select a run before cancelling.' : !canCancelSelected ? 'Cancel is available only while a run is queued, running, or paused.' : 'Another workflow action is running.'}
                >
                  Cancel
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => selectedExecution && void requestRunAction(selectedExecution, 'inspect')}
                  disabled={!selectedExecution || working}
                  disabledReason={!selectedExecution ? 'Select a run before inspecting.' : 'Another workflow action is running.'}
                >
                  Inspect
                </Button>
              </div>
              {selectedExecution?.recoveryAction ? (
                <div className="os-entity-copy" style={{ marginTop: 12 }}>Last requested action: {selectedExecution.recoveryAction} at {formatDateTime(selectedExecution.recoveryRequestedAt)}</div>
              ) : null}
            </Card>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Safe run summary</div>
              <div className="os-entity-copy">{summarizeWorkflowRun(selectedExecution?.output ?? active.last_result ?? { status: active.status, error: active.last_error })}</div>
              {readableFailure(selectedExecution, active) ? <div className="os-entity-copy" style={{ marginTop: 12 }}>Failure: {readableFailure(selectedExecution, active)}</div> : null}
            </Card>

            <Card>
              <div className="os-entity-head" style={{ marginBottom: 12 }}>
                <div>
                  <div className="os-entity-title">Execution logs</div>
                  <div className="os-entity-copy">Secrets and raw runtime payloads are summarized before display.</div>
                </div>
                <Button variant="ghost" onClick={() => selectedExecution && void loadExecutionLogs(selectedExecution.id)} loading={logsLoading} loadingLabel="Loading...">Reload logs</Button>
              </div>
              {logsLoading ? (
                <div className="os-entity-copy">Loading logs.</div>
              ) : executionLogs.length === 0 ? (
                <div className="os-empty-body">No logs have been recorded for this execution yet.</div>
              ) : (
                <div className="os-log-list" data-testid="workflow-execution-logs">
                  {executionLogs.map(log => (
                    <details key={log.id} className="os-log-item">
                      <summary>
                        <span>{log.message || 'Workflow log event'}</span>
                        <Badge tone={log.level === 'error' ? 'danger' : log.level === 'warning' ? 'warning' : 'default'}>{log.level}</Badge>
                      </summary>
                      <div className="os-entity-copy">{formatDateTime(log.createdAt)}</div>
                      <div className="os-entity-copy">{summarizeValue(log.data ?? {}, 220)}</div>
                    </details>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </Drawer>
    </div>
  );
}
