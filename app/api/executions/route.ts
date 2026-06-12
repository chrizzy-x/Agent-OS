import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { createExecution, listExecutions, type ExecutionSourceType, type ExecutionStatus } from '@/src/execution/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    const url = new URL(request.url);
    const executions = await listExecutions({
      agentId: ctx.agentId,
      workspaceId: url.searchParams.get('workspaceId'),
      sessionId: url.searchParams.get('sessionId'),
      status: (url.searchParams.get('status') ?? 'all') as ExecutionStatus | 'all',
      sourceType: (url.searchParams.get('sourceType') ?? 'all') as ExecutionSourceType | 'all',
      workflowId: url.searchParams.get('workflowId'),
      appId: url.searchParams.get('appId'),
      skillId: url.searchParams.get('skillId'),
      search: url.searchParams.get('search'),
      limit: Number(url.searchParams.get('limit') ?? 100),
    });
    return NextResponse.json({ executions });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const execution = await createExecution({
      agentId: ctx.agentId,
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : null,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
      sourceType: typeof body.sourceType === 'string' ? body.sourceType as ExecutionSourceType : 'super_agent',
      sourceId: typeof body.sourceId === 'string' ? body.sourceId : null,
      workflowId: typeof body.workflowId === 'string' ? body.workflowId : null,
      appId: typeof body.appId === 'string' ? body.appId : null,
      skillId: typeof body.skillId === 'string' ? body.skillId : null,
      mcpServer: typeof body.mcpServer === 'string' ? body.mcpServer : null,
      mcpTool: typeof body.mcpTool === 'string' ? body.mcpTool : null,
      title: typeof body.title === 'string' ? body.title : 'Manual execution',
      input: body.input && typeof body.input === 'object' && !Array.isArray(body.input) ? body.input as Record<string, unknown> : {},
      model: typeof body.model === 'string' ? body.model : null,
    });
    return NextResponse.json({ execution }, { status: 201 });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
