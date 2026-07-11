'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  SearchBar,
  Select,
  Textarea,
} from '@/components/os/ui';

type MemoryEntry = {
  id: string;
  ownerAgentId: string;
  key: string;
  content: string;
  tags: string[];
  visibility: 'private' | 'workspace' | 'public';
  namespaceType: string;
  namespaceId: string | null;
  metadata: Record<string, unknown>;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type PermissionGrant = {
  id: string;
  sourceType: string;
  sourceId: string;
  permission: string;
  createdAt: string;
};

type Draft = {
  key: string;
  content: string;
  visibility: 'private' | 'workspace' | 'public';
  namespaceType: 'user' | 'agent' | 'subagent' | 'workspace' | 'workflow' | 'app' | 'skill';
  namespaceId: string;
  shareTargetAgentId: string;
};

type StatusFilter = 'active' | 'disabled' | 'all';
type ScopeFilter = 'all' | 'user' | 'agent' | 'subagent' | 'workspace' | 'workflow' | 'app' | 'skill';

const EMPTY_DRAFT: Draft = {
  key: '',
  content: '',
  visibility: 'private',
  namespaceType: 'agent',
  namespaceId: '',
  shareTargetAgentId: '',
};

function toneForVisibility(value: string): 'default' | 'accent' | 'success' {
  if (value === 'public') return 'success';
  if (value === 'workspace') return 'accent';
  return 'default';
}

type MemoryGroupKey = 'my' | 'agent' | 'privateSubagent' | 'workspace' | 'shared';

function hasSecretLikeMemoryText(value: string): boolean {
  return /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|secret|token|password|authorization)\s*[:=]\s*["']?)([^"'\s,}]{6,})/i.test(value)
    || /([A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|PASSWORD)[A-Z0-9_]*=)([^\s]{6,})/.test(value)
    || /\b(sk-[a-zA-Z0-9_-]{16,}|Bearer\s+[a-zA-Z0-9._-]{16,}|gh[pousr]_[a-zA-Z0-9_]{20,})\b/.test(value);
}

function memoryContainsSecret(entry: Pick<MemoryEntry, 'key' | 'content' | 'tags' | 'metadata'>): boolean {
  return hasSecretLikeMemoryText([entry.key, entry.content, ...entry.tags, JSON.stringify(entry.metadata ?? {})].join('\n'));
}

function scopeLabel(entry: Pick<MemoryEntry, 'namespaceType' | 'namespaceId'>): string {
  if (entry.namespaceType === 'workspace' && entry.namespaceId) return `project/workspace:${entry.namespaceId}`;
  return `${entry.namespaceType}${entry.namespaceId ? `:${entry.namespaceId}` : ''}`;
}

function classifyMemoryEntry(entry: MemoryEntry, viewerAgentId: string | null): MemoryGroupKey {
  if (viewerAgentId && entry.ownerAgentId !== viewerAgentId) return 'shared';
  if (entry.namespaceType === 'user') return 'my';
  if (entry.namespaceType === 'agent') return 'agent';
  if (entry.namespaceType === 'subagent' && entry.visibility === 'private') return 'privateSubagent';
  if (entry.namespaceType === 'workspace' || entry.visibility === 'workspace') return 'workspace';
  return 'shared';
}

export default function MemoryPage() {
  const shell = useApplicationShell();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [viewerAgentId, setViewerAgentId] = useState<string | null>(null);
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[]>([]);
  const [incomingGrants, setIncomingGrants] = useState<PermissionGrant[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const memoryRes = await fetch(`/api/memory?limit=100&includeDisabled=1${shell.activeWorkspaceId ? `&workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' });
      const memoryBody = memoryRes.ok ? await memoryRes.json() : {};
      setViewerAgentId(typeof memoryBody.viewerAgentId === 'string' ? memoryBody.viewerAgentId : null);
      setMemoryEntries(memoryBody.entries ?? []);
      setIncomingGrants(memoryBody.incomingGrants ?? []);
    } catch {
      setViewerAgentId(null);
      setMemoryEntries([]);
      setIncomingGrants([]);
    } finally {
      setLoading(false);
    }
  }, [shell.activeWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredMemory = useMemo(() => {
    const search = query.trim().toLowerCase();
    return memoryEntries.filter(entry => {
      if (statusFilter === 'active' && entry.disabled) return false;
      if (statusFilter === 'disabled' && !entry.disabled) return false;
      if (scopeFilter !== 'all' && entry.namespaceType !== scopeFilter) return false;
      if (!search) return true;
      return `${entry.key} ${entry.content} ${entry.namespaceType} ${entry.namespaceId ?? ''} ${entry.tags.join(' ')}`.toLowerCase().includes(search);
    });
  }, [memoryEntries, query, scopeFilter, statusFilter]);

  const memorySummary = useMemo(() => {
    const active = memoryEntries.filter(entry => !entry.disabled).length;
    const disabled = memoryEntries.filter(entry => entry.disabled).length;
    const projectScoped = memoryEntries.filter(entry => entry.namespaceType === 'workspace' && entry.namespaceId).length;
    return { active, disabled, projectScoped, total: memoryEntries.length };
  }, [memoryEntries]);

  const draftSecretBlocked = hasSecretLikeMemoryText(`${draft.key}\n${draft.content}\n${draft.namespaceId}`);

  const memoryGroups = useMemo(() => {
    const groups: Array<{ key: MemoryGroupKey; title: string; items: MemoryEntry[] }> = [
      { key: 'my', title: 'My Memory', items: [] },
      { key: 'agent', title: 'Agent Memory', items: [] },
      { key: 'privateSubagent', title: 'Incognito Subagent Memory', items: [] },
      { key: 'workspace', title: 'Workspace Memory', items: [] },
      { key: 'shared', title: 'Shared Memory', items: [] },
    ];
    const lookup = new Map(groups.map(group => [group.key, group]));
    for (const entry of filteredMemory) {
      lookup.get(classifyMemoryEntry(entry, viewerAgentId))?.items.push(entry);
    }
    return groups.filter(group => group.items.length > 0);
  }, [filteredMemory, viewerAgentId]);

  function resetDraft() {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
  }

  function startEdit(entry: MemoryEntry) {
    setEditingId(entry.id);
    setDraft({
      key: entry.key,
      content: entry.content,
      visibility: entry.visibility,
      namespaceType: entry.namespaceType as Draft['namespaceType'],
      namespaceId: entry.namespaceId ?? '',
      shareTargetAgentId: '',
    });
    setNotice('');
  }

  async function saveDraft() {
    if (!draft.key.trim() || !draft.content.trim()) return;
    if (draftSecretBlocked) {
      setNotice('Secrets must be stored in Vault, not memory.');
      return;
    }
    setSaving(true);
    setNotice('');
    try {
      const response = await fetch(editingId ? `/api/memory/${encodeURIComponent(editingId)}` : '/api/memory', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: draft.key.trim(),
          content: draft.content.trim(),
          visibility: draft.visibility,
          namespaceType: draft.namespaceType,
          namespaceId: draft.namespaceId.trim() || undefined,
          workspaceId: shell.activeWorkspaceId,
          shareTargetAgentId: editingId ? undefined : draft.shareTargetAgentId.trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(payload.error ?? payload.message ?? 'Memory save failed');
        return;
      }
      setNotice(editingId ? 'Memory updated.' : 'Memory created.');
      resetDraft();
      await load();
    } finally {
      setSaving(false);
    }
  }

  function useActiveProjectScope() {
    if (!shell.activeProjectId) {
      setNotice('Select a project before creating project-scoped memory.');
      return;
    }
    setDraft(current => ({ ...current, namespaceType: 'workspace', namespaceId: shell.activeProjectId ?? '' }));
    setNotice('Draft scoped to the active project.');
  }

  async function toggleEntryDisabled(entry: MemoryEntry) {
    const disabled = !entry.disabled;
    const confirmed = disabled ? window.confirm(`Disable memory "${entry.key}"? Super AgentOS will stop recalling it.`) : true;
    if (!confirmed) return;
    setNotice('');
    const response = await fetch(`/api/memory/${encodeURIComponent(entry.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        disabled,
        disabledReason: disabled ? 'Disabled from Memory controls' : undefined,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setNotice(response.ok ? disabled ? 'Memory disabled.' : 'Memory enabled.' : payload.error ?? payload.message ?? 'Memory status update failed');
    if (response.ok) await load();
  }

  async function removeEntry(entry: MemoryEntry) {
    const confirmed = window.confirm(`Delete memory "${entry.key}"?`);
    if (!confirmed) return;
    setNotice('');
    const params = new URLSearchParams({
      key: entry.key,
      namespaceType: entry.namespaceType,
    });
    if (entry.namespaceId) params.set('namespaceId', entry.namespaceId);
    const response = await fetch(`/api/memory?${params.toString()}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    setNotice(response.ok ? 'Memory deleted.' : payload.error ?? payload.message ?? 'Delete failed');
    if (response.ok) {
      if (editingId === entry.id) resetDraft();
      await load();
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/memory" />
      <WorkspaceShell activePath="/memory">
        <PageHeader
          eyebrow="Memory"
          title="Second Brain"
          subtitle="Timeline, collections, and knowledge graph for what AgentOS knows."
        />

        <div style={{ display: 'grid', gap: 16 }}>
          <Card>
            <div className="memory-graph-hero" aria-label="Knowledge graph visualization">
              {memoryGroups.flatMap(group => group.items.slice(0, 4)).slice(0, 10).map((entry, index) => (
                <span key={entry.id} style={{ '--x': `${12 + (index * 17) % 76}%`, '--y': `${18 + (index * 29) % 62}%` } as CSSProperties}>
                  {entry.key.slice(0, 18)}
                </span>
              ))}
            </div>
          </Card>

          <Card>
            <div className="os-entity-head" style={{ marginBottom: 12 }}>
              <div className="os-entity-title">Memory settings</div>
              <Badge tone="accent">{memorySummary.active} active</Badge>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
              <div className="os-entity-copy">Disabled memory stays visible here but is excluded from normal Super AgentOS recall.</div>
              <div className="os-entity-copy">Project-scoped memory uses the active project as its namespace boundary.</div>
              <div className="os-entity-copy">Secret-looking values are blocked. Store credentials in Vault.</div>
            </div>
            <div className="os-inline-actions" style={{ marginTop: 14 }}>
              <Badge tone="success">{memorySummary.active} recallable</Badge>
              <Badge tone="default">{memorySummary.disabled} disabled</Badge>
              <Badge tone="accent">{memorySummary.projectScoped} project scoped</Badge>
              <Badge tone="default">{memorySummary.total} total</Badge>
            </div>
          </Card>

          <Card>
            <div className="os-entity-head" style={{ marginBottom: 12 }}>
              <div className="os-entity-title">{editingId ? 'Edit memory' : 'Create memory'}</div>
              <Badge tone="accent">{editingId ? 'Update' : 'New'}</Badge>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <Input placeholder="Memory key" value={draft.key} onChange={event => setDraft(current => ({ ...current, key: event.target.value }))} disabled={Boolean(editingId)} title={editingId ? 'Memory keys are durable identifiers.' : undefined} />
              <Textarea placeholder="What should AgentOS remember?" value={draft.content} onChange={event => setDraft(current => ({ ...current, content: event.target.value }))} rows={5} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <Select value={draft.namespaceType} onChange={event => setDraft(current => ({ ...current, namespaceType: event.target.value as Draft['namespaceType'] }))}>
                  <option value="agent">Agent</option>
                  <option value="user">User</option>
                  <option value="subagent">Subagent</option>
                  <option value="workspace">Workspace</option>
                  <option value="workflow">Workflow</option>
                  <option value="app">App</option>
                  <option value="skill">Skill</option>
                </Select>
                <Select value={draft.visibility} onChange={event => setDraft(current => ({ ...current, visibility: event.target.value as Draft['visibility'] }))}>
                  <option value="private">Private</option>
                  <option value="workspace">Workspace</option>
                  <option value="public">Public</option>
                </Select>
              </div>
              <Input placeholder="Namespace id (optional for user or agent memory)" value={draft.namespaceId} onChange={event => setDraft(current => ({ ...current, namespaceId: event.target.value }))} />
              <Input placeholder="Share target agent id (optional, advanced)" value={draft.shareTargetAgentId} onChange={event => setDraft(current => ({ ...current, shareTargetAgentId: event.target.value }))} />
              <div className="os-inline-actions">
                <Button
                  onClick={() => void saveDraft()}
                  disabled={saving || !draft.key.trim() || !draft.content.trim() || draftSecretBlocked}
                  disabledReason={draftSecretBlocked ? 'Secrets belong in Vault, not memory.' : undefined}
                >
                  {saving ? 'Saving...' : editingId ? 'Update memory' : 'Create memory'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={useActiveProjectScope}
                  disabled={Boolean(editingId) || !shell.activeProjectId}
                  disabledReason={editingId ? 'Scope is fixed for existing memory.' : !shell.activeProjectId ? 'Select a project first.' : undefined}
                >
                  Use active project scope
                </Button>
                {editingId ? <Button variant="secondary" onClick={resetDraft}>Cancel</Button> : null}
              </div>
              <div className="os-entity-copy">Sharing uses the governed memory grant route. Super AgentOS reads these records with permission-aware context.</div>
              {draftSecretBlocked ? <div className="os-entity-copy">Detected credential-shaped text. Move that value to Vault before saving memory.</div> : null}
              {notice ? <div className="os-entity-copy">{notice}</div> : null}
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <SearchBar value={query} onChange={event => setQuery(event.target.value)} placeholder="Search memory timeline and collections" />
            <Select value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)} aria-label="Memory status filter">
              <option value="active">Active recall</option>
              <option value="disabled">Disabled</option>
              <option value="all">All memory</option>
            </Select>
            <Select value={scopeFilter} onChange={event => setScopeFilter(event.target.value as ScopeFilter)} aria-label="Memory scope filter">
              <option value="all">All scopes</option>
              <option value="user">User</option>
              <option value="agent">Agent</option>
              <option value="subagent">Subagent</option>
              <option value="workspace">Workspace/project</option>
              <option value="workflow">Workflow</option>
              <option value="app">App</option>
              <option value="skill">Skill</option>
            </Select>
          </div>

          {loading ? <LoadingState label="Loading memory" /> : filteredMemory.length === 0 ? (
            <EmptyState title="Nothing stored yet" body="Create memory entries from Studio, workflows, or subagents." />
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {memoryGroups.length === 0 ? (
                <Card>
                  <div className="os-empty-body">No memory entries match this filter.</div>
                </Card>
              ) : memoryGroups.map(group => (
                <Card key={group.key}>
                  <div className="os-entity-head" style={{ marginBottom: 12 }}>
                    <div className="os-entity-title">{group.title}</div>
                    <Badge tone={group.key === 'workspace' ? 'accent' : group.key === 'shared' ? 'success' : 'default'}>{group.items.length}</Badge>
                  </div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {group.items.map(entry => (
                      <div key={entry.id} className="memory-entry-card" data-memory-key={entry.key} style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                          <strong>{entry.key}</strong>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Badge tone={entry.disabled ? 'warning' : 'success'}>{entry.disabled ? 'disabled' : 'active'}</Badge>
                            <Badge tone={toneForVisibility(entry.visibility)}>{entry.visibility}</Badge>
                            <Badge tone="default">{scopeLabel(entry)}</Badge>
                          </div>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', marginBottom: 8, whiteSpace: 'pre-wrap' }}>{entry.content}</div>
                        {memoryContainsSecret(entry) ? <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>Credential-shaped text detected. Move this value to Vault.</div> : null}
                        <div style={{ color: 'var(--text-tertiary)', fontSize: 13, marginBottom: 10 }}>
                          Updated {new Date(entry.updatedAt).toLocaleString()} | Created {new Date(entry.createdAt).toLocaleString()}
                        </div>
                        <div className="os-inline-actions">
                          <Button variant="secondary" onClick={() => startEdit(entry)}>Edit</Button>
                          <Button variant="secondary" onClick={() => void toggleEntryDisabled(entry)}>{entry.disabled ? 'Enable' : 'Disable'}</Button>
                          <Button variant="danger" onClick={() => void removeEntry(entry)}>Delete</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}

              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Incoming grants</div>
                  <Badge tone="accent">{incomingGrants.length}</Badge>
                </div>
                {incomingGrants.length === 0 ? (
                  <div className="os-empty-body">No external memory grants are visible to this agent.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {incomingGrants.map(grant => (
                      <div key={grant.id} style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <strong>{grant.permission}</strong>
                          <Badge tone="default">{grant.sourceType}</Badge>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 6 }}>Source: {grant.sourceId}</div>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: 13, marginTop: 4 }}>{new Date(grant.createdAt).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

            </div>
          )}
        </div>
      </WorkspaceShell>
    </div>
  );
}
