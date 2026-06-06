import { extname } from 'path';
import { fsDelete, fsMkdir, fsRead, fsWrite } from '../primitives/fs.js';
import type { AgentContext } from '../auth/permissions.js';
import { getProject } from '../projects/service.js';
import { checkFilePath } from '../runtime/security.js';
import { readLocalRuntimeState } from '../storage/local-state.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import type { StudioFileNode } from './types.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

type ProjectFileRecord = {
  path: string;
  contentType: string | null;
  sizeBytes: number;
  updatedAt: string | null;
};

const PROJECT_ROOT = 'projects';
const DEFAULT_TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';
const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.sql',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);

function normalizeRelativePath(input: string): string {
  const normalized = input.replace(/\\/g, '/').trim();
  if (!normalized) return '';
  return checkFilePath(normalized);
}

function buildProjectStoragePath(projectId: string, relativePath = ''): string {
  const normalized = normalizeRelativePath(relativePath);
  return normalized ? `${PROJECT_ROOT}/${projectId}/${normalized}` : `${PROJECT_ROOT}/${projectId}`;
}

function stripProjectPrefix(projectId: string, storagePath: string): string | null {
  const normalized = normalizeRelativePath(storagePath);
  const prefix = `${PROJECT_ROOT}/${projectId}`;
  if (normalized === prefix) return '';
  if (!normalized.startsWith(`${prefix}/`)) return null;
  return normalized.slice(prefix.length + 1);
}

function looksBinary(buffer: Buffer, contentType: string | null, filePath: string): boolean {
  if (contentType && contentType.startsWith('text/')) return false;
  if (TEXT_EXTENSIONS.has(extname(filePath).toLowerCase())) return false;
  return buffer.includes(0);
}

function guessContentType(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  if (extension === '.json') return 'application/json';
  if (extension === '.md') return 'text/markdown; charset=utf-8';
  if (extension === '.svg') return 'image/svg+xml';
  if (TEXT_EXTENSIONS.has(extension)) return DEFAULT_TEXT_CONTENT_TYPE;
  return DEFAULT_TEXT_CONTENT_TYPE;
}

function isProjectFileRecord(row: ProjectFileRecord | null): row is ProjectFileRecord {
  return row !== null;
}

function sortNodes(nodes: StudioFileNode[]): StudioFileNode[] {
  return [...nodes]
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'directory' ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    })
    .map(node => ({
      ...node,
      children: node.children ? sortNodes(node.children) : undefined,
    }));
}

async function assertProjectAccess(ownerAgentId: string, projectId: string): Promise<void> {
  await getProject({ ownerAgentId, projectId });
}

async function listProjectFileRecords(ownerAgentId: string, projectId: string): Promise<ProjectFileRecord[]> {
  await assertProjectAccess(ownerAgentId, projectId);

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('agent_files')
      .select('path,size_bytes,content_type,updated_at')
      .eq('agent_id', ownerAgentId);

    if (error) {
      throw new Error(error.message);
    }

    const records: Array<ProjectFileRecord | null> = ((data ?? []) as Array<Record<string, unknown>>)
      .map(row => {
        const relativePath = stripProjectPrefix(projectId, String(row.path ?? ''));
        if (relativePath === null || relativePath === '' || relativePath.endsWith('/.keep') || relativePath === '.keep') {
          return null;
        }
        return {
          path: relativePath,
          sizeBytes: Number(row.size_bytes ?? 0),
          contentType: typeof row.content_type === 'string' ? row.content_type : null,
          updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
        } satisfies ProjectFileRecord;
      });
    return records.filter(isProjectFileRecord);
  } catch {
    const state = await readLocalRuntimeState();
    const records: Array<ProjectFileRecord | null> = Object.entries(state.files[ownerAgentId] ?? {})
      .map(([storagePath, file]) => {
        const relativePath = stripProjectPrefix(projectId, storagePath);
        if (relativePath === null || relativePath === '' || relativePath.endsWith('/.keep') || relativePath === '.keep') {
          return null;
        }
        return {
          path: relativePath,
          sizeBytes: file.sizeBytes,
          contentType: file.contentType,
          updatedAt: file.updatedAt,
        } satisfies ProjectFileRecord;
      });
    return records.filter(isProjectFileRecord);
  }
}

export async function listProjectFiles(params: {
  ownerAgentId: string;
  projectId: string;
}): Promise<StudioFileNode[]> {
  const records = await listProjectFileRecords(params.ownerAgentId, params.projectId);
  const root = new Map<string, StudioFileNode>();

  function ensureDirectory(pathParts: string[]): StudioFileNode[] {
    let level = root;
    const ancestors: StudioFileNode[] = [];
    let currentPath = '';

    for (const part of pathParts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let node = level.get(part);
      if (!node) {
        node = {
          id: currentPath,
          name: part,
          path: currentPath,
          kind: 'directory',
          children: [],
        };
        level.set(part, node);
      }
      if (!node.children) {
        node.children = [];
      }
      ancestors.push(node);
      level = new Map(node.children.map(child => [child.name, child]));
      node.children = [...level.values()];
    }

    return ancestors;
  }

  for (const record of records) {
    const parts = record.path.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) continue;

    if (parts.length > 0) {
      const ancestors = ensureDirectory(parts);
      const parent = ancestors.at(-1);
      if (parent) {
        parent.children ??= [];
        parent.children = parent.children.filter(child => child.name !== fileName);
        parent.children.push({
          id: record.path,
          name: fileName,
          path: record.path,
          kind: 'file',
          contentType: record.contentType,
          sizeBytes: record.sizeBytes,
          updatedAt: record.updatedAt,
        });
      }
      continue;
    }

    root.set(fileName, {
      id: record.path,
      name: fileName,
      path: record.path,
      kind: 'file',
      contentType: record.contentType,
      sizeBytes: record.sizeBytes,
      updatedAt: record.updatedAt,
    });
  }

  return sortNodes([...root.values()]);
}

