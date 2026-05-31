import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { grantRuntimeSecretAccess, validateRequiredSecrets } from '@/src/vault/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'vault.manage');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : 'validate';
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : undefined;

    if (action === 'validate') {
      const names = Array.isArray(body.names)
        ? body.names.filter((item): item is string => typeof item === 'string')
        : [];
      const result = await validateRequiredSecrets({
        ownerAgentId: ctx.agentId,
        workspaceId,
        names,
      });
      return NextResponse.json(result);
    }

    if (action === 'runtime') {
      const name = typeof body.name === 'string' ? body.name : '';
      if (!name.trim()) {
        return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'name is required', message: 'name is required' }, { status: 400 });
      }
      const grant = await grantRuntimeSecretAccess({
        ownerAgentId: ctx.agentId,
        workspaceId,
        name,
        subjectType: typeof body.subjectType === 'string' ? body.subjectType : undefined,
        subjectId: typeof body.subjectId === 'string' ? body.subjectId : undefined,
      });
      grant.cleanup();
      return NextResponse.json({ granted: true, name: grant.name });
    }

    return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'Unsupported vault access action', message: 'Unsupported vault access action' }, { status: 400 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
