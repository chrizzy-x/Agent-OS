import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { assertWorkspaceMembership, assertWorkspaceOwnership, updateWorkspace } from '@/src/workspaces/service';
import { getSupabaseAdmin } from '@/src/storage/supabase';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const { id } = await params;
    const membership = await assertWorkspaceMembership(id, agentContext.agentId);

    let metadata: Record<string, unknown> = {};
    try {
      const { data } = await getSupabaseAdmin()
        .from('workspaces')
        .select('metadata,updated_at')
        .eq('id', id)
        .maybeSingle();
      metadata = ((data?.metadata as Record<string, unknown> | null | undefined) ?? {});
    } catch {
      metadata = {};
    }

    return NextResponse.json({
      workspace: {
        id: membership.workspace.id,
        name: membership.workspace.name,
        slug: membership.workspace.slug,
        ownerId: membership.workspace.ownerId,
        plan: membership.workspace.plan,
        createdAt: membership.workspace.createdAt,
        role: membership.role,
        metadata,
      },
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const { id } = await params;
    await assertWorkspaceOwnership(id, agentContext.agentId);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    const workspace = await updateWorkspace({
      workspaceId: id,
      actorId: agentContext.agentId,
      name: typeof body.name === 'string' ? body.name : undefined,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : undefined,
    });

    return NextResponse.json({ workspace });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
