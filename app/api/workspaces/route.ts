import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { createWorkspace, listWorkspaces } from '@/src/workspaces/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

type WorkspaceRecord = Awaited<ReturnType<typeof listWorkspaces>>[number];

function toPublicWorkspace(workspace: WorkspaceRecord) {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    plan: workspace.plan,
    createdAt: workspace.createdAt,
  };
}

export async function GET(request: NextRequest) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const workspaces = await listWorkspaces(agentContext.agentId);
    return NextResponse.json({ workspaces: workspaces.map(toPublicWorkspace) });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const body = await request.json() as { name?: string; slug?: string; plan?: string };

    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'validation_error', message: 'name is required' }, { status: 400 });
    }

    const workspace = await createWorkspace({
      name: body.name.trim(),
      ownerId: agentContext.agentId,
      slug: typeof body.slug === 'string' ? body.slug : undefined,
      plan: typeof body.plan === 'string' ? body.plan : undefined,
    });

    return NextResponse.json({ workspace: toPublicWorkspace(workspace) }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
