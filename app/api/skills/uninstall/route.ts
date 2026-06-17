import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { executeAgentOSAction } from '@/src/actions/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

// DELETE /api/skills/uninstall - Uninstall a skill
export async function DELETE(request: NextRequest) {
  try {
    const agentCtx = await requireRouteCapability(request.headers, 'skills.install');

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { skill_id } = body as { skill_id?: string };
    if (!skill_id) {
      return NextResponse.json({ error: 'skill_id is required' }, { status: 400 });
    }

    const result = await executeAgentOSAction(agentCtx, {
      action: 'uninstall_skill',
      source: 'manual_ui',
      payload: { skillId: skill_id },
    });
    return NextResponse.json({ ...(result.result as Record<string, unknown>), execution: result.execution });
  } catch (error: unknown) {
    const err = toErrorResponse(error);
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
}
