import { NextRequest, NextResponse } from 'next/server';
import { requireAgentContext } from '@/src/auth/request';
import { runTrackedExecution } from '@/src/execution/service';
import { runInstalledSkill } from '@/src/skills/service';
import { toErrorResponse } from '@/src/utils/errors';
import { sanitizeOutput } from '@/src/utils/output-sanitizer';

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
      return NextResponse.json({ error: 'validation_error', message: 'skill_slug and capability are required' }, { status: 400 });
    }

    const tracked = await runTrackedExecution({
      agentId: agentContext.agentId,
      sourceType: 'skill',
      sourceId: skillSlug,
      skillId: skillSlug,
      title: `Run skill ${skillSlug}.${capability}`,
      input: { capability, params: body.params ?? {} },
      run: () => runInstalledSkill({
        agentId: agentContext.agentId,
        skillSlug,
        capability,
        input: body.params ?? {},
      }),
    });
    const execution = tracked.result;

    return NextResponse.json({
      success: true,
      result: sanitizeOutput(execution.result),
      execution_time_ms: execution.executionTimeMs,
      execution: tracked.execution,
    });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message, whatFailed: err.whatFailed, why: err.why, where: err.where, possibleFix: err.possibleFix }, { status: err.statusCode });
  }
}
