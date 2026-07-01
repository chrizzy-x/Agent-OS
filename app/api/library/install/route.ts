import { NextRequest, NextResponse } from 'next/server';
import { executeAgentOSAction } from '@/src/actions/service';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { toErrorResponse, ValidationError } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const assetType = typeof body.assetType === 'string' ? body.assetType : typeof body.type === 'string' ? body.type : '';
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : null;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
    if (assetType === 'app') {
      const slug = typeof body.slug === 'string' ? body.slug : typeof body.sourceSlug === 'string' ? body.sourceSlug : '';
      const result = await executeAgentOSAction(ctx, {
        action: 'install_app',
        source: 'api',
        workspaceId,
        sessionId,
        payload: {
          slug,
          permissionsApproved: Array.isArray(body.permissionsApproved) ? body.permissionsApproved : [],
        },
      });
      return NextResponse.json(result, { status: 201 });
    }
    if (assetType === 'skill') {
      const payload = typeof body.skillId === 'string'
        ? { skillId: body.skillId, permissionsApproved: Array.isArray(body.permissionsApproved) ? body.permissionsApproved : [] }
        : { slug: typeof body.slug === 'string' ? body.slug : body.sourceSlug, permissionsApproved: Array.isArray(body.permissionsApproved) ? body.permissionsApproved : [] };
      const result = await executeAgentOSAction(ctx, {
        action: 'install_skill',
        source: 'api',
        workspaceId,
        sessionId,
        payload,
      });
      return NextResponse.json(result, { status: 201 });
    }
    throw new ValidationError('Library install supports app and skill assets');
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
