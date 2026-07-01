import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContextWithTier } from '@/src/auth/request';
import { createConfirmation, listConfirmations, type ConfirmationStatus, type RiskLevel } from '@/src/confirmations/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const { searchParams } = new URL(request.url);
    const confirmations = await listConfirmations({
      userId: ctx.agentId,
      status: (searchParams.get('status') ?? 'all') as ConfirmationStatus | 'all',
      taskId: searchParams.get('taskId'),
      limit: Number(searchParams.get('limit') ?? 100),
    });
    return NextResponse.json({ confirmations });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const confirmation = await createConfirmation({
      userId: ctx.agentId,
      taskId: typeof body.taskId === 'string' ? body.taskId : null,
      capabilityId: typeof body.capabilityId === 'string' ? body.capabilityId : null,
      actionId: typeof body.actionId === 'string' ? body.actionId : null,
      actionName: typeof body.actionName === 'string' ? body.actionName : 'Action',
      riskLevel: (body.riskLevel === 'medium' || body.riskLevel === 'high' || body.riskLevel === 'critical' ? body.riskLevel : 'low') as RiskLevel,
      dataSummary: typeof body.dataSummary === 'string' ? body.dataSummary : '',
      secretScopes: stringArray(body.secretScopes),
      expectedResult: typeof body.expectedResult === 'string' ? body.expectedResult : '',
      payload: asRecord(body.payload),
      requiredApprovals: typeof body.requiredApprovals === 'number' ? body.requiredApprovals : undefined,
    });
    return NextResponse.json({ confirmation }, { status: 201 });
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
