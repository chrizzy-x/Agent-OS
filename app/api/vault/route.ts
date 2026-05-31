import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import {
  deleteVaultSecret,
  listVaultSecrets,
  rotateVaultSecret,
  setVaultSecretStatus,
  upsertVaultSecret,
} from '@/src/vault/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'vault.manage');
    const { searchParams } = new URL(request.url);
    const result = await listVaultSecrets({
      ownerAgentId: ctx.agentId,
      workspaceId: searchParams.get('workspaceId') ?? undefined,
      search: searchParams.get('search') ?? undefined,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'vault.manage');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const secret = await upsertVaultSecret({
      ownerAgentId: ctx.agentId,
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : undefined,
      name: typeof body.name === 'string' ? body.name : '',
      value: typeof body.value === 'string' ? body.value : '',
    });
    return NextResponse.json({ secret }, { status: 201 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'vault.manage');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';
    const secretId = typeof body.secretId === 'string' ? body.secretId : '';
    if (!secretId) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'secretId is required', message: 'secretId is required' }, { status: 400 });
    }

    if (action === 'disable' || action === 'enable') {
      const secret = await setVaultSecretStatus({
        ownerAgentId: ctx.agentId,
        secretId,
        status: action === 'disable' ? 'disabled' : 'active',
      });
      return NextResponse.json({ secret });
    }

    if (action === 'rotate') {
      const secret = await rotateVaultSecret({
        ownerAgentId: ctx.agentId,
        secretId,
        value: typeof body.value === 'string' ? body.value : '',
      });
      return NextResponse.json({ secret });
    }

    return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'Unsupported vault action', message: 'Unsupported vault action' }, { status: 400 });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'vault.manage');
    const { searchParams } = new URL(request.url);
    const secretId = searchParams.get('secretId');
    if (!secretId) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'secretId is required', message: 'secretId is required' }, { status: 400 });
    }
    const result = await deleteVaultSecret({ ownerAgentId: ctx.agentId, secretId });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
