'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { Badge, Card, EmptyState, LoadingState, PageHeader, SearchBar } from '@/components/os/ui';

type MemoryEntry = {
  id: string;
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

function toneForVisibility(value: string): 'default' | 'accent' | 'success' {
  if (value === 'public') return 'success';
  if (value === 'workspace') return 'accent';
  return 'default';
}

export default function MemoryPage() {
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[]>([]);
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [memoryRes, filesRes] = await Promise.all([
        fetch('/api/memory?limit=100', { cache: 'no-store' }),
        fetch('/api/files?limit=100', { cache: 'no-store' }),
      ]);
      const [memoryBody, filesBody] = await Promise.all([
        memoryRes.ok ? memoryRes.json() : Promise.resolve({}),
        filesRes.ok ? filesRes.json() : Promise.resolve({}),
      ]);
      setMemoryEntries(memoryBody.entries ?? []);
      setFileEntries(filesBody.entries ?? []);
    } catch {
      setMemoryEntries([]);
      setFileEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

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

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/memory" />
      <WorkspaceShell activePath="/memory">
        <PageHeader
          eyebrow="Governance"
          title="Memory and files"
          subtitle="Inspect private, workspace, and public memory records and governed files from one surface."
        />

        <SearchBar value={query} onChange={event => setQuery(event.target.value)} placeholder="Search memory and files" />

        {loading ? <LoadingState label="Loading memory" /> : filteredMemory.length === 0 && filteredFiles.length === 0 ? (
          <EmptyState title="Nothing stored yet" body="Create memory entries, artifacts, or governed files from Studio, workflows, or subagents." />
        ) : (
          <div style={{ display: 'grid', gap: 16 }}>
            <Card>
              <div className="os-entity-head" style={{ marginBottom: 12 }}>
                <div className="os-entity-title">Memory</div>
                <Badge tone="accent">{filteredMemory.length}</Badge>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {filteredMemory.map(entry => (
                  <div key={entry.id} style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                      <strong>{entry.key}</strong>
                      <Badge tone={toneForVisibility(entry.visibility)}>{entry.visibility}</Badge>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{entry.content}</div>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>{entry.namespaceType}{entry.namespaceId ? `:${entry.namespaceId}` : ''}</div>
                  </div>
                ))}
              </div>
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
      </WorkspaceShell>
    </div>
  );
}
