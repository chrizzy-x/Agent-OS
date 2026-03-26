import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { xPublishNow } from '@/src/integrations/x/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const body = await request.json().catch(() => ({}));
    const draftId = typeof body.draftId === 'string' ? body.draftId : undefined;
    const queueId = typeof body.queueId === 'string' ? body.queueId : undefined;
    const result = await xPublishNow(agentContext, { draftId, queueId });
    return NextResponse.json({ success: true, result }, { status: 200 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}