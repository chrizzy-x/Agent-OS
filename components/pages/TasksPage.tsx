'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import WorkspaceShell from '@/components/os/workspace-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import { Badge, Button, Card, DataTable, EmptyState, LoadingState, PageHeader } from '@/components/os/ui';
import { fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSessionAuthState } from '@/src/auth/browser-session';

type TaskStatus = 'queued' | 'planning' | 'awaiting_confirmation' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'needs_configuration';

type TaskRecord = {
  id: string;
  sessionId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  title: string;
  status: TaskStatus;
  plan: Array<Record<string, unknown>>;
  capabilityIds: string[];
  requiredPermissions: string[];
  confirmationStatus: 'not_required' | 'pending' | 'approved' | 'rejected';
  progress: number;
  errorMessage: string | null;
  resultSummary: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type ConfirmationRecord = {
  id: string;
  taskId: string | null;
  actionName: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  dataSummary: string;
  secretScopes: string[];
  expectedResult: string;
  approvalCount: number;
  requiredApprovals: number;
};

const FILTERS: Array<{ key: TaskStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running' },
  { key: 'queued', label: 'Queued' },
  { key: 'awaiting_confirmation', label: 'Awaiting Confirmation' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
];

function toneForStatus(status: TaskStatus): 'default' | 'success' | 'warning' | 'danger' | 'accent' {
  if (status === 'completed') return 'success';
  if (status === 'failed' || status === 'cancelled') return 'danger';
  if (status === 'awaiting_confirmation' || status === 'needs_configuration') return 'warning';
  if (status === 'running' || status === 'planning') return 'accent';
  return 'default';
}

function formatStatus(value: string): string {
  return value.replace(/_/g, ' ');
}

function formatTime(value: string | null): string {
  if (!value) return 'Not yet';
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return 'Recent';
  }
}

export default function TasksPage() {
  const shell = useApplicationShell();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [confirmations, setConfirmations] = useState<ConfirmationRecord[]>([]);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sessionState = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
      setAuthState(sessionState.state);
      if (!sessionState.session) {
        setTasks([]);
        setConfirmations([]);
        return;
      }
      const taskParams = new URLSearchParams();
      taskParams.set('status', 'all');
      taskParams.set('limit', '120');
      if (shell.activeWorkspaceId) taskParams.set('workspaceId', shell.activeWorkspaceId);
      const [taskResponse, confirmationResponse] = await Promise.all([
        fetchWithBrowserSession(`/api/tasks?${taskParams.toString()}`, { cache: 'no-store' }),
        fetchWithBrowserSession('/api/confirmations?status=all&limit=120', { cache: 'no-store' }),
      ]);
      const taskPayload = await taskResponse.response.json().catch(() => ({})) as { tasks?: TaskRecord[] };
      const confirmationPayload = await confirmationResponse.response.json().catch(() => ({})) as { confirmations?: ConfirmationRecord[] };
      setTasks(taskResponse.response.ok ? taskPayload.tasks ?? [] : []);
      setConfirmations(confirmationResponse.response.ok ? confirmationPayload.confirmations ?? [] : []);
    } finally {
      setLoading(false);
    }
  }, [shell.activeWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleTasks = useMemo(
    () => filter === 'all' ? tasks : tasks.filter(task => task.status === filter),
    [filter, tasks],
  );
  const selectedTask = tasks.find(task => task.id === selectedTaskId) ?? visibleTasks[0] ?? null;
  const pendingConfirmations = confirmations.filter(item => item.status === 'pending');

  async function taskAction(task: TaskRecord, action: 'cancel' | 'retry') {
    setMessage('');
    const response = await fetchWithBrowserSession(`/api/tasks/${encodeURIComponent(task.id)}/${action}`, { method: 'POST' });
    const payload = await response.response.json().catch(() => ({})) as { error?: string; task?: TaskRecord };
    setMessage(response.response.ok ? `${formatStatus(action)} requested for ${task.title}.` : payload.error ?? `${action} failed.`);
    await load();
  }

  async function resolveConfirmation(confirmation: ConfirmationRecord, action: 'approve' | 'reject') {
    setMessage('');
    const response = await fetchWithBrowserSession(`/api/confirmations/${encodeURIComponent(confirmation.id)}/${action}`, { method: 'POST' });
    const payload = await response.response.json().catch(() => ({})) as { error?: string };
    setMessage(response.response.ok ? `${formatStatus(action)} recorded for ${confirmation.actionName}.` : payload.error ?? `${action} failed.`);
    await load();
  }

  return (
    <WorkspaceShell
      activePath="/tasks"
      aside={(
        <div className="tasks-side">
          <section>
            <h2>Status</h2>
            {FILTERS.map(item => (
              <button key={item.key} type="button" className={filter === item.key ? 'active' : ''} onClick={() => setFilter(item.key)}>
                <span>{item.label}</span>
                <Badge tone="default">{item.key === 'all' ? tasks.length : tasks.filter(task => task.status === item.key).length}</Badge>
              </button>
            ))}
          </section>
          <section>
            <h2>Approvals</h2>
            <div className="tasks-side-row">
              <span>Pending</span>
              <Badge tone={pendingConfirmations.length ? 'warning' : 'default'}>{pendingConfirmations.length}</Badge>
            </div>
          </section>
        </div>
      )}
    >
      <PageHeader
        eyebrow="Task Center"
        title="Tasks"
        subtitle="Durable Super AgentOS tasks, approvals, capability runs, and failures."
        actions={<Button href="/studio?mode=nl">New chat</Button>}
      />
      {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}
      {loading ? <LoadingState label="Loading tasks" /> : authState !== 'active' ? (
        <EmptyState title="Sign in required" body="Sign in to view Super AgentOS task history." action={<Button href="/signin">Sign in</Button>} />
      ) : tasks.length === 0 ? (
        <EmptyState title="No tasks yet" body="Send a message or execute a capability to create a persisted task." action={<Button href="/studio?mode=nl">Open Super AgentOS</Button>} />
      ) : (
        <div className="tasks-layout">
          <section className="tasks-table">
            <DataTable
              columns={['Task', 'Status', 'Created', 'Updated', 'Actions']}
              rows={visibleTasks.map(task => [
                <button key={`${task.id}-title`} type="button" className="tasks-title-button" onClick={() => setSelectedTaskId(task.id)}>
                  <strong>{task.title}</strong>
                  <span>{task.sessionId ? `Session ${task.sessionId.slice(0, 8)}` : 'No session'} · {task.capabilityIds[0] ?? 'Super AgentOS'}</span>
                </button>,
                <Badge key={`${task.id}-status`} tone={toneForStatus(task.status)}>{formatStatus(task.status)}</Badge>,
                formatTime(task.createdAt),
                formatTime(task.updatedAt),
                <div key={`${task.id}-actions`} className="os-inline-actions">
                  <button type="button" className="btn-ghost" onClick={() => setSelectedTaskId(task.id)}>Open</button>
                  {task.status === 'running' || task.status === 'queued' || task.status === 'planning' || task.status === 'awaiting_confirmation' ? (
                    <button type="button" className="btn-ghost" onClick={() => void taskAction(task, 'cancel')}>Cancel</button>
                  ) : null}
                  {task.status === 'failed' || task.status === 'cancelled' || task.status === 'needs_configuration' ? (
                    <button type="button" className="btn-ghost" onClick={() => void taskAction(task, 'retry')}>Retry</button>
                  ) : null}
                </div>,
              ])}
            />
          </section>
          <aside className="tasks-detail">
            {selectedTask ? (
              <>
                <div className="os-entity-head">
                  <div>
                    <div className="os-entity-title">{selectedTask.title}</div>
                    <div className="os-entity-copy">{selectedTask.resultSummary ?? selectedTask.errorMessage ?? 'No result yet.'}</div>
                  </div>
                  <Badge tone={toneForStatus(selectedTask.status)}>{formatStatus(selectedTask.status)}</Badge>
                </div>
                <div className="tasks-progress" aria-label={`Task progress ${selectedTask.progress}%`}>
                  <span style={{ width: `${Math.max(0, Math.min(100, selectedTask.progress))}%` }} />
                </div>
                <section>
                  <h2>Plan</h2>
                  {selectedTask.plan.length > 0 ? selectedTask.plan.map((step, index) => (
                    <div key={`${selectedTask.id}-plan-${index}`} className="tasks-event">
                      <strong>{String(step.step ?? step.actionName ?? `Step ${index + 1}`)}</strong>
                      <span>{String(step.status ?? step.capabilityId ?? 'planned')}</span>
                    </div>
                  )) : <span className="os-entity-copy">No plan recorded.</span>}
                </section>
                <section>
                  <h2>Capability Usage</h2>
                  {selectedTask.capabilityIds.length > 0 ? selectedTask.capabilityIds.map(id => (
                    <code key={id}>{id}</code>
                  )) : <span className="os-entity-copy">No capability selected.</span>}
                </section>
                <section>
                  <h2>Approvals</h2>
                  {confirmations.filter(item => item.taskId === selectedTask.id).length > 0 ? confirmations.filter(item => item.taskId === selectedTask.id).map(item => (
                    <div key={item.id} className="tasks-confirmation">
                      <div>
                        <strong>{item.actionName}</strong>
                        <span>{item.riskLevel} · {item.approvalCount}/{item.requiredApprovals}</span>
                        <p>{item.dataSummary || item.expectedResult}</p>
                      </div>
                      {item.status === 'pending' ? (
                        <div className="os-inline-actions">
                          <button type="button" className="btn-ghost" onClick={() => void resolveConfirmation(item, 'reject')}>Reject</button>
                          <button type="button" className="btn-ghost" onClick={() => void resolveConfirmation(item, 'approve')}>Approve</button>
                        </div>
                      ) : <Badge tone={item.status === 'approved' ? 'success' : 'danger'}>{item.status}</Badge>}
                    </div>
                  )) : <span className="os-entity-copy">No approvals for this task.</span>}
                </section>
                {selectedTask.sessionId ? <Link href={`/studio?mode=nl&session=${encodeURIComponent(selectedTask.sessionId)}`} className="btn-outline">Open related session</Link> : null}
              </>
            ) : null}
          </aside>
        </div>
      )}
      <style>{`
        .tasks-side {
          display: grid;
          gap: 16px;
        }
        .tasks-side section,
        .tasks-detail section {
          display: grid;
          gap: 8px;
        }
        .tasks-side h2,
        .tasks-detail h2 {
          margin: 0;
          color: var(--text-tertiary);
          font-size: 0.72rem;
          text-transform: uppercase;
        }
        .tasks-side button,
        .tasks-side-row {
          min-height: 38px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 0 10px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg-secondary);
          color: var(--text-secondary);
          cursor: pointer;
        }
        .tasks-side button.active,
        .tasks-side button:hover {
          color: var(--text-primary);
          border-color: rgba(79, 70, 229, 0.36);
          background: rgba(79, 70, 229, 0.08);
        }
        .tasks-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
          gap: 16px;
          align-items: start;
        }
        .tasks-table,
        .tasks-detail {
          min-width: 0;
        }
        .tasks-detail {
          display: grid;
          gap: 16px;
          padding: 16px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--bg-secondary);
        }
        .tasks-title-button {
          max-width: 100%;
          display: grid;
          gap: 4px;
          padding: 0;
          border: 0;
          background: transparent;
          color: inherit;
          text-align: left;
          cursor: pointer;
        }
        .tasks-title-button span {
          color: var(--text-tertiary);
          font-size: 0.75rem;
        }
        .tasks-progress {
          height: 8px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.18);
        }
        .tasks-progress span {
          height: 100%;
          display: block;
          border-radius: inherit;
          background: var(--accent);
        }
        .tasks-event,
        .tasks-confirmation {
          display: grid;
          gap: 6px;
          padding: 10px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg-primary);
        }
        .tasks-event span,
        .tasks-confirmation span,
        .tasks-confirmation p {
          margin: 0;
          color: var(--text-secondary);
          font-size: 0.82rem;
        }
        .tasks-detail code {
          display: block;
          padding: 8px;
          overflow-wrap: anywhere;
          border-radius: 8px;
          background: var(--bg-primary);
        }
        @media (max-width: 980px) {
          .tasks-layout {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>
    </WorkspaceShell>
  );
}
