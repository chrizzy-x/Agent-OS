import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { createEvalSuite, listEvalSuites } from '@/src/eval/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const suites = await listEvalSuites(agentContext.agentId);
    return NextResponse.json({ suites });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const body = await request.json() as { name?: string };

    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'validation_error', message: 'name is required' }, { status: 400 });
    }

    const suite = await createEvalSuite({
      name: body.name.trim(),
      agentId: agentContext.agentId,
      createdBy: agentContext.agentId,
    });

    return NextResponse.json({ suite }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
