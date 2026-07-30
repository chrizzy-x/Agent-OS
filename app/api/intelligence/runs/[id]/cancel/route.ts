import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { cancelMultiIntelligenceRun } from '@/src/intelligence/workers';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.intent');
    const { id } = await params;
    const run = await cancelMultiIntelligenceRun({
      ownerAgentId: ctx.agentId,
      runId: id,
    });
    return NextResponse.json({ run });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
