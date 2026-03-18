import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { executeStudioCommand } from '@/src/studio/service';
import type { StudioCommandRequest, StudioCommandResponse } from '@/src/studio/types';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let command = '';

  try {
    const agentContext = requireAgentContext(request.headers);
    const body = await request.json() as StudioCommandRequest;
    command = typeof body.command === 'string' ? body.command : '';

    const response = await executeStudioCommand({
      agentContext,
      command,
      confirmToken: typeof body.confirmToken === 'string' ? body.confirmToken : undefined,
      advancedMode: body.advancedMode === true,
    });

    return NextResponse.json(response);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    const response: StudioCommandResponse = {
      kind: 'error',
      command,
      mutating: false,
      summary: err.message,
      warnings: [err.code],
    };

    return NextResponse.json(response, { status: err.statusCode });
  }
}
