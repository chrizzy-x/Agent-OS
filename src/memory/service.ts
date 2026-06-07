import { filterAccessibleResources, normalizeVisibility, type ResourceVisibility } from '../access/service.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { ValidationError, PermissionError } from '../utils/errors.js';

export type MemoryNamespaceType = 'user' | 'agent' | 'subagent' | 'workspace' | 'workflow' | 'app' | 'skill';

export type MemoryEntry = {
  id: string;
  ownerAgentId: string;
  workspaceId: string | null;
  key: string;
  content: string;
  tags: string[];
  namespaceType: MemoryNamespaceType;
  namespaceId: string;
  visibility: ResourceVisibility;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mapMemoryEntry(row: Record<string, unknown>): MemoryEntry {
  return {
    id: String(row.id ?? `${row.agent_id}:${row.key}`),
    ownerAgentId: String(row.agent_id),
    workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : null,
    key: String(row.key),
    content: String(row.content ?? ''),
    tags: Array.isArray(row.tags) ? row.tags.filter((item): item is string => typeof item === 'string') : [],
    namespaceType: (row.namespace_type as MemoryNamespaceType) ?? 'agent',
    namespaceId: typeof row.namespace_id === 'string' ? row.namespace_id : '',
    visibility: normalizeVisibility(row.visibility),
    metadata: asRecord(row.metadata),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

function normalizeNamespaceId(namespaceType: MemoryNamespaceType, namespaceId: string | null | undefined, ownerAgentId: string): string {
  const trimmed = namespaceId?.trim();
  if (trimmed) return trimmed;
  if (namespaceType === 'agent' || namespaceType === 'user') return ownerAgentId;
  return '';
}

export async function upsertMemoryEntry(params: {
  ownerAgentId: string;
  key: string;
  content: string;
  tags?: string[];
  namespaceType?: MemoryNamespaceType;
  namespaceId?: string | null;
  workspaceId?: string | null;
  visibility?: ResourceVisibility;
  metadata?: Record<string, unknown>;
}): Promise<MemoryEntry> {
  const key = params.key.trim();
  if (!key) throw new ValidationError('Memory key is required');
  if (!params.content.trim()) throw new ValidationError('Memory content is required');

  const namespaceType = params.namespaceType ?? 'agent';
  const namespaceId = normalizeNamespaceId(namespaceType, params.namespaceId, params.ownerAgentId);
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from('agent_memory_store')
    .upsert({
      agent_id: params.ownerAgentId,
      workspace_id: params.workspaceId ?? null,
      key,
      content: params.content,
      tags: params.tags ?? [],
      namespace_type: namespaceType,
      namespace_id: namespaceId,
      visibility: params.visibility ?? 'private',
      metadata: params.metadata ?? {},
      updated_at: now,
    }, {
      onConflict: 'agent_id,key,namespace_type,namespace_id',
    })
    .select('*')
    .single();

  if (error) throw new Error(`Failed to store memory: ${error.message}`);
  return mapMemoryEntry(data as Record<string, unknown>);
}

export async function deleteMemoryEntry(params: {
  ownerAgentId: string;
  key: string;
  namespaceType?: MemoryNamespaceType;
  namespaceId?: string | null;
}): Promise<{ deleted: boolean }> {
  const namespaceType = params.namespaceType ?? 'agent';
  const namespaceId = normalizeNamespaceId(namespaceType, params.namespaceId, params.ownerAgentId);
  const { error, count } = await getSupabaseAdmin()
    .from('agent_memory_store')
    .delete({ count: 'exact' })
    .eq('agent_id', params.ownerAgentId)
    .eq('key', params.key)
    .eq('namespace_type', namespaceType)
    .eq('namespace_id', namespaceId);

  if (error) throw new Error(`Failed to delete memory: ${error.message}`);
  return { deleted: (count ?? 0) > 0 };
}

export async function listAccessibleMemoryEntries(params: {
  viewerAgentId: string;
  ownerAgentId?: string;
  workspaceId?: string | null;
  namespaceType?: MemoryNamespaceType;
  namespaceId?: string | null;
  search?: string;
  tags?: string[];
  visibility?: ResourceVisibility | 'all';
  limit?: number;
}): Promise<MemoryEntry[]> {
  const limit = Math.max(1, Math.min(params.limit ?? 100, 200));
  const search = params.search?.trim().toLowerCase() ?? '';
  const { data, error } = await getSupabaseAdmin()
    .from('agent_memory_store')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit * 4);

  if (error) throw new Error(`Failed to list memory: ${error.message}`);

  let entries = ((data ?? []) as Record<string, unknown>[]).map(mapMemoryEntry);
  if (params.ownerAgentId) entries = entries.filter(entry => entry.ownerAgentId === params.ownerAgentId);
  if (params.workspaceId) entries = entries.filter(entry => entry.workspaceId === params.workspaceId);
  if (params.namespaceType) entries = entries.filter(entry => entry.namespaceType === params.namespaceType);
  if (params.namespaceId) entries = entries.filter(entry => entry.namespaceId === params.namespaceId);
  if (params.visibility && params.visibility !== 'all') entries = entries.filter(entry => entry.visibility === params.visibility);
  if (params.tags?.length) {
    entries = entries.filter(entry => params.tags?.some(tag => entry.tags.includes(tag)));
  }
  if (search) {
    entries = entries.filter(entry =>
      entry.key.toLowerCase().includes(search)
      || entry.content.toLowerCase().includes(search)
      || entry.tags.some(tag => tag.toLowerCase().includes(search)),
    );
  }

  const accessible = await filterAccessibleResources({
    viewer: { agentId: params.viewerAgentId },
    resources: entries,
    sourceType: 'memory',
    permission: 'memory:read',
  });

  return accessible.slice(0, limit);
}

export async function getOwnedMemoryEntry(params: {
  ownerAgentId: string;
  key: string;
  namespaceType?: MemoryNamespaceType;
  namespaceId?: string | null;
}): Promise<MemoryEntry> {
  const namespaceType = params.namespaceType ?? 'agent';
  const namespaceId = normalizeNamespaceId(namespaceType, params.namespaceId, params.ownerAgentId);
  const { data, error } = await getSupabaseAdmin()
    .from('agent_memory_store')
    .select('*')
    .eq('agent_id', params.ownerAgentId)
    .eq('key', params.key)
    .eq('namespace_type', namespaceType)
    .eq('namespace_id', namespaceId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load memory: ${error.message}`);
  if (!data) throw new PermissionError('Memory not found or not accessible');
  return mapMemoryEntry(data as Record<string, unknown>);
}
