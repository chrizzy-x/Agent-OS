import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { runInstalledSkill } from '@/src/skills/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const agentContext = requireAgentContext(request.headers);
    const body = await request.json() as {
      skill_slug?: string;
      capability?: string;
      params?: Record<string, unknown>;
    };

    const skillSlug = typeof body.skill_slug === 'string' ? body.skill_slug : '';
    const capability = typeof body.capability === 'string' ? body.capability : '';
    if (!skillSlug || !capability) {
      return NextResponse.json({ error: 'skill_slug and capability are required' }, { status: 400 });
    }

    const execution = await runInstalledSkill({
      agentId: agentContext.agentId,
      skillSlug,
      capability,
      input: body.params ?? {},
    });

    return NextResponse.json({
      success: true,
      result: execution.result,
      execution_time_ms: execution.executionTimeMs,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
