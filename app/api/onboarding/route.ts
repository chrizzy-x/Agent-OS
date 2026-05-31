import { NextRequest, NextResponse } from 'next/server';
import { reconcileAgentOSProvisioning } from '@/src/agentos/provisioning';
import { requireAgentContext } from '@/src/auth/request';
import { createStudioSession, listStudioSessions } from '@/src/studio/persistence';
import { createWorkspace, listWorkspaces } from '@/src/workspaces/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const ctx = requireAgentContext(request.headers);
    await reconcileAgentOSProvisioning(ctx.agentId);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const workspaceName = typeof body.workspaceName === 'string' ? body.workspaceName.trim() : '';
    const starter = typeof body.starter === 'string' ? body.starter : 'Blank Studio';

    let workspace = (await listWorkspaces(ctx.agentId))[0] ?? null;
    if (workspaceName) {
      workspace = await createWorkspace({
        ownerId: ctx.agentId,
        name: workspaceName,
      });
    }
    if (!workspace) {
      const existingSessions = await listStudioSessions(ctx.agentId);
      return NextResponse.json({
        workspace: null,
        session: existingSessions[0] ?? null,
        nextRoute: existingSessions[0] ? `/studio?session=${existingSessions[0].id}` : '/studio',
      });
    }

    const session = await createStudioSession({
      ownerAgentId: ctx.agentId,
      workspaceId: workspace.id,
      title: starter === 'Blank Studio' ? 'AgentOS Studio' : `${starter} Session`,
    });

    return NextResponse.json({
      workspace,
      session,
      nextRoute: `/studio?session=${session.id}`,
    }, { status: 201 });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
