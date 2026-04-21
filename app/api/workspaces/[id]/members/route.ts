import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { addWorkspaceMember } from '@/src/workspaces/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const { id } = await params;
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

    return NextResponse.json({ member }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
