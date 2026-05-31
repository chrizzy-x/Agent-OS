import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { listVaultSecretVersions } from '@/src/vault/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'vault.manage');
    const { searchParams } = new URL(request.url);
    const secretId = searchParams.get('secretId');
    if (!secretId) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'secretId is required', message: 'secretId is required' }, { status: 400 });
    }

    const versions = await listVaultSecretVersions({
      ownerAgentId: ctx.agentId,
      secretId,
    });
    return NextResponse.json({ versions });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
