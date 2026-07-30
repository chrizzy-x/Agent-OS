'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import { ConfirmModal, Drawer } from '@/components/os/overlays';
import { useRouteDrawer } from '@/components/os/drawer-state';
import WorkspaceShell from '@/components/os/workspace-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import { fetchBrowserSession, fetchWithBrowserSession } from '@/src/auth/browser-session';
import {
  Badge,
  Button,
  Card,
  ComingSoonState,
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
  maskedValue?: string;
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

type RuntimeGrant = {
  id: string;
  name: string;
  subjectType: string;
  subjectId: string;
  status: string;
  expiresAt: string;
};

type IntelligenceVendor = 'openai' | 'anthropic' | 'gemini';

type IntelligenceModel = {
  id: string;
  label: string;
  vendor: IntelligenceVendor;
  default: boolean;
  capabilities: string[];
};

type IntelligenceConnection = {
  id: string;
  workspaceId: string;
  vendor: IntelligenceVendor;
  displayName: string;
  status: string;
  selectedModelId: string;
  availableModels: string[];
  lastValidatedAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

type DrawerId = 'secret-details' | 'secret-history' | 'secret-assign' | 'secret-edit' | 'secret-permission';

type SubjectType = 'app' | 'subagent' | 'workflow' | 'skill' | 'session' | 'sdk_credential' | 'super_agentos';
type VaultView = 'secrets' | 'intelligence' | 'apiKeys' | 'credentials' | 'wallets' | 'audit';

const SUBJECT_OPTIONS: Array<{ value: SubjectType; label: string }> = [
  { value: 'app', label: 'App' },
  { value: 'subagent', label: 'Subagent' },
  { value: 'workflow', label: 'Workflow' },
  { value: 'skill', label: 'Skill' },
  { value: 'session', label: 'Session' },
  { value: 'sdk_credential', label: 'SDK Credential' },
  { value: 'super_agentos', label: 'Super AgentOS' },
];

const INTELLIGENCE_VENDOR_OPTIONS: Array<{ value: IntelligenceVendor; label: string }> = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Gemini' },
];

const FALLBACK_INTELLIGENCE_MODELS: Record<IntelligenceVendor, IntelligenceModel[]> = {
  openai: [
    { id: 'gpt-5', label: 'gpt-5', vendor: 'openai', default: true, capabilities: ['text', 'streaming'] },
    { id: 'gpt-5-mini', label: 'gpt-5-mini', vendor: 'openai', default: false, capabilities: ['text', 'streaming'] },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6', vendor: 'anthropic', default: true, capabilities: ['text', 'streaming'] },
    { id: 'claude-opus-4-1', label: 'claude-opus-4-1', vendor: 'anthropic', default: false, capabilities: ['text', 'streaming'] },
  ],
  gemini: [
    { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro', vendor: 'gemini', default: true, capabilities: ['text', 'streaming'] },
    { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash', vendor: 'gemini', default: false, capabilities: ['text', 'streaming'] },
  ],
};

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
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [subjectType, setSubjectType] = useState<SubjectType>('app');
  const [subjectId, setSubjectId] = useState('');
  const [permissionSubjectType, setPermissionSubjectType] = useState<SubjectType>('workflow');
  const [permissionSubjectId, setPermissionSubjectId] = useState('');
  const [permissionReason, setPermissionReason] = useState('');
  const [runtimeGrant, setRuntimeGrant] = useState<RuntimeGrant | null>(null);
  const [connections, setConnections] = useState<IntelligenceConnection[]>([]);
  const [connectionModels, setConnectionModels] = useState<Record<string, IntelligenceModel[]>>({});
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [connectionVendor, setConnectionVendor] = useState<IntelligenceVendor>('openai');
  const [connectionModelId, setConnectionModelId] = useState('gpt-5');
  const [connectionName, setConnectionName] = useState('');
  const [connectionCredential, setConnectionCredential] = useState('');
  const [connectionDefault, setConnectionDefault] = useState(true);

  const selected = useMemo(
    () => secrets.find(secret => secret.id === drawer.current?.entityId) ?? null,
    [drawer.current?.entityId, secrets],
  );

  const loadSecrets = useCallback(async () => {
    setLoading(true);
    try {
      const session = await fetchBrowserSession().catch(() => null);
      if (!session) {
        setSecrets([]);
        return;
      }
      const { response } = await fetchWithBrowserSession(`/api/vault?search=${encodeURIComponent(search)}${shell.activeWorkspaceId ? `&workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' });
      const payload = await response.json();
      setSecrets(payload.secrets ?? []);
    } catch {
      setSecrets([]);
    } finally {
      setLoading(false);
    }
  }, [search, shell.activeWorkspaceId]);

  const loadConnections = useCallback(async () => {
    if (!shell.activeWorkspaceId) {
      setConnections([]);
      setConnectionModels({});
      return;
    }
    setConnectionLoading(true);
    try {
      const { response } = await fetchWithBrowserSession(`/api/intelligence/connections?workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      setConnections(payload.connections ?? []);
      setConnectionModels(payload.models ?? {});
    } catch {
      setConnections([]);
      setConnectionModels({});
    } finally {
      setConnectionLoading(false);
    }
  }, [shell.activeWorkspaceId]);

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
    void loadConnections();
  }, [loadConnections]);

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
    connections: connections.filter(item => item.status === 'active').length,
  }), [connections, secrets]);

  const currentConnectionModels = useMemo(
    () => connectionModels[connectionVendor] ?? FALLBACK_INTELLIGENCE_MODELS[connectionVendor],
    [connectionModels, connectionVendor],
  );

  useEffect(() => {
    const models = connectionModels[connectionVendor] ?? FALLBACK_INTELLIGENCE_MODELS[connectionVendor];
    if (models.length > 0 && !models.some(model => model.id === connectionModelId)) {
      setConnectionModelId(models.find(model => model.default)?.id ?? models[0].id);
    }
  }, [connectionModelId, connectionModels, connectionVendor]);

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

  async function renameSecret() {
    if (!selected) return;
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch('/api/vault', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secretId: selected.id, action: 'rename', name: draftName }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? 'Secret label updated.' : payload.error ?? 'Update failed');
      if (response.ok) {
        setDraftName('');
        drawer.openDrawer('secret-details', selected.id);
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

  async function deleteSecret() {
    if (!selected) return;
    const secretId = selected.id;
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch(`/api/vault?secretId=${encodeURIComponent(secretId)}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? 'Secret deleted.' : payload.error ?? 'Delete failed');
      if (response.ok) {
        setDeleteConfirm(false);
        drawer.closeDrawer();
        await refresh();
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

  async function grantRuntimePermission() {
    if (!selected) return;
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch('/api/vault/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'runtime',
          workspaceId: shell.activeWorkspaceId,
          name: selected.name,
          subjectType: permissionSubjectType,
          subjectId: permissionSubjectId,
          reason: permissionReason,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? 'Runtime permission granted.' : payload.error ?? 'Permission grant failed');
      if (response.ok) {
        setRuntimeGrant(payload.grant ?? null);
        await refresh(selected.id);
      }
    } finally {
      setWorking(false);
    }
  }

  async function denyRuntimePermission() {
    if (!selected) return;
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch('/api/vault/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deny',
          workspaceId: shell.activeWorkspaceId,
          name: selected.name,
          subjectType: permissionSubjectType,
          subjectId: permissionSubjectId,
          reason: permissionReason || 'User denied runtime secret access',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? 'Runtime permission denied and audited.' : payload.error ?? 'Permission denial failed');
      if (response.ok) {
        setRuntimeGrant(null);
        await refresh(selected.id);
      }
    } finally {
      setWorking(false);
    }
  }

  async function revokeRuntimeGrant() {
    if (!runtimeGrant) return;
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch('/api/vault/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cleanup', grantId: runtimeGrant.id }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? 'Runtime grant revoked.' : payload.error ?? 'Runtime grant revoke failed');
      if (response.ok) {
        setRuntimeGrant(null);
      }
    } finally {
      setWorking(false);
    }
  }

  async function createConnection() {
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch('/api/intelligence/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: shell.activeWorkspaceId,
          vendor: connectionVendor,
          displayName: connectionName,
          credential: connectionCredential,
          modelId: connectionModelId,
          makeDefault: connectionDefault,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok
        ? payload.validated === false ? payload.validationError ?? 'Connection saved as invalid.' : 'Connection validated.'
        : payload.error ?? 'Connection failed');
      if (response.ok) {
        setConnectionCredential('');
        setConnectionName('');
        await loadConnections();
      }
    } finally {
      setWorking(false);
    }
  }

  async function setConnectionAsDefault(connection: IntelligenceConnection) {
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch('/api/intelligence/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_default',
          workspaceId: shell.activeWorkspaceId,
          connectionId: connection.id,
          modelId: connection.selectedModelId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? 'Workspace default updated.' : payload.error ?? 'Default update failed');
    } finally {
      setWorking(false);
    }
  }

  async function revokeConnection(connection: IntelligenceConnection) {
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch('/api/intelligence/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'revoke',
          workspaceId: shell.activeWorkspaceId,
          connectionId: connection.id,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? 'Connection revoked.' : payload.error ?? 'Revoke failed');
      if (response.ok) await loadConnections();
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
              <div className="os-entity-copy">Connections: {summary.connections}</div>
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
              { key: 'intelligence', label: 'Connected Intelligence' },
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

        {vaultView !== 'secrets' && vaultView !== 'audit' && vaultView !== 'intelligence' ? (
          <ComingSoonState
            title={`${vaultView === 'apiKeys' ? 'API keys' : vaultView} coming soon`}
            body="This credential type is disabled in V6.6.8. Use Secrets for live encrypted values."
            meta={<Badge tone="warning">Disabled</Badge>}
          />
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
        ) : vaultView === 'intelligence' ? (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>New connection</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <Select value={connectionVendor} onChange={event => setConnectionVendor(event.target.value as IntelligenceVendor)} aria-label="Connection vendor">
                  {INTELLIGENCE_VENDOR_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
                <Select value={connectionModelId} onChange={event => setConnectionModelId(event.target.value)} aria-label="Exact model">
                  {currentConnectionModels.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}
                </Select>
                <Input value={connectionName} onChange={event => setConnectionName(event.target.value)} placeholder="Connection name" />
                <Input value={connectionCredential} onChange={event => setConnectionCredential(event.target.value)} placeholder="Credential value" type="password" />
              </div>
              <div className="os-inline-actions" style={{ marginTop: 12 }}>
                <label className="os-entity-copy" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={connectionDefault} onChange={event => setConnectionDefault(event.target.checked)} />
                  Use as workspace default
                </label>
                <Button onClick={() => void createConnection()} disabled={working || !shell.activeWorkspaceId || !connectionCredential.trim() || !connectionModelId.trim()}>
                  {working ? 'Working...' : 'Validate and connect'}
                </Button>
              </div>
            </Card>

            {connectionLoading ? <LoadingState label="Loading connections" /> : connections.length === 0 ? (
              <EmptyState title="No connected intelligence" body="Add a Vault-backed connection to make external reasoning selectable later." />
            ) : (
              <Card>
                <DataTable
                  columns={['Name', 'Vendor', 'Model', 'Status', 'Validated', 'Actions']}
                  rows={connections.map(connection => [
                    connection.displayName,
                    INTELLIGENCE_VENDOR_OPTIONS.find(option => option.value === connection.vendor)?.label ?? connection.vendor,
                    connection.selectedModelId,
                    <Badge key={`${connection.id}-status`} tone={connection.status === 'active' ? 'success' : connection.status === 'invalid' ? 'warning' : 'default'}>{connection.status}</Badge>,
                    connection.lastError ? connection.lastError : formatDate(connection.lastValidatedAt),
                    <div key={`${connection.id}-actions`} className="os-inline-actions">
                      <Button variant="secondary" onClick={() => void setConnectionAsDefault(connection)} disabled={working || connection.status !== 'active'}>Default</Button>
                      <Button variant="danger" onClick={() => void revokeConnection(connection)} disabled={working || connection.status === 'revoked'}>Revoke</Button>
                    </div>,
                  ])}
                />
              </Card>
            )}
          </div>
        ) : loading ? <LoadingState label="Loading vault" /> : secrets.length === 0 ? (
          <EmptyState title="No secrets stored" body="Create a secret, then assign it to apps, subagents, workflows, skills, or sessions." action={<Button onClick={() => setCreateOpen(true)}>Create secret</Button>} />
        ) : (
          <Card>
            <DataTable
              columns={['Name', 'Masked value', 'Status', 'Last used', 'Assigned apps', 'Assigned subagents', 'Assigned workflows', 'Actions']}
              rows={secrets.map(secret => [
                <button key={`${secret.id}-pick`} type="button" onClick={() => drawer.openDrawer('secret-details', secret.id)} style={{ background: 'transparent', border: 0, padding: 0, color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left' }}>{secret.name}</button>,
                secret.maskedValue ?? '****************',
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
            <Button variant="secondary" onClick={() => { setDraftName(selected.name); drawer.openDrawer('secret-edit', selected.id); }}>Edit label</Button>
            <Button onClick={() => { setPermissionSubjectId(''); setPermissionReason(''); setRuntimeGrant(null); drawer.openDrawer('secret-permission', selected.id); }}>Request permission</Button>
            <Button onClick={() => drawer.openDrawer('secret-assign', selected.id)}>Assign</Button>
            <Button variant="secondary" onClick={() => drawer.openDrawer('secret-history', selected.id)}>History</Button>
            <Button variant="secondary" disabled disabledReason="Provider-specific secret tests are not connected yet.">Test</Button>
            <Button variant={selected.status === 'active' ? 'danger' : 'secondary'} onClick={() => setDisableConfirm(true)}>
              {selected.status === 'active' ? 'Revoke access' : 'Restore'}
            </Button>
            <Button variant="danger" onClick={() => setDeleteConfirm(true)}>Delete</Button>
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
                <div className="os-entity-copy">Masked value: {selected.maskedValue ?? '****************'}</div>
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
        open={drawer.current?.id === 'secret-edit'}
        onClose={drawer.closeDrawer}
        title={selected ? `Edit ${selected.name}` : 'Edit secret'}
        description="Update the visible label only. Plaintext values remain hidden; use Rotate to replace the value."
        routeSafe
        footer={<Button onClick={() => void renameSecret()} disabled={working || !selected || !draftName.trim()}>{working ? 'Working...' : 'Save label'}</Button>}
      >
        {!selected ? <EmptyState title="Secret unavailable" body="Select a secret to edit." /> : (
          <div className="os-drawer-stack">
            <Input value={draftName} onChange={event => setDraftName(event.target.value.toUpperCase())} placeholder="SECRET_NAME" />
            <div className="os-entity-copy">Secret values are never revealed or copied into normal memory while editing labels.</div>
          </div>
        )}
      </Drawer>

      <Drawer
        open={drawer.current?.id === 'secret-permission'}
        onClose={drawer.closeDrawer}
        title={selected ? `Permission for ${selected.name}` : 'Vault permission'}
        description="Grant or deny temporary runtime access without revealing the secret value."
        routeSafe
        footer={selected ? (
          <div className="os-inline-actions">
            <Button variant="secondary" onClick={() => void denyRuntimePermission()} disabled={working || !permissionSubjectId.trim()}>{working ? 'Working...' : 'Deny'}</Button>
            <Button onClick={() => void grantRuntimePermission()} disabled={working || !permissionSubjectId.trim()}>{working ? 'Working...' : 'Grant permission'}</Button>
          </div>
        ) : undefined}
      >
        {!selected ? <EmptyState title="Secret unavailable" body="Select a secret to manage runtime permission." /> : (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-entity-title">Why access is needed</div>
              <div className="os-entity-copy">Runtime subjects receive a temporary grant id only. Plaintext can be consumed by an authorized SDK runtime and is never shown in this UI.</div>
            </Card>
            <Select value={permissionSubjectType} onChange={event => setPermissionSubjectType(event.target.value as SubjectType)} aria-label="Permission subject type">
              {SUBJECT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
            <Input value={permissionSubjectId} onChange={event => setPermissionSubjectId(event.target.value)} placeholder="Runtime subject id" />
            <Input value={permissionReason} onChange={event => setPermissionReason(event.target.value)} placeholder="Why this secret is needed" />
            {runtimeGrant ? (
              <Card>
                <div className="os-inline-actions">
                  <Badge tone="success">granted</Badge>
                  <Button variant="danger" onClick={() => void revokeRuntimeGrant()} disabled={working}>Revoke grant</Button>
                </div>
                <div className="os-entity-copy" style={{ marginTop: 8 }}>Grant: {runtimeGrant.id}</div>
                <div className="os-entity-copy">Expires: {formatDate(runtimeGrant.expiresAt)}</div>
              </Card>
            ) : (
              <div className="os-empty-body">No temporary runtime grant active in this permission review.</div>
            )}
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
      {selected ? (
        <ConfirmModal
          open={deleteConfirm}
          onClose={() => setDeleteConfirm(false)}
          title={`Delete ${selected.name}?`}
          body="This permanently removes the encrypted value and blocks future runtime use. Existing audit records remain redacted."
          confirmLabel="Delete secret"
          tone="danger"
          busy={working}
          onConfirm={() => void deleteSecret()}
        />
      ) : null}
    </div>
  );
}
