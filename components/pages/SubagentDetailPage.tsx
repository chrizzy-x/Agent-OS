'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { summarizeAgentResult } from '@/src/ui/presenters';
import { fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSessionAuthState } from '@/src/auth/browser-session';
import {
  ActivityFeed,
  Badge,
  Button,
  Card,
  ConfirmationDialog,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  PermissionCard,
  SearchBar,
  Tabs,
  Textarea,
} from '@/components/os/ui';

type SubagentPayload = {
  subagent: {
    id: string;
    name: string;
    description: string | null;
    instructions: string;
    status: string;
    workspaceId: string;
    projectId: string | null;
    visibility: 'private' | 'workspace' | 'public';
    exposedCapabilities: string[];
  };
  profile: {
    model: string;
    temperature: number;
    behavior: string;
    allowedApps?: string[];
    allowedTools: string[];
    permissions: Record<string, boolean>;
  };
  installedSkills: Array<{ skill?: { name?: string; slug?: string; category?: string } }>;
  vaultAssignments: Array<{ secret?: { name?: string; masked_value?: string } }>;
  memory: Array<{ id: string; key: string; content: string; visibility: string }>;
  grants: Array<{ id: string; targetId: string; permission: string; revokedAt: string | null }>;
  fileCount: number;
  activity: Array<{ primitive: string; operation: string; success: boolean; created_at: string }>;
  workflows: Array<{ id: string; name: string; summary: string | null; status: string }>;
};

type InstalledApp = {
  id: string;
  name: string;
  slug: string;
  description: string;
};

type ProjectOption = {
  id: string;
  name: string;
  status: string;
};

const TABS = ['Configure', 'Instructions', 'Assignments', 'Memory', 'Skills', 'Apps', 'Tools', 'Permissions', 'Activity'];

function visibilityLabel(value: 'private' | 'workspace' | 'public'): string {
  if (value === 'private') return 'Incognito';
  if (value === 'workspace') return 'Workflow';
  return 'Public';
}

function statusLabel(value: string): string {
  if (value === 'archived') return 'Paused';
  return value.replace(/^\w/, char => char.toUpperCase());
}

function capabilityToken(kind: 'app' | 'skill', slug: string): string {
  return `${kind}:${slug}`;
}

function manualCapabilities(values: string[] = []): string[] {
  return values.filter(item => !item.startsWith('skill:') && !item.startsWith('app:'));
}

type SubagentDetailPageProps = {
  activePath?: string;
  basePath?: string;
  listLabel?: string;
};

