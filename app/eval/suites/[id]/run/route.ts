import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { findEvalSuite, triggerEvalRun, executeEvalRun } from '@/src/eval/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const { id } = await params;

    const suite = await findEvalSuite({ suiteId: id, agentId: agentContext.agentId });
    if (!suite) {
      return NextResponse.json({ error: 'not_found', message: 'Eval suite not found' }, { status: 404 });
    }

    const run = await triggerEvalRun({ suite, triggeredBy: agentContext.agentId });
    void executeEvalRun({ run, suite });

    return NextResponse.json({ run }, { status: 202 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
