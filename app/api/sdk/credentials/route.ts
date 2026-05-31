import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { createSdkCredential, listSdkCredentials, revokeSdkCredential } from '@/src/sdk/credentials';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'sdk.credentials');
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId') ?? undefined;
    const credentials = await listSdkCredentials({
      ownerAgentId: ctx.agentId,
      workspaceId,
    });
    return NextResponse.json({ credentials });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'sdk.credentials');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : undefined;
    const name = typeof body.name === 'string' ? body.name : '';
    const scopes = Array.isArray(body.scopes) ? body.scopes.filter((item): item is string => typeof item === 'string') : [];
    const expiresAt = typeof body.expiresAt === 'string' ? body.expiresAt : undefined;

    const created = await createSdkCredential({
      ownerAgentId: ctx.agentId,
      workspaceId,
      name,
      scopes,
      expiresAt: expiresAt ?? null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'sdk.credentials');
    const { searchParams } = new URL(request.url);
    const credentialId = searchParams.get('credentialId');
    const workspaceId = searchParams.get('workspaceId') ?? undefined;
    if (!credentialId) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'credentialId is required', message: 'credentialId is required' }, { status: 400 });
    }
    const credential = await revokeSdkCredential({
      ownerAgentId: ctx.agentId,
      workspaceId,
      credentialId,
    });
    return NextResponse.json({ credential });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