export default function SubagentDetailPage({
  activePath = '/subagents',
}: SubagentDetailPageProps) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<SubagentPayload | null>(null);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [tab, setTab] = useState('Configure');
  const [command, setCommand] = useState('');
  const [result, setResult] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [shareTarget, setShareTarget] = useState('');
  const [workflowAssignment, setWorkflowAssignment] = useState('');
  const [memoryAssignment, setMemoryAssignment] = useState('');
  const [projectAssignment, setProjectAssignment] = useState('');
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const sessionState = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
      setAuthState(sessionState.state);
      if (!sessionState.session) {
        setPayload(null);
        return;
      }
      const { response, authState: nextAuthState } = await fetchWithBrowserSession(`/api/subagents/${id}`, { cache: 'no-store' });
      setAuthState(nextAuthState);
      const data = await response.json();
      const nextPayload = response.ok ? data as SubagentPayload : null;
      setPayload(nextPayload);
      setProjectAssignment(nextPayload?.subagent.projectId ?? '');
      if (nextPayload) {
        const [appsRes, projectsRes] = await Promise.all([
          fetchWithBrowserSession(`/api/apps/installed?workspaceId=${encodeURIComponent(nextPayload.subagent.workspaceId)}`, { cache: 'no-store' }),
          fetchWithBrowserSession(`/api/projects?workspace=${encodeURIComponent(nextPayload.subagent.workspaceId)}`, { cache: 'no-store' }),
        ]);
        const appsData = await appsRes.response.json().catch(() => ({})) as { installedApps?: Array<Record<string, unknown>> };
        const projectsData = await projectsRes.response.json().catch(() => ({})) as { projects?: ProjectOption[] };
        setInstalledApps((appsData.installedApps ?? []).map(item => ({
          id: String(item.id ?? item.slug ?? ''),
          name: String(item.name ?? 'App'),
          slug: String(item.slug ?? item.id ?? ''),
          description: String(item.description ?? 'Installed app'),
        })).filter(item => item.id && item.slug));
        setProjects(projectsData.projects ?? []);
      }
    } catch {
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) void load();
  }, [id]);

  const subagent = payload?.subagent ?? null;
  const skillNames = useMemo(
    () => payload?.installedSkills.map(item => item.skill?.name || item.skill?.slug || 'Skill') ?? [],
    [payload],
  );
  const attachedAppNames = useMemo(() => {
    const tokens = subagent?.exposedCapabilities ?? [];
    const names = tokens
      .filter(item => item.startsWith('app:'))
      .map(item => item.slice('app:'.length))
      .map(slug => installedApps.find(app => app.slug === slug)?.name ?? slug);
    return names.length ? names.join(', ') : 'No apps attached';
  }, [installedApps, subagent?.exposedCapabilities]);

  async function save() {
    if (!subagent) return;
    setSaving(true);
    setMessage('');
    const result = await fetchWithBrowserSession(`/api/subagents/${subagent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subagent),
    });
    const body = await result.response.json().catch(() => ({})) as { error?: string; message?: string };
    setMessage(result.response.ok ? 'Subagent saved.' : body.error ?? body.message ?? 'Save failed.');
    setSaving(false);
    if (result.response.ok) await load();
  }

  async function testRun() {
    if (!subagent || !command.trim()) return;
    const res = await fetchWithBrowserSession(`/api/subagents/${subagent.id}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    const data = await res.response.json();
    setResult(summarizeAgentResult(data.result ?? data));
  }

  async function shareSubagent() {
    if (!subagent || !shareTarget.trim()) return;
    await fetchWithBrowserSession('/api/permissions/grants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceType: 'subagent',
        sourceId: subagent.id,
        targetType: 'agent',
        targetId: shareTarget.trim(),
        permission: 'agent:invoke',
      }),
    });
    setShareTarget('');
    await load();
  }

  async function revokeShare(grantId: string) {
    await fetchWithBrowserSession(`/api/permissions/grants?grantId=${encodeURIComponent(grantId)}`, {
      method: 'DELETE',
    });
    await load();
  }

  async function assignResource(targetType: 'workflow' | 'memory', targetId: string) {
    if (!subagent || !targetId) return;
    await fetchWithBrowserSession('/api/permissions/grants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceType: 'subagent',
        sourceId: subagent.id,
        targetType,
        targetId,
        permission: `${targetType}:assigned`,
        scope: 'assignment',
      }),
    });
    setWorkflowAssignment('');
    setMemoryAssignment('');
    await load();
  }

  async function assignProject() {
    if (!subagent || !projectAssignment) return;
    setSaving(true);
    setMessage('');
    const result = await fetchWithBrowserSession(`/api/subagents/${subagent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: projectAssignment }),
    });
    const body = await result.response.json().catch(() => ({})) as { error?: string; message?: string };
    setMessage(result.response.ok ? 'Project assignment updated.' : body.error ?? body.message ?? 'Project assignment failed.');
    setSaving(false);
    if (result.response.ok) await load();
  }

  async function duplicateSubagent() {
    if (!subagent) return;
    setSaving(true);
    setMessage('');
    const result = await fetchWithBrowserSession('/api/subagents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: subagent.workspaceId,
        projectId: subagent.projectId,
        name: `${subagent.name} copy`,
        description: subagent.description,
        instructions: subagent.instructions,
        visibility: subagent.visibility,
        exposedCapabilities: subagent.exposedCapabilities,
      }),
    });
    const body = await result.response.json().catch(() => ({})) as { subagent?: { id?: string }; error?: string; message?: string };
    setSaving(false);
    if (!result.response.ok || !body.subagent?.id) {
      setMessage(body.error ?? body.message ?? 'Duplicate failed.');
      return;
    }
    router.push(`/subagents/${encodeURIComponent(body.subagent.id)}`);
  }

  async function updateStatus(status: 'active' | 'archived') {
    if (!subagent) return;
    setSaving(true);
    setMessage('');
    const result = await fetchWithBrowserSession(`/api/subagents/${subagent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const body = await result.response.json().catch(() => ({})) as { error?: string; message?: string };
    setMessage(result.response.ok ? (status === 'active' ? 'Subagent resumed.' : 'Subagent paused.') : body.error ?? body.message ?? 'Status update failed.');
    setSaving(false);
    if (result.response.ok) await load();
  }

  async function toggleApp(slug: string) {
    if (!subagent) return;
    const token = capabilityToken('app', slug);
    const next = subagent.exposedCapabilities.includes(token)
      ? subagent.exposedCapabilities.filter(item => item !== token)
      : [...subagent.exposedCapabilities, token];
    setPayload(current => current ? { ...current, subagent: { ...current.subagent, exposedCapabilities: next } } : current);
  }

  async function deleteSubagent() {
    if (!subagent) return;
    const result = await fetchWithBrowserSession(`/api/subagents/${subagent.id}`, { method: 'DELETE' });
    if (result.response.ok) router.push('/subagents');
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath={activePath} />
      <WorkspaceShell
        activePath={activePath}
        aside={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Run test</div>
            <SearchBar value={command} onChange={event => setCommand(event.target.value)} placeholder="Test instruction" />
            <div style={{ marginTop: 12 }}>
              <Button onClick={() => void testRun()}>Run</Button>
            </div>
            {result ? <div className="os-entity-copy" style={{ marginTop: 12 }}>{result}</div> : null}
          </Card>
        )}
      >
        {loading ? <LoadingState label="Loading subagent" /> : !payload || !subagent ? (
          authState === 'expired'
            ? <EmptyState title="Session expired" body="Sign in again to manage this subagent." action={<Button href="/signin">Sign in again</Button>} />
            : authState === 'signed_out'
              ? <EmptyState title="Sign in required" body="Sign in to manage this subagent." action={<Button href="/signin">Sign in</Button>} />
              : <EmptyState title="Subagent not found" body="This incognito subagent is unavailable or you do not have access." />
        ) : (
          <>
            <PageHeader
              eyebrow="Subagent"
              title={subagent.name}
              subtitle={subagent.description ?? 'Incognito Mode subagent'}
              actions={(
                <>
                  <Badge tone={subagent.status === 'active' ? 'success' : 'warning'}>{statusLabel(subagent.status)}</Badge>
                  <Badge tone={subagent.visibility === 'public' ? 'success' : subagent.visibility === 'workspace' ? 'accent' : 'default'}>{visibilityLabel(subagent.visibility)}</Badge>
                  <Button variant="secondary" onClick={() => void save()}>{saving ? 'Saving...' : 'Save'}</Button>
                  <Button variant="secondary" onClick={() => void duplicateSubagent()} disabled={saving}>Duplicate</Button>
                  <Button variant="secondary" onClick={() => void updateStatus(subagent.status === 'archived' ? 'active' : 'archived')} disabled={saving}>{subagent.status === 'archived' ? 'Resume' : 'Pause'}</Button>
                  <Button variant="destructive" onClick={() => setDeleteOpen(true)}>Delete</Button>
                  <Button onClick={() => void testRun()}>Run test</Button>
                </>
              )}
            />
            {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}
            <Card>
              <Tabs tabs={TABS.map(item => ({ key: item, label: item }))} active={tab} onChange={setTab} />
            </Card>

            {tab === 'Configure' ? (
              <Card>
                <div style={{ display: 'grid', gap: 12 }}>
                  <label className="os-field-label" htmlFor="subagent-name">Subagent name</label>
                  <Input id="subagent-name" value={subagent.name} onChange={event => setPayload(current => current ? { ...current, subagent: { ...current.subagent, name: event.target.value } } : current)} />
                  <label className="os-field-label" htmlFor="subagent-description">Description</label>
                  <Input id="subagent-description" value={subagent.description ?? ''} onChange={event => setPayload(current => current ? { ...current, subagent: { ...current.subagent, description: event.target.value } } : current)} placeholder="Description" />
                  <div style={{ display: 'grid', gridTemplateColumns: '200px minmax(0, 1fr)', gap: 12 }}>
                    <select
                      aria-label="Subagent type"
                      value={subagent.visibility}
                      onChange={event => setPayload(current => current ? { ...current, subagent: { ...current.subagent, visibility: event.target.value as 'private' | 'workspace' | 'public' } } : current)}
                      style={{ minHeight: 44, borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', color: 'inherit', padding: '0 12px' }}
                    >
                      <option value="private">Incognito</option>
                      <option value="workspace">Workflow</option>
                      <option value="public">Public</option>
                    </select>
                    <Input
                      value={manualCapabilities(subagent.exposedCapabilities).join(', ')}
                      onChange={event => setPayload(current => current ? {
                        ...current,
                        subagent: {
                          ...current.subagent,
                          exposedCapabilities: [
                            ...event.target.value.split(',').map(item => item.trim()).filter(Boolean),
                            ...current.subagent.exposedCapabilities.filter(item => item.startsWith('skill:') || item.startsWith('app:')),
                          ],
                        },
                      } : current)}
                      placeholder="Manual capabilities"
                    />
                  </div>
                  <div className="os-entity-copy">Model: {payload.profile.model} | Temperature: {payload.profile.temperature} | Behavior: {payload.profile.behavior}</div>
                  <div className="os-entity-copy">Memory scope: subagent namespace only. Memory: {payload.memory.length} | Files: {payload.fileCount} | Vault: {payload.vaultAssignments.length}</div>
                  <div className="os-entity-copy">Attached apps: {attachedAppNames}</div>
                  <label className="os-inline-actions">
                    <input
                      type="checkbox"
                      checked={subagent.visibility === 'private'}
                      onChange={event => setPayload(current => current ? {
                        ...current,
                        subagent: { ...current.subagent, visibility: event.target.checked ? 'private' : 'workspace' },
                      } : current)}
                    />
                    Incognito Mode
                  </label>
                </div>
              </Card>
            ) : null}

            {tab === 'Instructions' ? (
              <Card>
                <label className="os-field-label" htmlFor="subagent-instructions">Instructions</label>
                <Textarea id="subagent-instructions" value={subagent.instructions} onChange={event => setPayload(current => current ? { ...current, subagent: { ...current.subagent, instructions: event.target.value } } : current)} />
              </Card>
            ) : null}

            {tab === 'Memory' ? (
              <Card>
                <div style={{ display: 'grid', gap: 12 }}>
                  {payload.memory.length > 0 ? payload.memory.map(item => (
                    <div key={item.id} style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                        <strong>{item.key}</strong>
                        <Badge tone={item.visibility === 'public' ? 'success' : item.visibility === 'workspace' ? 'accent' : 'default'}>{item.visibility}</Badge>
                      </div>
                      <div className="os-entity-copy">{item.content}</div>
                    </div>
                  )) : <div className="os-entity-copy">No memory entries yet.</div>}
                </div>
              </Card>
            ) : null}

            {tab === 'Assignments' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <Card>
                  <div style={{ width: '100%', display: 'grid', gap: 10 }}>
                    <div className="os-entity-title">Project Assignment</div>
                    <select className="os-select" aria-label="Project assignment" value={projectAssignment} onChange={event => setProjectAssignment(event.target.value)}>
                      <option value="">Select project</option>
                      {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <Button onClick={() => void assignProject()} disabled={!projectAssignment || projectAssignment === subagent.projectId} disabledReason={!projectAssignment ? 'Select a project first.' : projectAssignment === subagent.projectId ? 'This subagent is already assigned to that project.' : undefined}>Assign project</Button>
                  </div>
                </Card>
                <Card>
                  <div style={{ width: '100%', display: 'grid', gap: 10 }}>
                    <div className="os-entity-title">Workflow Assignment</div>
                    <select className="os-select" value={workflowAssignment} onChange={event => setWorkflowAssignment(event.target.value)}>
                      <option value="">Select workflow</option>
                      {payload.workflows.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <Button onClick={() => void assignResource('workflow', workflowAssignment)} disabled={!workflowAssignment}>Assign workflow</Button>
                  </div>
                </Card>
                <Card>
                  <div style={{ width: '100%', display: 'grid', gap: 10 }}>
                    <div className="os-entity-title">Memory Assignment</div>
                    <select className="os-select" value={memoryAssignment} onChange={event => setMemoryAssignment(event.target.value)}>
                      <option value="">Select memory</option>
                      {payload.memory.map(item => <option key={item.id} value={item.id}>{item.key}</option>)}
                    </select>
                    <Button onClick={() => void assignResource('memory', memoryAssignment)} disabled={!memoryAssignment}>Assign memory</Button>
                  </div>
                </Card>
                <Card>
                  <div className="os-entity-title">Current Assignments</div>
                  {payload.grants.filter(item => !item.revokedAt && item.permission.endsWith(':assigned')).map(item => (
                    <div key={item.id} className="os-entity-head">
                      <span className="os-entity-copy">{item.permission} · {item.targetId}</span>
                      <Button variant="secondary" onClick={() => void revokeShare(item.id)}>Remove</Button>
                    </div>
                  ))}
                </Card>
              </div>
            ) : null}

            {tab === 'Skills' ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Installed skills</div>
                <div className="os-entity-copy">{skillNames.join(', ') || 'No installed skills'}</div>
              </Card>
            ) : null}

            {tab === 'Apps' ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Attached apps</div>
                <div className="os-entity-copy" style={{ marginBottom: 12 }}>Apps are attached as capability tokens for routing. Dedicated app-assignment records will replace this when the backend supports them.</div>
                {installedApps.length ? (
                  <div className="os-drawer-stack">
                    {installedApps.map(app => (
                      <label key={app.id} className="os-inline-actions">
                        <input
                          type="checkbox"
                          checked={subagent.exposedCapabilities.includes(capabilityToken('app', app.slug))}
                          onChange={() => void toggleApp(app.slug)}
                        />
                        {app.name}
                      </label>
                    ))}
                  </div>
                ) : <div className="os-entity-copy">Install an app before attaching one to this subagent.</div>}
              </Card>
            ) : null}

            {tab === 'Tools' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {payload.profile.allowedTools.map(tool => (
                  <PermissionCard key={tool} title={tool} description="Allowed MCP or primitive tool for this incognito subagent." required />
                ))}
              </div>
            ) : null}

            {tab === 'Permissions' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <Card>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div className="os-entity-title">Share subagent</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12 }}>
                      <Input value={shareTarget} onChange={event => setShareTarget(event.target.value)} placeholder="Target agent id" />
                      <Button onClick={() => void shareSubagent()}>Share</Button>
                    </div>
                    {payload.grants.filter(item => !item.revokedAt).length > 0 ? payload.grants.filter(item => !item.revokedAt).map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <span>{item.permission} to {item.targetId}</span>
                        <Button variant="secondary" onClick={() => void revokeShare(item.id)}>Revoke</Button>
                      </div>
                    )) : <div className="os-entity-copy">No active shares.</div>}
                  </div>
                </Card>
                {Object.entries(payload.profile.permissions).map(([key, value]) => (
                  <PermissionCard key={key} title={key} description="Workspace-scoped permission toggle." required={value} />
                ))}
                {payload.vaultAssignments.map((item, index) => (
                  <PermissionCard key={`${item.secret?.name ?? 'secret'}-${index}`} title={item.secret?.name ?? 'Vault secret'} description={item.secret?.masked_value ?? 'Assigned from Vault'} required />
                ))}
              </div>
            ) : null}

            {tab === 'Activity' ? (
              <ActivityFeed
                items={payload.activity.map((item, index) => ({
                  id: `${item.operation}-${index}`,
                  title: item.operation,
                  subtitle: item.primitive,
                  status: item.success ? 'success' : 'error',
                  time: new Date(item.created_at).toLocaleString(),
                }))}
              />
            ) : null}
          </>
        )}
      </WorkspaceShell>
      <ConfirmationDialog
        open={deleteOpen}
        title="Delete subagent"
        body={`Delete ${subagent?.name ?? 'this subagent'}? The backend removes it from active use and keeps history available for audit where supported.`}
        confirmLabel="Delete"
        busy={saving}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void deleteSubagent()}
      />
    </div>
  );
}
