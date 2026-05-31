import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import {
  addWorkspaceMember,
  assertWorkspaceMembership,
  assertWorkspaceOwnership,
  listWorkspaceMembers,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
} from '@/src/workspaces/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

type WorkspaceMemberRecord = Awaited<ReturnType<typeof addWorkspaceMember>>;

function toPublicWorkspaceMember(member: WorkspaceMemberRecord) {
  return {
    userId: member.userId,
    role: member.role,
    joinedAt: member.joinedAt,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const { id } = await params;
    await assertWorkspaceMembership(id, agentContext.agentId);
    const members = await listWorkspaceMembers(id);
    return NextResponse.json({ members });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const { id } = await params;
    await assertWorkspaceOwnership(id, agentContext.agentId);
    const body = await request.json() as { user_id?: string; role?: 'owner' | 'admin' | 'member' | 'viewer' };

    if (typeof body.user_id !== 'string' || !body.user_id.trim()) {
      return NextResponse.json({ error: 'validation_error', message: 'user_id is required' }, { status: 400 });
    }

    const member = await addWorkspaceMember({
      workspaceId: id,
      userId: body.user_id.trim(),
      role: body.role ?? 'member',
      actorId: agentContext.agentId,
    });

    return NextResponse.json({ member: toPublicWorkspaceMember(member) }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
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
    const body = await request.json().catch(() => ({})) as { user_id?: string; role?: 'owner' | 'admin' | 'member' | 'viewer' };

    if (typeof body.user_id !== 'string' || !body.user_id.trim()) {
      return NextResponse.json({ error: 'validation_error', message: 'user_id is required' }, { status: 400 });
    }
    if (!body.role) {
      return NextResponse.json({ error: 'validation_error', message: 'role is required' }, { status: 400 });
    }

    const member = await updateWorkspaceMemberRole({
      workspaceId: id,
      userId: body.user_id.trim(),
      role: body.role,
      actorId: agentContext.agentId,
    });

    return NextResponse.json({ member: toPublicWorkspaceMember(member) });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const { id } = await params;
    await assertWorkspaceOwnership(id, agentContext.agentId);
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id') ?? searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'validation_error', message: 'user_id is required' }, { status: 400 });
    }

    const result = await removeWorkspaceMember({
      workspaceId: id,
      userId,
      actorId: agentContext.agentId,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
