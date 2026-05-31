import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { assignVaultSecret, listVaultAssignments, unassignVaultSecret } from '@/src/vault/service';
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
    const assignments = await listVaultAssignments({
      ownerAgentId: ctx.agentId,
      secretId,
    });
    return NextResponse.json({ assignments });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'vault.manage');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const secretId = typeof body.secretId === 'string' ? body.secretId : '';
    const subjectType = typeof body.subjectType === 'string' ? body.subjectType : '';
    const subjectId = typeof body.subjectId === 'string' ? body.subjectId : '';
    if (!secretId || !subjectType || !subjectId) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'secretId, subjectType, and subjectId are required', message: 'secretId, subjectType, and subjectId are required' }, { status: 400 });
    }
    const assignment = await assignVaultSecret({
      ownerAgentId: ctx.agentId,
      secretId,
      subjectType,
      subjectId,
    });
    return NextResponse.json({ assignment }, { status: 201 });
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
    const subjectType = searchParams.get('subjectType');
    const subjectId = searchParams.get('subjectId');
    if (!secretId || !subjectType || !subjectId) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'secretId, subjectType, and subjectId are required', message: 'secretId, subjectType, and subjectId are required' }, { status: 400 });
    }
    const result = await unassignVaultSecret({
      ownerAgentId: ctx.agentId,
      secretId,
      subjectType,
      subjectId,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
