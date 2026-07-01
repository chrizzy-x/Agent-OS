import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { approveConfirmation } from '@/src/confirmations/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const { id } = await params;
    const confirmation = await approveConfirmation({ userId: ctx.agentId, confirmationId: id });
    return NextResponse.json({ confirmation });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
