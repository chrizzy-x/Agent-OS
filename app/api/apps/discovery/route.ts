import { NextRequest, NextResponse } from 'next/server';
import { omitAgentIdentifierFields } from '@/src/auth/display-redaction';
import { requireAgentContext } from '@/src/auth/request';
import { getAppStoreDiscovery } from '@/src/appstore/discovery';
import { listWorkspaces } from '@/src/workspaces/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let viewerAgentId: string | null = null;
    let viewerWorkspaceIds: string[] = [];
    try {
      const ctx = requireAgentContext(request.headers);
      viewerAgentId = ctx.agentId;
      viewerWorkspaceIds = (await listWorkspaces(ctx.agentId)).map(workspace => workspace.id);
    } catch {
      viewerAgentId = null;
    }

    const discovery = await getAppStoreDiscovery({
      viewerAgentId,
      viewerWorkspaceIds,
      query: searchParams.get('search'),
      category: searchParams.get('category'),
    });

    return NextResponse.json(omitAgentIdentifierFields(discovery));
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
