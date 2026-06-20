'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { summarizeAgentResult } from '@/src/ui/presenters';
import {
  ActivityFeed,
  Badge,
  Button,
  Card,
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
    visibility: 'private' | 'workspace' | 'public';
    exposedCapabilities: string[];
  };
  profile: {
    model: string;
    temperature: number;
    behavior: string;
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

const TABS = ['Configure', 'Instructions', 'Assignments', 'Memory', 'Skills', 'Tools', 'Permissions', 'Activity'];

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
  const [tab, setTab] = useState('Configure');
  const [command, setCommand] = useState('');
  const [result, setResult] = useState('');
  const [saving, setSaving] = useState(false);
  const [shareTarget, setShareTarget] = useState('');
  const [workflowAssignment, setWorkflowAssignment] = useState('');
  const [memoryAssignment, setMemoryAssignment] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/subagents/${id}`, { cache: 'no-store' });
      const data = await res.json();
      setPayload(data);
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

  async function save() {
    if (!subagent) return;
    setSaving(true);
    await fetch(`/api/subagents/${subagent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subagent),
    });
    setSaving(false);
    await load();
  }

  async function testRun() {
    if (!subagent || !command.trim()) return;
    const res = await fetch(`/api/subagents/${subagent.id}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    const data = await res.json();
    setResult(summarizeAgentResult(data.result ?? data));
  }

  async function shareSubagent() {
    if (!subagent || !shareTarget.trim()) return;
    await fetch('/api/permissions/grants', {
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
    await fetch(`/api/permissions/grants?grantId=${encodeURIComponent(grantId)}`, {
      method: 'DELETE',
    });
    await load();
  }

  async function assignResource(targetType: 'workflow' | 'memory', targetId: string) {
    if (!subagent || !targetId) return;
    await fetch('/api/permissions/grants', {
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

  async function deleteSubagent() {
    if (!subagent || !window.confirm(`Delete ${subagent.name}?`)) return;
    const response = await fetch(`/api/subagents/${subagent.id}`, { method: 'DELETE' });
    if (response.ok) router.push('/subagents');
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath={activePath} />
      <WorkspaceShell
        activePath="/agents"
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
        {loading ? <LoadingState label="Loading agent" /> : !payload || !subagent ? (
          <EmptyState title="Subagent not found" body="This private agent is unavailable or you do not have access." />
        ) : (
          <>
            <PageHeader
              eyebrow="Agent details"
              title={subagent.name}
              subtitle={subagent.description ?? 'Private agent'}
              actions={(
                <>
                  <Badge tone="success">{subagent.status}</Badge>
                  <Badge tone={subagent.visibility === 'public' ? 'success' : subagent.visibility === 'workspace' ? 'accent' : 'default'}>{subagent.visibility}</Badge>
                  <Button variant="secondary" onClick={() => void save()}>{saving ? 'Saving...' : 'Save'}</Button>
                  <Button variant="danger" onClick={() => void deleteSubagent()}>Delete</Button>
                  <Button onClick={() => void testRun()}>Run test</Button>
                </>
              )}
            />
            <Card>
              <Tabs tabs={TABS.map(item => ({ key: item, label: item }))} active={tab} onChange={setTab} />
            </Card>

            {tab === 'Configure' ? (
              <Card>
                <div style={{ display: 'grid', gap: 12 }}>
                  <Input value={subagent.name} onChange={event => setPayload(current => current ? { ...current, subagent: { ...current.subagent, name: event.target.value } } : current)} />
                  <Input value={subagent.description ?? ''} onChange={event => setPayload(current => current ? { ...current, subagent: { ...current.subagent, description: event.target.value } } : current)} placeholder="Description" />
                  <div style={{ display: 'grid', gridTemplateColumns: '200px minmax(0, 1fr)', gap: 12 }}>
                    <select
                      value={subagent.visibility}
                      onChange={event => setPayload(current => current ? { ...current, subagent: { ...current.subagent, visibility: event.target.value as 'private' | 'workspace' | 'public' } } : current)}
                      style={{ minHeight: 44, borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', color: 'inherit', padding: '0 12px' }}
                    >
                      <option value="private">private</option>
                      <option value="workspace">workspace</option>
                      <option value="public">public</option>
                    </select>
                    <Input
                      value={subagent.exposedCapabilities.join(', ')}
                      onChange={event => setPayload(current => current ? {
                        ...current,
                        subagent: {
                          ...current.subagent,
                          exposedCapabilities: event.target.value.split(',').map(item => item.trim()).filter(Boolean),
                        },
                      } : current)}
                      placeholder="Exposed capabilities"
                    />
                  </div>
                  <div className="os-entity-copy">Model: {payload.profile.model} | Temperature: {payload.profile.temperature} | Behavior: {payload.profile.behavior}</div>
                  <div className="os-entity-copy">Memory: {payload.memory.length} | Files: {payload.fileCount} | Vault: {payload.vaultAssignments.length}</div>
                  <label className="os-inline-actions">
                    <input
                      type="checkbox"
                      checked={subagent.visibility === 'private'}
                      onChange={event => setPayload(current => current ? {
                        ...current,
                        subagent: { ...current.subagent, visibility: event.target.checked ? 'private' : 'workspace' },
                      } : current)}
                    />
                    Private Mode
                  </label>
                </div>
              </Card>
            ) : null}

            {tab === 'Instructions' ? (
              <Card>
                <Textarea value={subagent.instructions} onChange={event => setPayload(current => current ? { ...current, subagent: { ...current.subagent, instructions: event.target.value } } : current)} />
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

            {tab === 'Tools' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {payload.profile.allowedTools.map(tool => (
                  <PermissionCard key={tool} title={tool} description="Allowed MCP or primitive tool for this private agent." required />
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
    </div>
  );
}
