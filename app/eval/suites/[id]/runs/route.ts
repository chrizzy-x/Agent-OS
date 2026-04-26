import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { listEvalRuns } from '@/src/eval/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireAgentContext(request.headers);
    const { id } = await params;
    const runs = await listEvalRuns(id);
    return NextResponse.json({
      runs: runs.map(run => ({
        id: run.id,
        suite_id: run.suiteId,
        triggered_by: run.triggeredBy,
        status: run.status,
        pass_count: run.passCount,
        fail_count: run.failCount,
        score: run.score,
        started_at: run.startedAt,
        completed_at: run.completedAt,
      })),
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
