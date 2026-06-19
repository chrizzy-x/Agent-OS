'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  visibility: 'private' | 'workspace' | 'public';
  namespaceType: string;
  namespaceId: string | null;
  updatedAt: string;
};

type FileEntry = {
  id: string;
  path: string;
  visibility: 'private' | 'workspace' | 'public';
  metadata: Record<string, unknown>;
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
  const [viewerAgentId, setViewerAgentId] = useState<string | null>(null);
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[]>([]);
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [incomingGrants, setIncomingGrants] = useState<PermissionGrant[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [memoryRes, filesRes] = await Promise.all([
        fetch(`/api/memory?limit=100${shell.activeWorkspaceId ? `&workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' }),
        fetch(`/api/files?limit=100${shell.activeWorkspaceId ? `&workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' }),
      ]);
      const [memoryBody, filesBody] = await Promise.all([
        memoryRes.ok ? memoryRes.json() : Promise.resolve({}),
        filesRes.ok ? filesRes.json() : Promise.resolve({}),
      ]);
      setViewerAgentId(typeof memoryBody.viewerAgentId === 'string' ? memoryBody.viewerAgentId : null);
      setMemoryEntries(memoryBody.entries ?? []);
      setFileEntries(filesBody.entries ?? []);
      setIncomingGrants(memoryBody.incomingGrants ?? []);
    } catch {
      setViewerAgentId(null);
      setMemoryEntries([]);
      setFileEntries([]);
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
    if (!search) return memoryEntries;
    return memoryEntries.filter(entry =>
      `${entry.key} ${entry.content} ${entry.namespaceType} ${entry.namespaceId ?? ''}`.toLowerCase().includes(search),
    );
  }, [memoryEntries, query]);

  const filteredFiles = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return fileEntries;
    return fileEntries.filter(entry =>
      `${entry.path} ${String(entry.metadata.kind ?? 'file')}`.toLowerCase().includes(search),
    );
  }, [fileEntries, query]);

  const memoryGroups = useMemo(() => {
    const groups: Array<{ key: MemoryGroupKey; title: string; items: MemoryEntry[] }> = [
      { key: 'my', title: 'My Memory', items: [] },
      { key: 'agent', title: 'Agent Memory', items: [] },
      { key: 'privateSubagent', title: 'Private Subagent Memory', items: [] },
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
    setSaving(true);
    setNotice('');
    try {
      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: draft.key.trim(),
          content: draft.content.trim(),
          visibility: draft.visibility,
          namespaceType: draft.namespaceType,
          namespaceId: draft.namespaceId.trim() || undefined,
          workspaceId: shell.activeWorkspaceId,
          shareTargetAgentId: draft.shareTargetAgentId.trim() || undefined,
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
          eyebrow="Governance"
          title="Memory and files"
          subtitle="Create, edit, audit, and remove governed memory records and review governed files from one surface."
        />

        <div style={{ display: 'grid', gap: 16 }}>
          <Card>
            <div className="os-entity-head" style={{ marginBottom: 12 }}>
              <div className="os-entity-title">{editingId ? 'Edit memory' : 'Create memory'}</div>
              <Badge tone="accent">{editingId ? 'Update' : 'New'}</Badge>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <Input placeholder="Memory key" value={draft.key} onChange={event => setDraft(current => ({ ...current, key: event.target.value }))} />
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
                <Button onClick={() => void saveDraft()} disabled={saving || !draft.key.trim() || !draft.content.trim()}>{saving ? 'Saving...' : editingId ? 'Update memory' : 'Create memory'}</Button>
                {editingId ? <Button variant="secondary" onClick={resetDraft}>Cancel</Button> : null}
              </div>
              <div className="os-entity-copy">Sharing uses the governed memory grant route. Super AgentOS reads these records with permission-aware context.</div>
              {notice ? <div className="os-entity-copy">{notice}</div> : null}
            </div>
          </Card>

          <SearchBar value={query} onChange={event => setQuery(event.target.value)} placeholder="Search memory and files" />

          {loading ? <LoadingState label="Loading memory" /> : filteredMemory.length === 0 && filteredFiles.length === 0 ? (
            <EmptyState title="Nothing stored yet" body="Create memory entries, artifacts, or governed files from Studio, workflows, or subagents." />
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
                      <div key={entry.id} style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                          <strong>{entry.key}</strong>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Badge tone={toneForVisibility(entry.visibility)}>{entry.visibility}</Badge>
                            <Badge tone="default">{entry.namespaceType}{entry.namespaceId ? `:${entry.namespaceId}` : ''}</Badge>
                          </div>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', marginBottom: 8, whiteSpace: 'pre-wrap' }}>{entry.content}</div>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: 13, marginBottom: 10 }}>{new Date(entry.updatedAt).toLocaleString()}</div>
                        <div className="os-inline-actions">
                          <Button variant="secondary" onClick={() => startEdit(entry)}>Edit</Button>
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

              <Card>
                <div className="os-entity-head" style={{ marginBottom: 12 }}>
                  <div className="os-entity-title">Files and artifacts</div>
                  <Badge tone="default">{filteredFiles.length}</Badge>
                </div>
                <div style={{ display: 'grid', gap: 12 }}>
                  {filteredFiles.map(entry => (
                    <div key={entry.id} style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                        <strong style={{ wordBreak: 'break-word' }}>{entry.path}</strong>
                        <Badge tone={toneForVisibility(entry.visibility)}>{entry.visibility}</Badge>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{String(entry.metadata.kind ?? 'file')}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      </WorkspaceShell>
    </div>
  );
}
