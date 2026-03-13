import { z } from 'zod';
import { getSupabaseAdmin, STORAGE_BUCKET } from '../storage/supabase.js';
import { checkStorageQuota } from '../runtime/resource-manager.js';
import { withAudit } from '../runtime/audit.js';
import { checkFilePath } from '../runtime/security.js';
import { validate, pathSchema } from '../utils/validation.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { getFFPClient } from '../ffp/client.js';
import type { AgentContext } from '../auth/permissions.js';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// Build the storage path for this agent's file — enforces namespace isolation
function buildPath(agentId: string, userPath: string): string {
  const sanitized = checkFilePath(userPath);
  return `${agentId}/${sanitized}`;
}

// Write data to a file. Creates or overwrites. Data must be a base64-encoded string.
export async function fsWrite(
  ctx: AgentContext,
  input: unknown
): Promise<{ path: string; sizeBytes: number }> {
  const { path, data, contentType } = validate(
    z.object({
      path: pathSchema,
      data: z.string().max(MAX_FILE_SIZE * 1.4, 'Data exceeds maximum file size'), // base64 overhead
      contentType: z.string().max(100).optional().default('application/octet-stream'),
    }),
    input
  );

  const buffer = Buffer.from(data, 'base64');
  if (buffer.length > MAX_FILE_SIZE) {
    throw new ValidationError(`File size ${buffer.length} exceeds maximum of ${MAX_FILE_SIZE} bytes`);
  }

  return withAudit({ agentId: ctx.agentId, primitive: 'fs', operation: 'write', metadata: { path, sizeBytes: buffer.length } }, async () => {
    await checkStorageQuota(ctx, buffer.length);

    const storagePath = buildPath(ctx.agentId, path);
    const supabase = getSupabaseAdmin();

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Storage write failed: ${error.message}`);
    }

    // Upsert file metadata in database
    await supabase.from('agent_files').upsert({
      agent_id: ctx.agentId,
      path,
      size_bytes: buffer.length,
      content_type: contentType,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'agent_id,path' });

    const result = { path, sizeBytes: buffer.length };
    void getFFPClient().log({ primitive: 'fs', action: 'write', params: { path, sizeBytes: buffer.length }, result, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

// Read a file and return its content as a base64-encoded string.
export async function fsRead(
  ctx: AgentContext,
  input: unknown
): Promise<{ path: string; data: string; contentType: string; sizeBytes: number }> {
  const { path } = validate(z.object({ path: pathSchema }), input);

  return withAudit({ agentId: ctx.agentId, primitive: 'fs', operation: 'read', metadata: { path } }, async () => {
    const storagePath = buildPath(ctx.agentId, path);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(storagePath);

    if (error || !data) {
      throw new NotFoundError(`File not found: ${path}`);
    }

    const buffer = Buffer.from(await data.arrayBuffer());

    // Get metadata from DB
    const { data: meta } = await supabase
      .from('agent_files')
      .select('content_type, size_bytes')
      .eq('agent_id', ctx.agentId)
      .eq('path', path)
      .single();

    const result = {
      path,
      data: buffer.toString('base64'),
      contentType: meta?.content_type ?? 'application/octet-stream',
      sizeBytes: buffer.length,
    };
    void getFFPClient().log({ primitive: 'fs', action: 'read', params: { path }, result: { path, sizeBytes: result.sizeBytes }, timestamp: Date.now(), agentId: ctx.agentId });
    return result;
  });
}

// List files in a directory path. Returns file metadata.
export async function fsList(
  ctx: AgentContext,
  input: unknown
): Promise<{ path: string; entries: Array<{ name: string; path: string; sizeBytes: number; type: 'file' | 'directory' }> }> {
  const { path } = validate(z.object({ path: pathSchema.optional().default('/') }), input);

  return withAudit({ agentId: ctx.agentId, primitive: 'fs', operation: 'list', metadata: { path } }, async () => {
    const normalizedPath = path === '/' ? '' : checkFilePath(path);
    const supabase = getSupabaseAdmin();
    const storagePath = normalizedPath ? `${ctx.agentId}/${normalizedPath}` : ctx.agentId;

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(storagePath);

    if (error) {
      throw new Error(`Failed to list directory: ${error.message}`);
    }

    const entries = (data ?? []).map(item => ({
      name: item.name,
      path: normalizedPath ? `${normalizedPath}/${item.name}` : item.name,
      sizeBytes: item.metadata?.size ?? 0,
      type: (item.id ? 'file' : 'directory') as 'file' | 'directory',
    }));

    void getFFPClient().log({ primitive: 'fs', action: 'list', params: { path }, result: { count: entries.length }, timestamp: Date.now(), agentId: ctx.agentId });
    return { path, entries };
  });
}

// Delete a file. Returns whether the file existed.
export async function fsDelete(
  ctx: AgentContext,
  input: unknown
): Promise<{ path: string; deleted: boolean }> {
  const { path } = validate(z.object({ path: pathSchema }), input);

  return withAudit({ agentId: ctx.agentId, primitive: 'fs', operation: 'delete', metadata: { path } }, async () => {
    const storagePath = buildPath(ctx.agentId, path);
    const supabase = getSupabaseAdmin();

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([storagePath]);

    if (error) {
      throw new Error(`Failed to delete file: ${error.message}`);
    }

    // Remove metadata record
    await supabase.from('agent_files')
      .delete()
      .eq('agent_id', ctx.agentId)
      .eq('path', path);

    void getFFPClient().log({ primitive: 'fs', action: 'delete', params: { path }, result: { deleted: true }, timestamp: Date.now(), agentId: ctx.agentId });
    return { path, deleted: true };
  });
}

// Create a directory marker. In Supabase Storage, directories are virtual —
// this just writes a .keep file so the directory shows up in listings.
export async function fsMkdir(
  ctx: AgentContext,
  input: unknown
): Promise<{ path: string }> {
  const { path } = validate(z.object({ path: pathSchema }), input);

  return withAudit({ agentId: ctx.agentId, primitive: 'fs', operation: 'mkdir', metadata: { path } }, async () => {
    const keepPath = `${path}/.keep`;
    return fsWrite(ctx, { path: keepPath, data: '', contentType: 'application/x-directory' });
  }).then(() => ({ path }));
}

// Get metadata for a file without reading its content.
export async function fsStat(
  ctx: AgentContext,
  input: unknown
): Promise<{ path: string; sizeBytes: number; contentType: string; createdAt: string; updatedAt: string }> {
  const { path } = validate(z.object({ path: pathSchema }), input);

  return withAudit({ agentId: ctx.agentId, primitive: 'fs', operation: 'stat', metadata: { path } }, async () => {
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
  });
}
