import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/src/auth/agent-identity';
import { requireSdkKernelContext } from '@/src/sdk/auth';
import { cleanupRuntimeSecretGrant, consumeRuntimeSecretGrant } from '@/src/vault/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request.headers.get('authorization') ?? request.headers.get('Authorization') ?? undefined);
    if (!token?.startsWith('sdk_')) {
      return NextResponse.json({ code: 'AUTH_ERROR', error: 'SDK bearer token required', message: 'SDK bearer token required' }, { status: 401 });
    }

    const ctx = await requireSdkKernelContext(token, ['kernel.command', 'kernel.write', 'kernel']);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const grantId = typeof body.grantId === 'string' ? body.grantId : '';
    const action = typeof body.action === 'string' ? body.action : 'consume';
    if (!grantId.trim()) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'grantId is required', message: 'grantId is required' }, { status: 400 });
    }

    if (action === 'cleanup') {
      const grant = await cleanupRuntimeSecretGrant({
        ownerAgentId: ctx.agentId,
        grantId,
      });
      return NextResponse.json({
        cleaned: true,
        grant: {
          id: grant.id,
          name: grant.name,
          subjectType: grant.subjectType,
          subjectId: grant.subjectId,
          status: grant.status,
          expiresAt: grant.expiresAt,
          cleanedUpAt: grant.cleanedUpAt,
        },
      }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const consumed = await consumeRuntimeSecretGrant({
      ownerAgentId: ctx.agentId,
      grantId,
    });
    return NextResponse.json({
      secret: {
        name: consumed.name,
        value: consumed.value,
      },
      grant: {
        id: consumed.grant.id,
        status: consumed.grant.status,
        subjectType: consumed.grant.subjectType,
        subjectId: consumed.grant.subjectId,
        expiresAt: consumed.grant.expiresAt,
        consumedAt: consumed.grant.consumedAt,
      },
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
