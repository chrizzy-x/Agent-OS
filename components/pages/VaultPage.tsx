'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import { ConfirmModal, Drawer } from '@/components/os/overlays';
import { useRouteDrawer } from '@/components/os/drawer-state';
import WorkspaceShell from '@/components/os/workspace-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Input,
  LoadingState,
  MetricCard,
  PageHeader,
  SearchBar,
  Select,
  Tabs,
} from '@/components/os/ui';

type Secret = {
  id: string;
  name: string;
  status: string;
  version: number;
  updatedAt: string;
  lastAccessedAt: string | null;
  assignedAppsCount?: number;
  assignedSubagentsCount?: number;
  assignedWorkflowsCount?: number;
  assignedSkillsCount?: number;
  assignmentCount?: number;
};

type Assignment = {
  id: string;
  subjectType: string;
  subjectId: string;
  status: string;
  createdAt: string;
  revokedAt: string | null;
};

type HistoryEntry = {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type VersionEntry = {
  id: string;
  version: number;
  maskedValue: string;
  createdAt: string;
};

type DrawerId = 'secret-details' | 'secret-history' | 'secret-assign';

type SubjectType = 'app' | 'subagent' | 'workflow' | 'skill' | 'session' | 'sdk_credential' | 'super_agentos';
type VaultView = 'secrets' | 'apiKeys' | 'credentials' | 'wallets' | 'audit';

const SUBJECT_OPTIONS: Array<{ value: SubjectType; label: string }> = [
  { value: 'app', label: 'App' },
  { value: 'subagent', label: 'Subagent' },
  { value: 'workflow', label: 'Workflow' },
  { value: 'skill', label: 'Skill' },
  { value: 'session', label: 'Session' },
  { value: 'sdk_credential', label: 'SDK Credential' },
  { value: 'super_agentos', label: 'Super AgentOS' },
];

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : 'Never';
}

