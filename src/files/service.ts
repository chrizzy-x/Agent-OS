import { filterAccessibleResources, normalizeVisibility, type ResourceVisibility } from '../access/service.js';
import { STORAGE_BUCKET, getSupabaseAdmin, storagePath } from '../storage/supabase.js';
import { PermissionError, ValidationError } from '../utils/errors.js';
import { assertWorkspaceMembership } from '../workspaces/service.js';

export type AgentFileRecord = {
  id: string;
  ownerAgentId: string;
  workspaceId: string | null;
  sessionId: string | null;
  workflowId: string | null;
  subagentId: string | null;
  path: string;
  sizeBytes: number;
  contentType: string | null;
  visibility: ResourceVisibility;
  storageRef: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AgentFileContent = {
  entry: AgentFileRecord;
  data: string;
  contentEncoding: 'utf8' | 'base64';
  contentType: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizePath(value: string): string {
  const path = value.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!path) throw new ValidationError('path is required');
  return path;
}

function mapFile(row: Record<string, unknown>): AgentFileRecord {
  return {
    id: String(row.id),
    ownerAgentId: String(row.agent_id),
    workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : null,
    sessionId: typeof row.session_id === 'string' ? row.session_id : null,
    workflowId: typeof row.workflow_id === 'string' ? row.workflow_id : null,
    subagentId: typeof row.subagent_id === 'string' ? row.subagent_id : null,
    path: String(row.path ?? ''),
    sizeBytes: Number(row.size_bytes ?? 0),
    contentType: typeof row.content_type === 'string' ? row.content_type : null,
    visibility: normalizeVisibility(row.visibility),
    storageRef: typeof row.storage_ref === 'string' ? row.storage_ref : null,
    metadata: asRecord(row.metadata),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function inlineDataFromMetadata(metadata: Record<string, unknown>): string | null {
  const inline = metadata.inline_data;
  return typeof inline === 'string' && inline.length > 0 ? inline : null;
}

export async function listAccessibleFiles(params: {
  viewerAgentId: string;
  workspaceId?: string;
  sessionId?: string;
  workflowId?: string;
  subagentId?: string;
  search?: string;
  visibility?: ResourceVisibility | 'all';
  kind?: 'file' | 'artifact' | 'all';
  limit?: number;
}): Promise<AgentFileRecord[]> {
  let data: unknown[] = [];
  try {
    const result = await getSupabaseAdmin()
      .from('agent_files')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(Math.max(1, Math.min(params.limit ?? 100, 200)));

    if (result.error) throw result.error;
    data = result.data ?? [];
  } catch {
    data = [];
  }

  let entries = ((data ?? []) as Record<string, unknown>[]).map(mapFile);
  if (params.workspaceId) entries = entries.filter(entry => entry.workspaceId === params.workspaceId);
  if (params.sessionId) entries = entries.filter(entry => entry.sessionId === params.sessionId);
  if (params.workflowId) entries = entries.filter(entry => entry.workflowId === params.workflowId);
  if (params.subagentId) entries = entries.filter(entry => entry.subagentId === params.subagentId);
  if (params.visibility && params.visibility !== 'all') entries = entries.filter(entry => entry.visibility === params.visibility);
  if (params.kind && params.kind !== 'all') entries = entries.filter(entry => String(entry.metadata.kind ?? 'file') === params.kind);
  if (params.search?.trim()) {
    const search = params.search.trim().toLowerCase();
    entries = entries.filter(entry =>
      `${entry.path} ${entry.contentType ?? ''} ${JSON.stringify(entry.metadata)}`.toLowerCase().includes(search),
    );
  }

  return filterAccessibleResources({
    viewer: { agentId: params.viewerAgentId },
    resources: entries.map(entry => ({
      ...entry,
      id: entry.id,
      ownerAgentId: entry.ownerAgentId,
      workspaceId: entry.workspaceId,
      visibility: entry.visibility,
    })),
    sourceType: 'file',
    permission: 'file:read',
  });
}

export async function upsertAgentFile(params: {
  ownerAgentId: string;
  workspaceId?: string | null;
  sessionId?: string | null;
  workflowId?: string | null;
  subagentId?: string | null;
  path: string;
  data?: string;
  contentEncoding?: 'base64' | 'utf8';
  contentType?: string | null;
  visibility?: ResourceVisibility;
  kind?: 'file' | 'artifact';
  metadata?: Record<string, unknown>;
}): Promise<AgentFileRecord> {
  const path = normalizePath(params.path);
  const workspaceId = params.workspaceId?.trim() || null;
  if (workspaceId) {
    await assertWorkspaceMembership(workspaceId, params.ownerAgentId);
  }

  const now = new Date().toISOString();
  const metadata = {
    ...(params.metadata ?? {}),
    kind: params.kind ?? 'file',
  };

  let sizeBytes = 0;
  let storageRef: string | null = null;
  let persistedMetadata: Record<string, unknown> = metadata;
  if (typeof params.data === 'string') {
    const buffer = params.contentEncoding === 'utf8'
      ? Buffer.from(params.data, 'utf8')
      : Buffer.from(params.data, 'base64');
    sizeBytes = buffer.length;
    storageRef = storagePath(params.ownerAgentId, path);
    const upload = await getSupabaseAdmin().storage.from(STORAGE_BUCKET).upload(storageRef, buffer, {
      contentType: params.contentType ?? 'application/octet-stream',
      upsert: true,
    });
    if (upload.error) {
      persistedMetadata = {
        ...metadata,
        inline_data: params.contentEncoding === 'utf8' ? buffer.toString('base64') : params.data,
        storage_backend: 'inline',
      };
      storageRef = null;
    } else {
      persistedMetadata = {
        ...metadata,
        storage_backend: 'storage',
      };
    }
  }

  const { data, error } = await getSupabaseAdmin()
    .from('agent_files')
    .upsert({
      agent_id: params.ownerAgentId,
      workspace_id: workspaceId,
      session_id: params.sessionId ?? null,
      workflow_id: params.workflowId ?? null,
      subagent_id: params.subagentId ?? null,
      path,
      size_bytes: sizeBytes,
      content_type: params.contentType ?? 'application/octet-stream',
      visibility: params.visibility ?? 'private',
      storage_ref: storageRef,
      metadata: persistedMetadata,
      updated_at: now,
    }, { onConflict: 'agent_id,path' })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to save file: ${error.message}`);
  return mapFile(data as Record<string, unknown>);
}

export async function getAgentFileContent(params: {
  viewerAgentId: string;
  path: string;
}): Promise<AgentFileContent> {
  const path = normalizePath(params.path);
  const { data, error } = await getSupabaseAdmin()
    .from('agent_files')
    .select('*')
    .eq('agent_id', params.viewerAgentId)
    .eq('path', path)
    .maybeSingle();

  if (error) throw new Error(`Failed to load file: ${error.message}`);
  if (!data) throw new PermissionError('File not found or not accessible');

  const entry = mapFile(data as Record<string, unknown>);
  const inlineData = inlineDataFromMetadata(entry.metadata);
  if (inlineData) {
    const buffer = Buffer.from(inlineData, 'base64');
    const isText = (entry.contentType ?? '').startsWith('text/') || /json|xml|csv|markdown|javascript|typescript/.test(entry.contentType ?? '');
    return {
      entry,
      data: isText ? buffer.toString('utf8') : inlineData,
      contentEncoding: isText ? 'utf8' : 'base64',
      contentType: entry.contentType ?? 'application/octet-stream',
    };
  }

  if (!entry.storageRef) {
    return {
      entry,
      data: '',
      contentEncoding: 'utf8',
      contentType: entry.contentType ?? 'application/octet-stream',
    };
  }

  const download = await getSupabaseAdmin().storage.from(STORAGE_BUCKET).download(entry.storageRef);
  if (download.error) throw new Error(`Failed to read file storage: ${download.error.message}`);
  const buffer = Buffer.from(await download.data.arrayBuffer());
  const isText = (entry.contentType ?? '').startsWith('text/') || /json|xml|csv|markdown|javascript|typescript/.test(entry.contentType ?? '');
  return {
    entry,
    data: isText ? buffer.toString('utf8') : buffer.toString('base64'),
    contentEncoding: isText ? 'utf8' : 'base64',
    contentType: entry.contentType ?? 'application/octet-stream',
  };
}

export async function renameAgentFile(params: {
  ownerAgentId: string;
  path: string;
  nextPath: string;
}): Promise<AgentFileRecord> {
  const path = normalizePath(params.path);
  const nextPath = normalizePath(params.nextPath);
  const current = await getAgentFileContent({ viewerAgentId: params.ownerAgentId, path });
  const nextStorageRef = current.entry.storageRef ? storagePath(params.ownerAgentId, nextPath) : null;
  let metadata = current.entry.metadata;

  if (current.entry.storageRef && nextStorageRef) {
    const payload = current.contentEncoding === 'utf8'
      ? Buffer.from(current.data, 'utf8')
      : Buffer.from(current.data, 'base64');
    const upload = await getSupabaseAdmin().storage.from(STORAGE_BUCKET).upload(nextStorageRef, payload, {
      contentType: current.contentType,
      upsert: true,
    });
    if (upload.error) {
      metadata = {
        ...metadata,
        inline_data: payload.toString('base64'),
        storage_backend: 'inline',
      };
    } else {
      await getSupabaseAdmin().storage.from(STORAGE_BUCKET).remove([current.entry.storageRef]).catch(() => undefined);
      metadata = {
        ...metadata,
        storage_backend: 'storage',
      };
    }
  }

  const { data, error } = await getSupabaseAdmin()
    .from('agent_files')
    .update({
      path: nextPath,
      storage_ref: nextStorageRef,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('agent_id', params.ownerAgentId)
    .eq('path', path)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Failed to rename file: ${error.message}`);
  if (!data) throw new PermissionError('File not found or not accessible');
  return mapFile(data as Record<string, unknown>);
}

export async function summarizeAgentFile(params: {
  viewerAgentId: string;
  path: string;
}): Promise<{ entry: AgentFileRecord; summary: string }> {
  const content = await getAgentFileContent(params);
  if (content.contentEncoding !== 'utf8') {
    return {
      entry: content.entry,
      summary: `${content.entry.path} is a binary file (${content.contentType}, ${content.entry.sizeBytes} bytes). Preview is available as a download or base64 payload.`,
    };
  }

  const normalized = content.data.replace(/\s+/g, ' ').trim();
  const preview = normalized.slice(0, 800);
  const lines = content.data.split(/\r?\n/).length;
  const words = normalized ? normalized.split(/\s+/).length : 0;
  return {
    entry: content.entry,
    summary: `${content.entry.path}: ${lines} lines, ${words} words. ${preview || 'The file is empty.'}`,
  };
}

export async function deleteAgentFile(params: {
  ownerAgentId: string;
  path: string;
}): Promise<{ path: string; deleted: boolean }> {
  const path = normalizePath(params.path);
  const { data, error } = await getSupabaseAdmin()
    .from('agent_files')
    .delete()
    .eq('agent_id', params.ownerAgentId)
    .eq('path', path)
    .select('storage_ref')
    .maybeSingle();

  if (error) throw new Error(`Failed to delete file: ${error.message}`);
  if (!data) throw new PermissionError('File not found or not accessible');
  const storageRef = typeof (data as Record<string, unknown>).storage_ref === 'string'
    ? String((data as Record<string, unknown>).storage_ref)
    : storagePath(params.ownerAgentId, path);
  await getSupabaseAdmin().storage.from(STORAGE_BUCKET).remove([storageRef]).catch(() => undefined);
  return { path, deleted: true };
}
