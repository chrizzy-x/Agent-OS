import { NextRequest, NextResponse } from 'next/server';
import { requireRouteCapability } from '@/src/auth/request';
import { executePanicAction, getPanicStatus, type PanicAction, type PanicStatus } from '@/src/panic/service';
import { createNotification } from '@/src/notifications/service';
import { assertWorkspaceMembership, resolveDefaultWorkspaceForAgent } from '@/src/workspaces/service';
import { toErrorResponse } from '@/src/utils/errors';

export const runtime = 'nodejs';
const DEFAULT_PANIC_STATUS_TIMEOUT_MS = 5_000;

function panicStatusTimeoutMs(): number {
  const configured = Number(process.env.AGENTOS_PANIC_STATUS_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_PANIC_STATUS_TIMEOUT_MS;
  return Math.max(100, Math.min(Math.floor(configured), 15_000));
}

function pendingPanicStatus(): PanicStatus {
  return {
    state: 'warning',
    activeCount: 0,
    mcpDisabled: false,
    vaultDisabled: false,
    requireReauth: false,
    reason: 'Panic status is still loading. AgentOS will retry automatically.',
    executions: [],
  };
}

async function withPanicStatusTimeout(promise: Promise<PanicStatus>): Promise<PanicStatus> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<PanicStatus>(resolve => {
        timeout = setTimeout(() => resolve(pendingPanicStatus()), panicStatusTimeoutMs());
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function resolvePanicWorkspace(agentId: string, requestedWorkspaceId: string | null): Promise<string | null> {
  if (requestedWorkspaceId) {
    return (await assertWorkspaceMembership(requestedWorkspaceId, agentId)).workspace.id;
  }
  return (await resolveDefaultWorkspaceForAgent(agentId))?.id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.read');
    const url = new URL(request.url);
    const status = await withPanicStatusTimeout((async () => {
      const workspaceId = await resolvePanicWorkspace(ctx.agentId, url.searchParams.get('workspaceId'));
      const sessionId = url.searchParams.get('sessionId');
      return getPanicStatus({
        agentId: ctx.agentId,
        workspaceId,
        sessionId,
      });
    })());
    return NextResponse.json(status);
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRouteCapability(request.headers, 'studio.sessions.update');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const workspaceId = await resolvePanicWorkspace(ctx.agentId, typeof body.workspaceId === 'string' ? body.workspaceId : null);
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
    const action: PanicAction = body.action === 'pause' || body.action === 'lockdown' ? body.action : 'stop_all';
    const result = await executePanicAction({
      agentId: ctx.agentId,
      workspaceId,
      sessionId,
      action,
    });
    await createNotification({
      agentId: ctx.agentId,
      workspaceId,
      sessionId,
      type: 'panic',
      title: action === 'lockdown' ? 'Panic lockdown enabled' : action === 'pause' ? 'Panic pause completed' : 'Panic stop completed',
      body: action === 'lockdown'
        ? `${result.affected} active execution${result.affected === 1 ? '' : 's'} stopped. MCP and Vault runtime grants are disabled until re-authentication.`
        : `${result.affected} active execution${result.affected === 1 ? '' : 's'} ${action === 'pause' ? 'paused' : 'stopped'}.`,
      metadata: { action, affected: result.affected, vaultRuntimeGrantsRevoked: result.vaultRuntimeGrantsRevoked },
    }).catch(() => undefined);
    return NextResponse.json(result);
  } catch (error) {
    const err = toErrorResponse(error);
    return NextResponse.json({ code: err.code, error: err.message, message: err.message }, { status: err.statusCode });
  }
}