function historySummary(entry: HistoryEntry): string {
  const blocked = new Set(['secret', 'token', 'password', 'authorization', 'value', 'plaintext']);
  const parts = Object.entries(entry.metadata ?? {})
    .filter(([key]) => !blocked.has(key))
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${['string', 'number', 'boolean'].includes(typeof value) ? String(value) : 'metadata'}`);
  return parts.join(' | ') || 'No metadata';
}

export default function VaultPage() {
  const shell = useApplicationShell();
  const drawer = useRouteDrawer<DrawerId>();
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [historyTab, setHistoryTab] = useState('Access');
  const [vaultView, setVaultView] = useState<VaultView>('secrets');
  const [createOpen, setCreateOpen] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [disableConfirm, setDisableConfirm] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [subjectType, setSubjectType] = useState<SubjectType>('app');
  const [subjectId, setSubjectId] = useState('');

  const selected = useMemo(
    () => secrets.find(secret => secret.id === drawer.current?.entityId) ?? null,
    [drawer.current?.entityId, secrets],
  );

  const loadSecrets = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/vault?search=${encodeURIComponent(search)}${shell.activeWorkspaceId ? `&workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' });
      const payload = await response.json();
      setSecrets(payload.secrets ?? []);
    } catch {
      setSecrets([]);
    } finally {
      setLoading(false);
    }
  }, [search, shell.activeWorkspaceId]);

  const loadSecretDetail = useCallback(async (secretId: string) => {
    setDetailLoading(true);
    try {
      const [historyRes, assignmentsRes, versionsRes] = await Promise.all([
        fetch(`/api/vault/history?secretId=${encodeURIComponent(secretId)}&limit=50`, { cache: 'no-store' }),
        fetch(`/api/vault/assignments?secretId=${encodeURIComponent(secretId)}`, { cache: 'no-store' }),
        fetch(`/api/vault/versions?secretId=${encodeURIComponent(secretId)}`, { cache: 'no-store' }),
      ]);
      const [historyPayload, assignmentsPayload, versionsPayload] = await Promise.all([
        historyRes.json().catch(() => ({})),
        assignmentsRes.json().catch(() => ({})),
        versionsRes.json().catch(() => ({})),
      ]);
      setHistory(historyPayload.history ?? []);
      setAssignments(assignmentsPayload.assignments ?? []);
      setVersions(versionsPayload.versions ?? []);
    } catch {
      setHistory([]);
      setAssignments([]);
      setVersions([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSecrets();
  }, [loadSecrets]);

  useEffect(() => {
    if (!drawer.current?.entityId) {
      setHistory([]);
      setAssignments([]);
      setVersions([]);
      return;
    }
    void loadSecretDetail(drawer.current.entityId);
  }, [drawer.current?.entityId, loadSecretDetail]);

  const summary = useMemo(() => ({
    total: secrets.length,
    active: secrets.filter(item => item.status === 'active').length,
    assigned: secrets.reduce((sum, item) => sum + (item.assignmentCount ?? 0), 0),
    recentlyUsed: secrets.filter(item => item.lastAccessedAt).length,
  }), [secrets]);

  async function refresh(secretId?: string) {
    await loadSecrets();
    const nextSecretId = secretId ?? drawer.current?.entityId;
    if (nextSecretId) {
      await loadSecretDetail(nextSecretId);
    }
  }

  async function createSecret() {
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draftName, value: draftValue, workspaceId: shell.activeWorkspaceId }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? 'Secret created.' : payload.error ?? 'Create failed');
      if (response.ok) {
        setDraftName('');
        setDraftValue('');
        setCreateOpen(false);
        await refresh();
      }
    } finally {
      setWorking(false);
    }
  }

  async function rotateSecret() {
    if (!selected) return;
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch('/api/vault', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secretId: selected.id, action: 'rotate', value: draftValue }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? 'Secret rotated.' : payload.error ?? 'Rotate failed');
      if (response.ok) {
        setDraftValue('');
        setRotateOpen(false);
        await refresh(selected.id);
      }
    } finally {
      setWorking(false);
    }
  }

  async function toggleSecretStatus() {
    if (!selected) return;
    setWorking(true);
    setMessage('');
    try {
      const action = selected.status === 'active' ? 'disable' : 'enable';
      const response = await fetch('/api/vault', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secretId: selected.id, action }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? (action === 'disable' ? 'Secret access revoked.' : 'Secret restored.') : payload.error ?? 'Status update failed');
      if (response.ok) {
        setDisableConfirm(false);
        await refresh(selected.id);
      }
    } finally {
      setWorking(false);
    }
  }

  async function assignSecret() {
    if (!selected) return;
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch('/api/vault/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secretId: selected.id, subjectType, subjectId }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? 'Secret assigned.' : payload.error ?? 'Assign failed');
      if (response.ok) {
        setSubjectId('');
        await refresh(selected.id);
      }
    } finally {
      setWorking(false);
    }
  }

  async function revokeAssignment(assignment: Assignment) {
    if (!selected) return;
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch(`/api/vault/assignments?secretId=${encodeURIComponent(selected.id)}&subjectType=${encodeURIComponent(assignment.subjectType)}&subjectId=${encodeURIComponent(assignment.subjectId)}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? 'Assignment revoked.' : payload.error ?? 'Revoke failed');
      if (response.ok) {
        await refresh(selected.id);
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/vault" />
      <WorkspaceShell
        activePath="/vault"
        aside={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Summary</div>
            <div className="os-drawer-stack">
              <div className="os-entity-copy">Secrets: {summary.total}</div>
              <div className="os-entity-copy">Active: {summary.active}</div>
              <div className="os-entity-copy">Assignments: {summary.assigned}</div>
              <div className="os-entity-copy">Used: {summary.recentlyUsed}</div>
            </div>
          </Card>
        )}
      >
        <PageHeader
          eyebrow="Vault"
          title="Enterprise Credential Manager"
          subtitle="Wallets, API keys, credentials, secrets, and audit logs stay masked by default."
          actions={<Button onClick={() => setCreateOpen(true)}>Create secret</Button>}
        />

        <div className="os-drawer-stack">
          <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search secret names" />
          <Tabs
            tabs={[
              { key: 'secrets', label: 'Secrets' },
              { key: 'apiKeys', label: 'API Keys' },
              { key: 'credentials', label: 'Credentials' },
              { key: 'wallets', label: 'Wallets' },
              { key: 'audit', label: 'Audit Logs' },
            ]}
            active={vaultView}
            onChange={key => setVaultView(key as VaultView)}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <MetricCard label="Total secrets" value={summary.total} />
            <MetricCard label="Active" value={summary.active} />
            <MetricCard label="Assignments" value={summary.assigned} />
            <MetricCard label="Recently used" value={summary.recentlyUsed} />
          </div>
        </div>

        {vaultView !== 'secrets' && vaultView !== 'audit' ? (
          <Card>
            <EmptyState
              title={`${vaultView === 'apiKeys' ? 'API keys' : vaultView} coming soon`}
              body="This credential type is disabled in v6.6.7. Use Secrets for live encrypted values."
            />
          </Card>
        ) : vaultView === 'audit' ? (
          <Card>
            <DataTable
              columns={['Action', 'Metadata', 'Created']}
              rows={history.map(entry => [
                entry.action,
                historySummary(entry),
                formatDate(entry.createdAt),
              ])}
            />
            {history.length === 0 ? <EmptyState title="No audit log selected" body="Open a secret first to inspect its masked audit history." /> : null}
          </Card>
        ) : loading ? <LoadingState label="Loading vault" /> : secrets.length === 0 ? (
          <EmptyState title="No secrets stored" body="Create a secret, then assign it to apps, subagents, workflows, skills, or sessions." action={<Button onClick={() => setCreateOpen(true)}>Create secret</Button>} />
        ) : (
          <Card>
            <DataTable
              columns={['Name', 'Status', 'Last used', 'Assigned apps', 'Assigned subagents', 'Assigned workflows', 'Actions']}
              rows={secrets.map(secret => [
                <button key={`${secret.id}-pick`} type="button" onClick={() => drawer.openDrawer('secret-details', secret.id)} style={{ background: 'transparent', border: 0, padding: 0, color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left' }}>{secret.name}</button>,
                <Badge key={`${secret.id}-status`} tone={secret.status === 'active' ? 'success' : 'warning'}>{secret.status}</Badge>,
                formatDate(secret.lastAccessedAt),
                String(secret.assignedAppsCount ?? 0),
                String(secret.assignedSubagentsCount ?? 0),
                String(secret.assignedWorkflowsCount ?? 0),
                <div key={`${secret.id}-actions`} className="os-inline-actions">
                  <Button variant="secondary" onClick={() => drawer.openDrawer('secret-details', secret.id)}>Inspect</Button>
                  <Button onClick={() => drawer.openDrawer('secret-assign', secret.id)}>Assign</Button>
                </div>,
              ])}
            />
          </Card>
        )}

        {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}
      </WorkspaceShell>

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create secret"
        description="Secret values are accepted once, encrypted at rest, and never shown again."
        footer={<Button onClick={() => void createSecret()} disabled={working || !draftName.trim() || !draftValue.trim()}>{working ? 'Working...' : 'Save secret'}</Button>}
      >
        <div className="os-drawer-stack">
          <Input value={draftName} onChange={event => setDraftName(event.target.value.toUpperCase())} placeholder="SECRET_NAME" />
          <Input value={draftValue} onChange={event => setDraftValue(event.target.value)} placeholder="Secret value" type="password" />
        </div>
      </Drawer>

      <Drawer
        open={drawer.current?.id === 'secret-details'}
        onClose={drawer.closeDrawer}
        title={selected?.name ?? 'Secret details'}
        description="Status, runtime usage, versions, and assignment coverage."
        routeSafe
        footer={selected ? (
          <div className="os-inline-actions">
            <Button variant="secondary" onClick={() => setRotateOpen(true)}>Rotate</Button>
            <Button onClick={() => drawer.openDrawer('secret-assign', selected.id)}>Assign</Button>
            <Button variant="secondary" onClick={() => drawer.openDrawer('secret-history', selected.id)}>History</Button>
            <Button variant={selected.status === 'active' ? 'danger' : 'secondary'} onClick={() => setDisableConfirm(true)}>
              {selected.status === 'active' ? 'Revoke access' : 'Restore'}
            </Button>
          </div>
        ) : undefined}
      >
        {detailLoading ? <LoadingState label="Loading secret details" /> : !selected ? (
          <EmptyState title="Secret unavailable" body="This secret could not be loaded." />
        ) : (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-inline-actions">
                <Badge tone={selected.status === 'active' ? 'success' : 'warning'}>{selected.status}</Badge>
                <Badge tone="accent">v{selected.version}</Badge>
              </div>
              <div className="os-drawer-stack" style={{ marginTop: 12 }}>
                <div className="os-entity-copy">Last used: {formatDate(selected.lastAccessedAt)}</div>
                <div className="os-entity-copy">Updated: {formatDate(selected.updatedAt)}</div>
                <div className="os-entity-copy">Assigned apps: {selected.assignedAppsCount ?? 0}</div>
                <div className="os-entity-copy">Assigned subagents: {selected.assignedSubagentsCount ?? 0}</div>
                <div className="os-entity-copy">Assigned workflows: {selected.assignedWorkflowsCount ?? 0}</div>
                <div className="os-entity-copy">Assigned skills: {selected.assignedSkillsCount ?? 0}</div>
              </div>
            </Card>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Assignments</div>
              <div className="os-drawer-stack">
                {assignments.length === 0 ? <div className="os-empty-body">No runtime assignments yet.</div> : assignments.map(assignment => (
                  <Card key={assignment.id}>
                    <div className="os-inline-actions">
                      <strong>{assignment.subjectType}</strong>
                      <Badge tone={assignment.status === 'active' ? 'success' : 'warning'}>{assignment.status}</Badge>
                    </div>
                    <div className="os-entity-copy">{assignment.subjectId}</div>
                    <div className="os-inline-actions" style={{ marginTop: 12 }}>
                      <span className="os-entity-copy">Assigned {formatDate(assignment.createdAt)}</span>
                      {assignment.status === 'active' ? <Button variant="danger" onClick={() => void revokeAssignment(assignment)}>Revoke</Button> : null}
                    </div>
                  </Card>
                ))}
              </div>
            </Card>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Recent runtime usage</div>
              <div className="os-drawer-stack">
                {history.slice(0, 5).length === 0 ? <div className="os-empty-body">No runtime access events yet.</div> : history.slice(0, 5).map(entry => (
                  <Card key={entry.id}>
                    <div className="os-inline-actions">
                      <strong>{entry.action}</strong>
                      <span className="os-entity-copy">{formatDate(entry.createdAt)}</span>
                    </div>
                    <div className="os-entity-copy">{historySummary(entry)}</div>
                  </Card>
                ))}
              </div>
            </Card>
          </div>
        )}
      </Drawer>

      <Drawer
        open={drawer.current?.id === 'secret-assign'}
        onClose={drawer.closeDrawer}
        title={selected ? `Assign ${selected.name}` : 'Assign secret'}
        description="Grant runtime access without revealing plaintext values."
        routeSafe
        footer={<Button onClick={() => void assignSecret()} disabled={working || !selected || !subjectId.trim()}>{working ? 'Working...' : 'Assign secret'}</Button>}
      >
        {!selected ? <EmptyState title="Secret unavailable" body="Select a secret to assign." /> : (
          <div className="os-drawer-stack">
            <Select value={subjectType} onChange={event => setSubjectType(event.target.value as SubjectType)}>
              {SUBJECT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
            <Input value={subjectId} onChange={event => setSubjectId(event.target.value)} placeholder="Runtime subject id" />
            <div className="os-entity-copy">Examples: app slug, subagent id, workflow id, skill slug, session id, SDK credential id, or Super AgentOS runtime id.</div>
          </div>
        )}
      </Drawer>

      <Drawer
        open={drawer.current?.id === 'secret-history'}
        onClose={drawer.closeDrawer}
        title={selected ? `${selected.name} history` : 'Secret history'}
        description="Access history and version timeline."
        routeSafe
      >
        {!selected ? <EmptyState title="Secret unavailable" body="Select a secret to inspect history." /> : (
          <div className="os-drawer-stack">
            <Tabs
              tabs={[
                { key: 'Access', label: 'Access' },
                { key: 'Versions', label: 'Versions' },
              ]}
              active={historyTab}
              onChange={setHistoryTab}
            />
            {historyTab === 'Access' ? (
              <Card>
                <div className="os-drawer-stack">
                  {history.length === 0 ? <div className="os-empty-body">No access events recorded.</div> : history.map(entry => (
                    <Card key={entry.id}>
                      <div className="os-inline-actions">
                        <strong>{entry.action}</strong>
                        <span className="os-entity-copy">{formatDate(entry.createdAt)}</span>
                      </div>
                      <div className="os-entity-copy">{historySummary(entry)}</div>
                    </Card>
                  ))}
                </div>
              </Card>
            ) : (
              <Card>
                <div className="os-drawer-stack">
                  {versions.length === 0 ? <div className="os-empty-body">No version history recorded.</div> : versions.map(version => (
                    <Card key={version.id}>
                      <div className="os-inline-actions">
                        <strong>v{version.version}</strong>
                        <span className="os-entity-copy">{formatDate(version.createdAt)}</span>
                      </div>
                      <div className="os-entity-copy">{version.maskedValue}</div>
                    </Card>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </Drawer>

      <Drawer
        open={rotateOpen}
        onClose={() => setRotateOpen(false)}
        title={selected ? `Rotate ${selected.name}` : 'Rotate secret'}
        description="Provide a new value. The previous value remains redacted and versioned."
        footer={<Button onClick={() => void rotateSecret()} disabled={working || !selected || !draftValue.trim()}>{working ? 'Working...' : 'Rotate secret'}</Button>}
      >
        <Input value={draftValue} onChange={event => setDraftValue(event.target.value)} placeholder="New secret value" type="password" />
      </Drawer>

      {selected ? (
        <ConfirmModal
          open={disableConfirm}
          onClose={() => setDisableConfirm(false)}
          title={selected.status === 'active' ? `Revoke ${selected.name}?` : `Restore ${selected.name}?`}
          body={selected.status === 'active' ? 'This blocks runtime use until the secret is restored.' : 'This restores runtime use for active assignments.'}
          confirmLabel={selected.status === 'active' ? 'Revoke access' : 'Restore'}
          tone={selected.status === 'active' ? 'danger' : 'default'}
          busy={working}
          onConfirm={() => void toggleSecretStatus()}
        />
      ) : null}
    </div>
  );
}
