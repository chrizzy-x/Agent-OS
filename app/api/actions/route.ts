import { NextRequest, NextResponse } from 'next/server';
import { hasAdminAccess, requireAgentContextWithTier } from '@/src/auth/request';
import { executeAgentOSAction, type AgentOSActionSource, type AgentOSActionType } from '@/src/actions/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';

const ACTIONS = new Set<AgentOSActionType>([
  'install_app',
  'open_app',
  'configure_app',
  'update_app',
  'uninstall_app',
  'pin_app',
  'install_skill',
  'uninstall_skill',
  'create_workflow',
  'run_workflow',
  'publish_workflow',
  'create_project',
  'update_project',
  'create_subagent',
  'publish_app',
  'publish_skill',
  'panic_pause',
  'panic_stop_all',
  'panic_lockdown',
]);

function normalizeSource(value: unknown): AgentOSActionSource {
  return value === 'natural_language' || value === 'manual_ui' || value === 'system' ? value : 'api';
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAgentContextWithTier(request.headers);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof body.action === 'string' && ACTIONS.has(body.action as AgentOSActionType)
      ? body.action as AgentOSActionType
      : null;
    if (!action) {
      return NextResponse.json({ code: 'VALIDATION_ERROR', error: 'Unsupported action', message: 'Unsupported action' }, { status: 400 });
    }

    const payload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? body.payload as Record<string, unknown>
      : {};
    const result = await executeAgentOSAction(ctx, {
      action,
      source: normalizeSource(body.source),
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : null,
      projectId: typeof body.projectId === 'string' ? body.projectId : null,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : null,
      payload,
      canManageAll: hasAdminAccess(request.headers),
    });
    return NextResponse.json(result);
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
