import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { transitionPlan } from '@/src/auth/plan-transitions';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

const ALLOWED_TARGETS: Record<string, string[]> = {
  retail_free: ['retail_pro', 'enterprise_plus'],
  retail_pro: ['retail_free', 'enterprise_plus'],
  enterprise_plus: ['retail_pro', 'enterprise_max'],
  enterprise_max: ['enterprise_plus'],
};

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'plan.transition');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const currentPlan = typeof body.currentPlan === 'string' ? body.currentPlan : ctx.tier;
    const newPlan = typeof body.newPlan === 'string' ? body.newPlan : '';
    const reason = typeof body.reason === 'string' ? body.reason : undefined;
    const allowedTargets = ALLOWED_TARGETS[currentPlan] ?? [];
    if (!allowedTargets.includes(newPlan)) {
      return NextResponse.json(
        {
          code: 'VALIDATION_ERROR',
          error: 'Invalid plan transition target',
          message: 'Invalid plan transition target',
        },
        { status: 400 },
      );
    }

    const result = await transitionPlan({
      agentId: ctx.agentId,
      newPlan,
      reason,
      changedBy: ctx.agentId,
    });
    return NextResponse.json({ transition: result });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
