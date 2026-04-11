import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { executeUniversalToolCall } from '@/src/mcp/registry';
import {
  buildCanonicalToolError,
  normalizeCanonicalToolInput,
  normalizeCanonicalToolName,
  normalizeCanonicalToolResult,
} from '@/src/mcp/canonical';
import { assertExternalAgentToolAccess, trackExternalAgentCall } from '@/src/external-agents/service';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let toolName = '';

  try {
    const agentContext = requireAgentContext(req.headers);
    const body = await req.json() as {
      tool?: string;
      input?: Record<string, unknown>;
      arguments?: Record<string, unknown>;
      server?: string;
    };

    toolName = typeof body.tool === 'string' ? body.tool : '';
    if (!toolName) {
      return NextResponse.json(
        { error: 'validation_error', message: 'Request must include "tool" field' },
        { status: 400 },
      );
    }

    const normalizedTool = normalizeCanonicalToolName(toolName);
    const normalizedInput = normalizeCanonicalToolInput(normalizedTool, body.input ?? body.arguments ?? {});

    await assertExternalAgentToolAccess(agentContext.agentId, toolName);

    const result = await executeUniversalToolCall({
      agentContext,
      name: normalizedTool,
      server: typeof body.server === 'string' ? body.server : undefined,
      arguments: normalizedInput,
    });

    void trackExternalAgentCall(agentContext.agentId).catch(() => {});

    return NextResponse.json({ success: true, result: normalizeCanonicalToolResult(normalizedTool, result) });
  } catch (error: unknown) {
    const failure = buildCanonicalToolError(toolName, error);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}