export async function readProjectFile(params: {
  ownerAgentId: string;
  projectId: string;
  path: string;
}): Promise<{
  path: string;
  content: string;
  encoding: 'utf8' | 'base64';
  contentType: string;
  sizeBytes: number;
}> {
  await assertProjectAccess(params.ownerAgentId, params.projectId);
  const path = normalizeRelativePath(params.path);
  if (!path) {
    throw new ValidationError('file path is required');
  }

  const agentContext: AgentContext = {
    agentId: params.ownerAgentId,
    allowedDomains: [],
    quotas: {
      storageQuotaBytes: Number.MAX_SAFE_INTEGER,
      memoryQuotaBytes: Number.MAX_SAFE_INTEGER,
      rateLimitPerMin: Number.MAX_SAFE_INTEGER,
    },
    tier: 'enterprise_plus',
  };

  const result = await fsRead(agentContext, {
    path: buildProjectStoragePath(params.projectId, path),
  });
  const buffer = Buffer.from(result.data, 'base64');
  const binary = looksBinary(buffer, result.contentType, path);
  return {
    path,
    content: binary ? result.data : buffer.toString('utf8'),
    encoding: binary ? 'base64' : 'utf8',
    contentType: result.contentType,
    sizeBytes: result.sizeBytes,
  };
}

export async function writeProjectFile(params: {
  ownerAgentId: string;
  projectId: string;
  path: string;
  content: string;
  encoding?: 'utf8' | 'base64';
  contentType?: string | null;
}): Promise<{ path: string; sizeBytes: number }> {
  await assertProjectAccess(params.ownerAgentId, params.projectId);
  const path = normalizeRelativePath(params.path);
  if (!path) {
    throw new ValidationError('file path is required');
  }

  const encoding = params.encoding ?? 'utf8';
  const buffer = encoding === 'base64'
    ? Buffer.from(params.content, 'base64')
    : Buffer.from(params.content, 'utf8');

  const agentContext: AgentContext = {
    agentId: params.ownerAgentId,
    allowedDomains: [],
    quotas: {
      storageQuotaBytes: Number.MAX_SAFE_INTEGER,
      memoryQuotaBytes: Number.MAX_SAFE_INTEGER,
      rateLimitPerMin: Number.MAX_SAFE_INTEGER,
    },
    tier: 'enterprise_plus',
  };

  return fsWrite(agentContext, {
    path: buildProjectStoragePath(params.projectId, path),
    data: buffer.toString('base64'),
    contentType: params.contentType?.trim() || guessContentType(path),
  });
}

export async function deleteProjectFile(params: {
  ownerAgentId: string;
  projectId: string;
  path: string;
}): Promise<{ path: string; deleted: boolean }> {
  await assertProjectAccess(params.ownerAgentId, params.projectId);
  const path = normalizeRelativePath(params.path);
  if (!path) {
    throw new ValidationError('file path is required');
  }

  const agentContext: AgentContext = {
    agentId: params.ownerAgentId,
    allowedDomains: [],
    quotas: {
      storageQuotaBytes: Number.MAX_SAFE_INTEGER,
      memoryQuotaBytes: Number.MAX_SAFE_INTEGER,
      rateLimitPerMin: Number.MAX_SAFE_INTEGER,
    },
    tier: 'enterprise_plus',
  };

  return fsDelete(agentContext, {
    path: buildProjectStoragePath(params.projectId, path),
  });
}

export async function createProjectDirectory(params: {
  ownerAgentId: string;
  projectId: string;
  path: string;
}): Promise<{ path: string }> {
  await assertProjectAccess(params.ownerAgentId, params.projectId);
  const path = normalizeRelativePath(params.path);
  if (!path) {
    throw new ValidationError('directory path is required');
  }

  const agentContext: AgentContext = {
    agentId: params.ownerAgentId,
    allowedDomains: [],
    quotas: {
      storageQuotaBytes: Number.MAX_SAFE_INTEGER,
      memoryQuotaBytes: Number.MAX_SAFE_INTEGER,
      rateLimitPerMin: Number.MAX_SAFE_INTEGER,
    },
    tier: 'enterprise_plus',
  };

  return fsMkdir(agentContext, {
    path: buildProjectStoragePath(params.projectId, path),
  });
}

export async function listProjectFilePaths(params: {
  ownerAgentId: string;
  projectId: string;
}): Promise<string[]> {
  return (await listProjectFileRecords(params.ownerAgentId, params.projectId)).map(record => record.path);
}

export async function readProjectFileBuffer(params: {
  ownerAgentId: string;
  projectId: string;
  path: string;
}): Promise<Buffer> {
  const file = await readProjectFile(params);
  return file.encoding === 'base64'
    ? Buffer.from(file.content, 'base64')
    : Buffer.from(file.content, 'utf8');
}

export async function requireProjectFile(params: {
  ownerAgentId: string;
  projectId: string;
  path: string;
}): Promise<{
  path: string;
  content: string;
  encoding: 'utf8' | 'base64';
  contentType: string;
  sizeBytes: number;
}> {
  try {
    return await readProjectFile(params);
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw error;
  }
}
