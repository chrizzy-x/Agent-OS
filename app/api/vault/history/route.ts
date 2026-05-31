import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { listVaultAccessHistory } from '@/src/vault/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'vault.manage');
    const { searchParams } = new URL(request.url);
    const secretId = searchParams.get('secretId') ?? undefined;
    const limitRaw = Number(searchParams.get('limit') ?? '100');
    const limit = Number.isFinite(limitRaw) ? limitRaw : 100;
    const history = await listVaultAccessHistory({
      ownerAgentId: ctx.agentId,
      secretId,
      limit,
    });
    return NextResponse.json({ history });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
