import { NextRequest, NextResponse } from 'next/server';
import { executeStudioCommand } from '@/src/studio/service';
import { getPrivateSubagent } from '@/src/subagents/service';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const { id } = await params;
    await getPrivateSubagent(ctx.agentId, id);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const command = typeof body.command === 'string'
      ? body.command
      : typeof body.prompt === 'string'
        ? body.prompt
        : '';

    if (!command.trim()) {
      return NextResponse.json({ error: 'command is required', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    const result = await executeStudioCommand({
      agentContext: ctx,
      command,
      confirmToken: typeof body.confirmToken === 'string' ? body.confirmToken : undefined,
      advancedMode: body.advancedMode === true,
    });

    return NextResponse.json({
      subagentId: id,
      result,
    });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
  }
}
