import { NextRequest, NextResponse } from 'next/server';
import { assertAgentAppPermissionAccess } from '@/src/appstore/service';
import { requireRouteCapability } from '@/src/auth/request';
import { createRuntimeSecretGrant, validateRequiredSecrets } from '@/src/vault/service';
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
      const appSlug = typeof body.appSlug === 'string' ? body.appSlug : '';
      const appAccess = appSlug
        ? await assertAgentAppPermissionAccess({
          agentId: ctx.agentId,
          slug: appSlug,
          permission: 'vault',
        })
        : null;
      const grant = await createRuntimeSecretGrant({
        ownerAgentId: ctx.agentId,
        workspaceId,
        name,
        subjectType: typeof body.subjectType === 'string'
          ? body.subjectType
          : appAccess
            ? 'app'
            : undefined,
        subjectId: typeof body.subjectId === 'string'
          ? body.subjectId
          : appAccess
            ? appAccess.app.id
            : undefined,
        appSlug: appAccess?.app.slug ?? (typeof body.appSlug === 'string' ? body.appSlug : undefined),
        expiresInMs: typeof body.expiresInMs === 'number' ? body.expiresInMs : undefined,
      });
      return NextResponse.json({
        granted: true,
        grant: {
          id: grant.id,
          name: grant.name,
          subjectType: grant.subjectType,
          subjectId: grant.subjectId,
          status: grant.status,
          expiresAt: grant.expiresAt,
        },
        appSlug: appAccess?.app.slug ?? null,
      });
    }

    return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'Unsupported vault access action', message: 'Unsupported vault access action' }, { status: 400 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
