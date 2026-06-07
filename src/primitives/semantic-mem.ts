import { z } from 'zod';
import { withAudit } from '../runtime/audit.js';
import { validate } from '../utils/validation.js';
import type { AgentContext } from '../auth/permissions.js';
import { deleteMemoryEntry, listAccessibleMemoryEntries, upsertMemoryEntry } from '../memory/service.js';

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
      await upsertMemoryEntry({
        ownerAgentId: ctx.agentId,
        key,
        content,
        tags,
        namespaceType: 'agent',
        namespaceId: ctx.agentId,
        visibility: 'private',
      });
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
      const memories = await listAccessibleMemoryEntries({
        viewerAgentId: ctx.agentId,
        ownerAgentId: ctx.agentId,
        namespaceType: 'agent',
        namespaceId: ctx.agentId,
        search: query,
        tags,
        limit,
      });
      return {
        memories: memories.map(memory => ({
          key: memory.key,
          content: memory.content,
          tags: memory.tags,
          updated_at: memory.updatedAt,
        })),
      };
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
      const result = await deleteMemoryEntry({
        ownerAgentId: ctx.agentId,
        key,
        namespaceType: 'agent',
        namespaceId: ctx.agentId,
      });
      return { key, deleted: result.deleted };
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
      const memories = await listAccessibleMemoryEntries({
        viewerAgentId: ctx.agentId,
        ownerAgentId: ctx.agentId,
        namespaceType: 'agent',
        namespaceId: ctx.agentId,
        tags,
        limit: 200,
      });
      return {
        memories: memories.map(memory => ({
          key: memory.key,
          content: memory.content,
          tags: memory.tags,
          updated_at: memory.updatedAt,
        })),
      };
    },
  );
}
