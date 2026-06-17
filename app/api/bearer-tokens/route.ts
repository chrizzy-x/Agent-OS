import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { createBearerToken, listBearerTokens, revokeBearerToken, updateBearerToken } from '@/src/auth/bearer-tokens';
import { createNotification } from '@/src/notifications/service';
import { toErrorResponse, ValidationError } from '@/src/utils/errors';

export const runtime = 'nodejs';

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

async function bodyJson(request: NextRequest): Promise<Record<string, unknown>> {
  return request.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'session.token.issue');
    const tokens = await listBearerTokens(ctx.agentId);
    return NextResponse.json({ tokens });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'session.token.issue');
    const body = await bodyJson(request);
    const result = await createBearerToken({
      ownerAgentId: ctx.agentId,
      name: typeof body.name === 'string' ? body.name : undefined,
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : null,
      projectId: typeof body.projectId === 'string' ? body.projectId : null,
      subjectType: typeof body.subjectType === 'string' ? body.subjectType : null,
      subjectId: typeof body.subjectId === 'string' ? body.subjectId : null,
      scopes: stringArray(body.scopes),
      permissions: stringArray(body.permissions),
      expiresAt: body.expiresAt,
    });
    await createNotification({
      agentId: ctx.agentId,
      workspaceId: result.token.workspaceId,
      type: 'security',
      title: 'Bearer token created',
      body: `${result.token.name} was created. Copy the token now; it will not be shown again.`,
      metadata: { tokenId: result.token.id, scopes: result.token.scopes },
    }).catch(() => undefined);
    return NextResponse.json({
      token: result.token,
      bearerToken: result.bearerToken,
      oneTimeReveal: true,
    }, { status: 201 });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'session.token.issue');
    const body = await bodyJson(request);
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) throw new ValidationError('id is required');
    const action = body.action === 'rotate' || body.action === 'revoke' ? body.action : undefined;
    const result = await updateBearerToken({
      ownerAgentId: ctx.agentId,
      id,
      name: typeof body.name === 'string' ? body.name : undefined,
      scopes: body.scopes,
      permissions: body.permissions,
      action,
    });
    await createNotification({
      agentId: ctx.agentId,
      workspaceId: result.token.workspaceId,
      type: 'security',
      title: action === 'revoke' ? 'Bearer token revoked' : action === 'rotate' ? 'Bearer token rotated' : 'Bearer token updated',
      body: `${result.token.name} is now ${result.token.status}.`,
      metadata: { tokenId: result.token.id, action: action ?? 'update' },
    }).catch(() => undefined);
    return NextResponse.json({
      token: result.token,
      bearerToken: result.bearerToken,
      oneTimeReveal: Boolean(result.bearerToken),
    });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'session.token.issue');
    const url = new URL(request.url);
    const body = await bodyJson(request);
    const id = url.searchParams.get('id') ?? (typeof body.id === 'string' ? body.id : '');
    if (!id) throw new ValidationError('id is required');
    const token = await revokeBearerToken(ctx.agentId, id);
    return NextResponse.json({ revoked: true, token });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
