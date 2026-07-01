import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { buildCapabilityGraph, registerCapabilityNode } from '@/src/capabilities/service';
import { toErrorResponse, ValidationError } from '@/src/utils/errors';

export const runtime = 'nodejs';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const { searchParams } = new URL(request.url);
    const graph = await buildCapabilityGraph({
      ownerAgentId: ctx.agentId,
      workspaceId: searchParams.get('workspaceId'),
      projectId: searchParams.get('projectId'),
    });
    return NextResponse.json(graph);
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const payload = asRecord(body.node ?? body.capability ?? body);
    if (!payload.id || !payload.sourceType || !payload.sourceId || !payload.name) {
      throw new ValidationError('Capability id, sourceType, sourceId, and name are required');
    }
    const capability = await registerCapabilityNode({
      ownerAgentId: ctx.agentId,
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : null,
      node: {
        id: String(payload.id),
        sourceType: String(payload.sourceType) as never,
        sourceId: String(payload.sourceId),
        name: String(payload.name),
        description: typeof payload.description === 'string' ? payload.description : '',
        status: payload.status === 'needs_config' || payload.status === 'disabled' || payload.status === 'error' ? payload.status : 'available',
        statusReason: typeof payload.statusReason === 'string' ? payload.statusReason : null,
        actions: Array.isArray(payload.actions) ? payload.actions as never : [],
        requiredPermissions: Array.isArray(payload.requiredPermissions) ? payload.requiredPermissions.filter((item): item is string => typeof item === 'string') : [],
        requiredSecrets: Array.isArray(payload.requiredSecrets) ? payload.requiredSecrets.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [],
        inputSchema: asRecord(payload.inputSchema),
        outputSchema: asRecord(payload.outputSchema),
        metadata: asRecord(payload.metadata),
      },
    });
    return NextResponse.json({ capability }, { status: 201 });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
