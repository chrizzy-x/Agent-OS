import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { getWorkspaceAudit } from '@/src/workspaces/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireAgentContext(request.headers);
    const { id } = await params;
    const audit = await getWorkspaceAudit(id);
    return NextResponse.json({ audit });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
