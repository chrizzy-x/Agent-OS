import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { deleteMemoryEntry, listAccessibleMemoryEntries, upsertMemoryEntry } from '@/src/memory/service';
import { toErrorResponse, NotFoundError } from '@/src/utils/errors';

export const runtime = 'nodejs';

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

async function findMemory(ctxAgentId: string, id: string) {
  const entries = await listAccessibleMemoryEntries({
    viewerAgentId: ctxAgentId,
    ownerAgentId: ctxAgentId,
    visibility: 'all',
    limit: 200,
  });
  const entry = entries.find(item => item.id === id);
  if (!entry) throw new NotFoundError('Memory not found');
  return entry;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const { id } = await params;
    const current = await findMemory(ctx.agentId, id);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const entry = await upsertMemoryEntry({
      ownerAgentId: ctx.agentId,
      key: typeof body.key === 'string' ? body.key : current.key,
      content: typeof body.content === 'string' ? body.content : current.content,
      tags: body.tags !== undefined ? stringArray(body.tags) : current.tags,
      namespaceType: current.namespaceType,
      namespaceId: current.namespaceId,
      workspaceId: current.workspaceId,
      visibility: body.visibility === 'workspace' || body.visibility === 'public' || body.visibility === 'private' ? body.visibility : current.visibility,
      metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? body.metadata as Record<string, unknown>
        : current.metadata,
    });
    return NextResponse.json({ entry });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const { id } = await params;
    const current = await findMemory(ctx.agentId, id);
    const result = await deleteMemoryEntry({
      ownerAgentId: ctx.agentId,
      key: current.key,
      namespaceType: current.namespaceType,
      namespaceId: current.namespaceId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
