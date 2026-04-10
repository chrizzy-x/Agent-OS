import { z } from 'zod';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { withAudit } from '../runtime/audit.js';
import { validate } from '../utils/validation.js';
import type { AgentContext } from '../auth/permissions.js';

const keySchema = z.string().min(1).max(256);

// Store a memory permanently in Supabase (survives Redis TTL).
// Upserts on (agent_id, key) — updating content and tags if key already exists.
export async function semanticMemRemember(
  ctx: AgentContext,
  input: unknown,
): Promise<{ key: string; stored: boolean }> {
  const { key, content, tags } = validate(
    z.object({
      key: keySchema,
      content: z.string().min(1).max(100_000),
      tags: z.array(z.string().max(64)).max(50).optional().default([]),
    }),
    input,
  );

  return withAudit(
    { agentId: ctx.agentId, primitive: 'mem', operation: 'remember', metadata: { key } },
    async () => {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from('agent_memory_store').upsert(
        {
          agent_id: ctx.agentId,
          key,
          content,
          tags,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'agent_id,key' },
      );
      if (error) throw new Error(`Failed to store memory: ${error.message}`);
      return { key, stored: true };
    },
  );
}

// Retrieve memories by keyword search (key ILIKE %query%) or tag overlap.
// Returns up to `limit` results ordered by most recently updated.
export async function semanticMemRecall(
  ctx: AgentContext,
  input: unknown,
): Promise<{ memories: { key: string; content: string; tags: string[]; updated_at: string }[] }> {
  const { query, tags, limit } = validate(
    z.object({
      query: z.string().max(256).optional(),
      tags: z.array(z.string().max(64)).max(20).optional(),
      limit: z.number().int().min(1).max(100).optional().default(10),
    }),
    input,
  );

  return withAudit(
    { agentId: ctx.agentId, primitive: 'mem', operation: 'recall', metadata: { query, tags } },
    async () => {
      const supabase = getSupabaseAdmin();
      let q = supabase
        .from('agent_memory_store')
        .select('key, content, tags, updated_at')
        .eq('agent_id', ctx.agentId)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (query) {
        q = q.ilike('key', `%${query}%`);
      }
      if (tags && tags.length > 0) {
        q = q.overlaps('tags', tags);
      }

      const { data, error } = await q;
      if (error) throw new Error(`Failed to recall memories: ${error.message}`);
      return { memories: (data ?? []) as { key: string; content: string; tags: string[]; updated_at: string }[] };
    },
  );
}

// Delete a memory by key.
export async function semanticMemForget(
  ctx: AgentContext,
  input: unknown,
): Promise<{ key: string; deleted: boolean }> {
  const { key } = validate(z.object({ key: keySchema }), input);

  return withAudit(
    { agentId: ctx.agentId, primitive: 'mem', operation: 'forget', metadata: { key } },
    async () => {
      const supabase = getSupabaseAdmin();
      const { error, count } = await supabase
        .from('agent_memory_store')
        .delete({ count: 'exact' })
        .eq('agent_id', ctx.agentId)
        .eq('key', key);
      if (error) throw new Error(`Failed to delete memory: ${error.message}`);
      return { key, deleted: (count ?? 0) > 0 };
    },
  );
}

// List all memories, optionally filtered by tags.
export async function semanticMemList(
  ctx: AgentContext,
  input: unknown,
): Promise<{ memories: { key: string; content: string; tags: string[]; updated_at: string }[] }> {
  const { tags } = validate(
    z.object({ tags: z.array(z.string().max(64)).max(20).optional() }),
    input,
  );

  return withAudit(
    { agentId: ctx.agentId, primitive: 'mem', operation: 'history', metadata: { tags } },
    async () => {
      const supabase = getSupabaseAdmin();
      let q = supabase
        .from('agent_memory_store')
        .select('key, content, tags, updated_at')
        .eq('agent_id', ctx.agentId)
        .order('updated_at', { ascending: false })
        .limit(200);

      if (tags && tags.length > 0) {
        q = q.overlaps('tags', tags);
      }

      const { data, error } = await q;
      if (error) throw new Error(`Failed to list memories: ${error.message}`);
      return { memories: (data ?? []) as { key: string; content: string; tags: string[]; updated_at: string }[] };
    },
  );
}
