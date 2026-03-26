import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { executeUniversalToolCall } from '@/src/mcp/registry';
import { assertExternalAgentToolAccess, trackExternalAgentCall } from '@/src/external-agents/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const agentContext = requireAgentContext(req.headers);
    const body = await req.json() as {
      tool?: string;
      input?: Record<string, unknown>;
      arguments?: Record<string, unknown>;
      server?: string;
    };

    const toolName = typeof body.tool === 'string' ? body.tool : '';
    if (!toolName) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Request must include "tool" field' } },
        { status: 400 },
      );
    }

    await assertExternalAgentToolAccess(agentContext.agentId, toolName);

    const result = await executeUniversalToolCall({
      agentContext,
      name: toolName,
      server: typeof body.server === 'string' ? body.server : undefined,
      arguments: body.input ?? body.arguments ?? {},
    });

    void trackExternalAgentCall(agentContext.agentId).catch(() => {});

    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err }, { status: err.statusCode });
  }
}
