import { NextRequest, NextResponse } from 'next/server';
import { transitionPlan } from '@/src/auth/plan-transitions';
import { requireRouteCapability } from '@/src/auth/request';
import { isValidPlan, normalizePlan } from '@/src/auth/tiers';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'plan.transition');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const newPlan = typeof body.newPlan === 'string' ? body.newPlan : '';
    const reason = typeof body.reason === 'string' && body.reason.trim()
      ? body.reason.trim()
      : 'beta_self_serve_upgrade';

    if (!isValidPlan(newPlan)) {
      return NextResponse.json({
        code: 'VALIDATION_ERROR',
        error: 'newPlan must be one of retail_free, retail_pro, enterprise_plus, enterprise_max',
        message: 'newPlan must be one of retail_free, retail_pro, enterprise_plus, enterprise_max',
      }, { status: 400 });
    }

    if (normalizePlan(ctx.tier) === newPlan) {
      return NextResponse.json({
        transitioned: false,
        noChange: true,
        billing: {
          mode: 'free_beta',
          charged: false,
        },
      });
    }

    const transition = await transitionPlan({
      agentId: ctx.agentId,
      newPlan,
      reason,
      changedBy: ctx.agentId,
    });

    return NextResponse.json({
      transitioned: true,
      noChange: false,
      transition,
      billing: {
        mode: 'free_beta',
        charged: false,
      },
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
