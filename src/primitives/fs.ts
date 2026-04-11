import { z } from 'zod';
import { getSupabaseAdmin, STORAGE_BUCKET } from '../storage/supabase.js';
import { checkStorageQuota } from '../runtime/resource-manager.js';
import { withAudit } from '../runtime/audit.js';
import { checkFilePath } from '../runtime/security.js';
import { validate, pathSchema } from '../utils/validation.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { getFFPClient } from '../ffp/client.js';
import { readLocalRuntimeState, updateLocalRuntimeState } from '../storage/local-state.js';
import type { AgentContext } from '../auth/permissions.js';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

type FsEntry = {
  name: string;
  path: string;
  sizeBytes: number;
  type: 'file' | 'directory';
};

type FsMetadata = {
  inline_data?: string;
  storage_backend?: 'inline' | 'storage';
};

function readInlineData(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const inlineData = (metadata as FsMetadata).inline_data;
  return typeof inlineData === 'string' ? inlineData : null;
}

function buildPath(agentId: string, userPath: string): string {
  const sanitized = checkFilePath(userPath);
  return `${agentId}/${sanitized}`;
}

function normalizeFsPath(inputPath: string): string {
  return inputPath === '/' ? '' : checkFilePath(inputPath);
}

function registerDirectoryPaths(existing: string[], filePath: string): string[] {
  const next = new Set(existing);
  const parts = filePath.split('/').filter(Boolean);
  for (let index = 1; index < parts.length; index += 1) {
    next.add(parts.slice(0, index).join('/'));
  }
  return [...next].sort((left, right) => left.localeCompare(right));
}

function listLocalEntries(paths: string[], directories: string[], basePath: string): FsEntry[] {
  const entries = new Map<string, FsEntry>();
  const prefix = basePath ? `${basePath}/` : '';

  for (const directory of directories) {
    if (directory === basePath) {
      continue;
    }
    if (!directory.startsWith(prefix)) {
      continue;
    }

    const remainder = prefix ? directory.slice(prefix.length) : directory;
    const [segment] = remainder.split('/');
    if (!segment) {
      continue;
    }

    entries.set(segment, {
      name: segment,
      path: prefix ? `${basePath}/${segment}` : segment,
      sizeBytes: 0,
      type: 'directory',
    });
  }

  for (const filePath of paths) {
    if (!filePath.startsWith(prefix)) {
      continue;
    }

    const remainder = prefix ? filePath.slice(prefix.length) : filePath;
    const parts = remainder.split('/').filter(Boolean);
    if (parts.length === 0) {
      continue;
    }

    const segment = parts[0];
    if (parts.length > 1) {
      if (!entries.has(segment)) {
        entries.set(segment, {
          name: segment,
          path: prefix ? `${basePath}/${segment}` : segment,
          sizeBytes: 0,
          type: 'directory',
        });
      }
      continue;
    }

    entries.set(segment, {
      name: segment,
      path: prefix ? `${basePath}/${segment}` : segment,
      sizeBytes: 0,
      type: 'file',
    });
  }

  return [...entries.values()].sort((left, right) => left.path.localeCompare(right.path));
}

async function withFsFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await primary();
  } catch {
    return fallback();
  }
}

