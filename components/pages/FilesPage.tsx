'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { Badge, Button, Card, EmptyState, Input, LoadingState, PageHeader, SearchBar, Select } from '@/components/os/ui';

type FileEntry = {
  id: string;
  path: string;
  sizeBytes: number;
  contentType: string | null;
  visibility: 'private' | 'workspace' | 'public';
  metadata: Record<string, unknown>;
  updatedAt: string;
};

type DraftFile = {
  path: string;
  content: string;
  contentType: string;
  visibility: 'private' | 'workspace' | 'public';
};

const EMPTY_DRAFT: DraftFile = {
  path: '',
  content: '',
  contentType: 'text/plain',
  visibility: 'private',
};

function toneForVisibility(value: string): 'default' | 'accent' | 'success' {
  if (value === 'public') return 'success';
  if (value === 'workspace') return 'accent';
  return 'default';
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export default function FilesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<DraftFile>(EMPTY_DRAFT);
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<{ title: string; body: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/files?limit=200', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      setEntries(payload.entries ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return entries;
    return entries.filter(entry =>
      `${entry.path} ${entry.contentType ?? ''} ${String(entry.metadata.kind ?? 'file')}`.toLowerCase().includes(search),
    );
  }, [entries, query]);

  async function saveDraft() {
    if (!draft.path.trim()) return;
    setSaving(true);
    setNotice('');
    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: draft.path.trim(),
          data: draft.content,
          contentEncoding: 'utf8',
          contentType: draft.contentType,
          visibility: draft.visibility,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      setNotice(response.ok ? 'File saved.' : payload.error ?? payload.message ?? 'Save failed');
      if (response.ok) {
        setDraft(EMPTY_DRAFT);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function uploadFile(file: File | null) {
    if (!file) return;
    setSaving(true);
    setNotice('');
    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: file.name,
          data: await fileToBase64(file),
          contentEncoding: 'base64',
          contentType: file.type || 'application/octet-stream',
          visibility: draft.visibility,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      setNotice(response.ok ? 'File uploaded.' : payload.error ?? payload.message ?? 'Upload failed');
      if (response.ok) await load();
    } finally {
      setSaving(false);
    }
  }

  async function previewFile(path: string) {
    const response = await fetch(`/api/files?action=preview&path=${encodeURIComponent(path)}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    setPreview({
      title: path,
      body: response.ok
        ? payload.contentEncoding === 'base64' ? 'Binary file preview is available as base64 through the API.' : String(payload.data ?? '')
        : payload.error ?? payload.message ?? 'Preview failed',
    });
  }

  async function summarizeFile(path: string) {
    const response = await fetch(`/api/files?action=summarize&path=${encodeURIComponent(path)}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    setPreview({ title: `Summary: ${path}`, body: response.ok ? payload.summary ?? 'No summary returned.' : payload.error ?? payload.message ?? 'Summary failed' });
    if (response.ok) await load();
  }

  async function renameFile(path: string) {
    const nextPath = window.prompt('Rename file', path);
    if (!nextPath || nextPath.trim() === path) return;
    const response = await fetch('/api/files', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, nextPath: nextPath.trim() }),
    });
    const payload = await response.json().catch(() => ({}));
    setNotice(response.ok ? 'File renamed.' : payload.error ?? payload.message ?? 'Rename failed');
    if (response.ok) await load();
  }

  async function deleteFile(path: string) {
    if (!window.confirm(`Delete ${path}?`)) return;
    const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    setNotice(response.ok ? 'File deleted.' : payload.error ?? payload.message ?? 'Delete failed');
    if (response.ok) await load();
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/files" />
      <WorkspaceShell activePath="/files">
        <PageHeader
          eyebrow="Files"
          title="Files"
          subtitle="Upload, preview, summarize, rename, search, and delete governed AgentOS files."
        />

        <div style={{ display: 'grid', gap: 16 }}>
          <Card>
            <div className="os-entity-head" style={{ marginBottom: 12 }}>
              <div className="os-entity-title">Add file</div>
              <Badge tone="accent">{draft.visibility}</Badge>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <Input placeholder="Path" value={draft.path} onChange={event => setDraft(current => ({ ...current, path: event.target.value }))} />
              <Input placeholder="Text content" value={draft.content} onChange={event => setDraft(current => ({ ...current, content: event.target.value }))} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <Input placeholder="Content type" value={draft.contentType} onChange={event => setDraft(current => ({ ...current, contentType: event.target.value }))} />
                <Select value={draft.visibility} onChange={event => setDraft(current => ({ ...current, visibility: event.target.value as DraftFile['visibility'] }))}>
                  <option value="private">Private</option>
                  <option value="workspace">Workspace</option>
                  <option value="public">Public</option>
                </Select>
              </div>
              <div className="os-inline-actions">
                <Button onClick={() => void saveDraft()} disabled={saving || !draft.path.trim()}>{saving ? 'Saving...' : 'Save text file'}</Button>
                <label className="os-button secondary" style={{ cursor: 'pointer' }}>
                  Upload
                  <input type="file" style={{ display: 'none' }} onChange={event => void uploadFile(event.target.files?.[0] ?? null)} />
                </label>
              </div>
              {notice ? <div className="os-entity-copy">{notice}</div> : null}
            </div>
          </Card>

          <SearchBar value={query} onChange={event => setQuery(event.target.value)} placeholder="Search files" />

          {preview ? (
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>{preview.title}</div>
              <pre className="os-code-block" style={{ whiteSpace: 'pre-wrap' }}>{preview.body.slice(0, 5000)}</pre>
            </Card>
          ) : null}

          {loading ? <LoadingState label="Loading files" /> : filtered.length === 0 ? (
            <EmptyState title="No files found" body="Upload files here or attach files inside Super AgentOS." />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {filtered.map(entry => (
                <Card key={entry.id}>
                  <div className="os-entity-head" style={{ marginBottom: 10 }}>
                    <div>
                      <div className="os-entity-title" style={{ wordBreak: 'break-word' }}>{entry.path}</div>
                      <div className="os-entity-copy">{entry.contentType ?? 'application/octet-stream'} | {entry.sizeBytes.toLocaleString()} bytes</div>
                    </div>
                    <Badge tone={toneForVisibility(entry.visibility)}>{entry.visibility}</Badge>
                  </div>
                  <div className="os-inline-actions">
                    <Button variant="secondary" onClick={() => void previewFile(entry.path)}>Preview</Button>
                    <Button variant="secondary" onClick={() => void summarizeFile(entry.path)}>Summarize</Button>
                    <Button variant="secondary" onClick={() => void renameFile(entry.path)}>Rename</Button>
                    <Button variant="danger" onClick={() => void deleteFile(entry.path)}>Delete</Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </WorkspaceShell>
    </div>
  );
}