export async function fsWrite(ctx: AgentContext, input: unknown): Promise<{ path: string; sizeBytes: number }> {
  const { path, data, contentType } = validate(
    z.object({
      path: pathSchema,
      data: z.string().max(MAX_FILE_SIZE * 1.4, 'Data exceeds maximum file size'),
      contentType: z.string().max(100).optional().default('application/octet-stream'),
    }),
    input,
  );

  const buffer = Buffer.from(data, 'base64');
  if (buffer.length > MAX_FILE_SIZE) {
    throw new ValidationError(`File size ${buffer.length} exceeds maximum of ${MAX_FILE_SIZE} bytes`);
  }

  return withAudit({ agentId: ctx.agentId, primitive: 'fs', operation: 'write', metadata: { path, sizeBytes: buffer.length } }, async () => {
    await checkStorageQuota(ctx, buffer.length);

    const result = await withFsFallback(async () => {
      const storagePath = buildPath(ctx.agentId, path);
      const supabase = getSupabaseAdmin();
      const now = new Date().toISOString();

      const upload = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, buffer, {
        contentType,
        upsert: true,
      });

      const metadata: FsMetadata = upload.error
        ? { inline_data: data, storage_backend: 'inline' }
        : { storage_backend: 'storage' };

      const fileRecord = await supabase.from('agent_files').upsert({
        agent_id: ctx.agentId,
        path,
        size_bytes: buffer.length,
        content_type: contentType,
        updated_at: now,
        metadata,
      }, { onConflict: 'agent_id,path' });

      if (fileRecord.error) {
        const message = upload.error?.message ?? fileRecord.error.message;
        throw new Error(`Storage write failed: ${message}`);
      }

      return { path, sizeBytes: buffer.length };
    }, async () => {
      return updateLocalRuntimeState(state => {
        const normalizedPath = checkFilePath(path);
        state.files[ctx.agentId] ??= {};
        state.directories[ctx.agentId] ??= [];
        state.files[ctx.agentId][normalizedPath] = {
          content: data,
          contentType,
          sizeBytes: buffer.length,
          createdAt: state.files[ctx.agentId][normalizedPath]?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        state.directories[ctx.agentId] = registerDirectoryPaths(state.directories[ctx.agentId], normalizedPath);
        return { path: normalizedPath, sizeBytes: buffer.length };
      });
    });

    void getFFPClient().log({ primitive: 'fs', action: 'write', params: { path, sizeBytes: buffer.length }, result, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function fsRead(ctx: AgentContext, input: unknown): Promise<{ path: string; data: string; contentType: string; sizeBytes: number }> {
  const { path } = validate(z.object({ path: pathSchema }), input);

  return withAudit({ agentId: ctx.agentId, primitive: 'fs', operation: 'read', metadata: { path } }, async () => {
    const result = await withFsFallback(async () => {
      const storagePath = buildPath(ctx.agentId, path);
      const supabase = getSupabaseAdmin();
      const { data: meta } = await supabase
        .from('agent_files')
        .select('content_type, size_bytes, metadata')
        .eq('agent_id', ctx.agentId)
        .eq('path', path)
        .maybeSingle();

      const inlineData = readInlineData(meta?.metadata);
      if (typeof inlineData === 'string') {
        return {
          path,
          data: inlineData,
          contentType: meta?.content_type ?? 'application/octet-stream',
          sizeBytes: meta?.size_bytes ?? Buffer.from(inlineData, 'base64').length,
        };
      }

      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath);

      if (error || !data) {
        throw new NotFoundError(`File not found: ${path}`);
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      return {
        path,
        data: buffer.toString('base64'),
        contentType: meta?.content_type ?? 'application/octet-stream',
        sizeBytes: meta?.size_bytes ?? buffer.length,
      };
    }, async () => {
      const normalizedPath = checkFilePath(path);
      const state = await readLocalRuntimeState();
      const file = state.files[ctx.agentId]?.[normalizedPath];
      if (!file) {
        throw new NotFoundError(`File not found: ${path}`);
      }

      return {
        path: normalizedPath,
        data: file.content,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
      };
    });

    void getFFPClient().log({ primitive: 'fs', action: 'read', params: { path }, result: { path, sizeBytes: result.sizeBytes }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function fsList(ctx: AgentContext, input: unknown): Promise<{ path: string; entries: FsEntry[] }> {
  const { path } = validate(z.object({ path: pathSchema.default('/') }), input);

  return withAudit({ agentId: ctx.agentId, primitive: 'fs', operation: 'list', metadata: { path } }, async () => {
    return withFsFallback(async () => {
      const normalizedPath = normalizeFsPath(path);
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('agent_files')
        .select('path, size_bytes')
        .eq('agent_id', ctx.agentId);

      if (error) {
        throw new Error(`Failed to list directory: ${error.message}`);
      }

      const rows = ((data ?? []) as Array<{ path: string; size_bytes: number | null }>)
        .map(row => ({
          path: normalizeFsPath(row.path),
          sizeBytes: row.size_bytes ?? 0,
        }));
      const directories = rows.reduce<string[]>((accumulator, row) => registerDirectoryPaths(accumulator, row.path), []);
      const filePaths = rows
        .map(row => row.path)
        .filter(filePath => filePath !== '.keep' && !filePath.endsWith('/.keep'));
      const fileSizes = new Map(rows.map(row => [row.path, row.sizeBytes]));
      const entries = listLocalEntries(filePaths, directories, normalizedPath).map(entry => ({
        ...entry,
        sizeBytes: entry.type === 'file' ? (fileSizes.get(entry.path) ?? 0) : entry.sizeBytes,
      }));

      return { path, entries };
    }, async () => {
      const state = await readLocalRuntimeState();
      const normalizedPath = normalizeFsPath(path);
      const filePaths = Object.keys(state.files[ctx.agentId] ?? {});
      const directories = state.directories[ctx.agentId] ?? [];
      const entries = listLocalEntries(filePaths, directories, normalizedPath);
      return { path, entries };
    });
  });
}

export async function fsDelete(ctx: AgentContext, input: unknown): Promise<{ path: string; deleted: boolean }> {
  const { path } = validate(z.object({ path: pathSchema }), input);

  return withAudit({ agentId: ctx.agentId, primitive: 'fs', operation: 'delete', metadata: { path } }, async () => {
    const result = await withFsFallback(async () => {
      const storagePath = buildPath(ctx.agentId, path);
      const supabase = getSupabaseAdmin();
      const deletion = await supabase.from('agent_files').delete().eq('agent_id', ctx.agentId).eq('path', path);
      if (deletion.error) {
        throw new Error(`Failed to delete file: ${deletion.error.message}`);
      }

      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
      return { path, deleted: true };
    }, async () => {
      return updateLocalRuntimeState(state => {
        const normalizedPath = checkFilePath(path);
        if (!state.files[ctx.agentId]?.[normalizedPath]) {
          return { path: normalizedPath, deleted: false };
        }

        delete state.files[ctx.agentId][normalizedPath];
        return { path: normalizedPath, deleted: true };
      });
    });

    void getFFPClient().log({ primitive: 'fs', action: 'delete', params: { path }, result: { deleted: result.deleted }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

export async function fsMkdir(ctx: AgentContext, input: unknown): Promise<{ path: string }> {
  const { path } = validate(z.object({ path: pathSchema }), input);

  return withAudit({ agentId: ctx.agentId, primitive: 'fs', operation: 'mkdir', metadata: { path } }, async () => {
    return withFsFallback(async () => {
      const keepPath = `${path}/.keep`;
      await fsWrite(ctx, { path: keepPath, data: '', contentType: 'application/x-directory' });
      return { path };
    }, async () => {
      return updateLocalRuntimeState(state => {
        const normalizedPath = checkFilePath(path);
        state.directories[ctx.agentId] ??= [];
        if (!state.directories[ctx.agentId].includes(normalizedPath)) {
          state.directories[ctx.agentId].push(normalizedPath);
          state.directories[ctx.agentId].sort((left, right) => left.localeCompare(right));
        }
        return { path: normalizedPath };
      });
    });
  });
}

export async function fsStat(ctx: AgentContext, input: unknown): Promise<{ path: string; sizeBytes: number; contentType: string; createdAt: string; updatedAt: string }> {
  const { path } = validate(z.object({ path: pathSchema }), input);

  return withAudit({ agentId: ctx.agentId, primitive: 'fs', operation: 'stat', metadata: { path } }, async () => {
    return withFsFallback(async () => {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('agent_files')
        .select('size_bytes, content_type, created_at, updated_at')
        .eq('agent_id', ctx.agentId)
        .eq('path', path)
        .single();

      if (error || !data) {
        throw new NotFoundError(`File not found: ${path}`);
      }

      return {
        path,
        sizeBytes: data.size_bytes,
        contentType: data.content_type ?? 'application/octet-stream',
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }, async () => {
      const normalizedPath = checkFilePath(path);
      const state = await readLocalRuntimeState();
      const file = state.files[ctx.agentId]?.[normalizedPath];
      if (!file) {
        throw new NotFoundError(`File not found: ${path}`);
      }

      return {
        path: normalizedPath,
        sizeBytes: file.sizeBytes,
        contentType: file.contentType,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      };
    });
  });
}
