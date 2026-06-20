import { getSupabaseAdmin } from '../storage/supabase.js';
import {
  isExecutionActiveStatus,
  listExecutions,
  requestExecutionAction,
  type ExecutionRecord,
} from '../execution/service.js';
import { PermissionError, ValidationError } from '../utils/errors.js';

export type PanicState = 'healthy' | 'warning' | 'heavy_activity' | 'emergency';
export type PanicAction = 'pause' | 'stop_all' | 'lockdown';

export type PanicStatus = {
  state: PanicState;
  activeCount: number;
  mcpDisabled: boolean;
  vaultDisabled: boolean;
  requireReauth: boolean;
  reason: string | null;
  executions: ExecutionRecord[];
};

type RuntimeControl = {
  panicState: PanicState;
  mcpDisabled: boolean;
  vaultDisabled: boolean;
  requireReauth: boolean;
  reason: string | null;
};

function mapControl(row: Record<string, unknown> | null | undefined): RuntimeControl | null {
  if (!row) return null;
  return {
    panicState: row.panic_state === 'emergency' || row.panic_state === 'heavy_activity' || row.panic_state === 'warning'
      ? row.panic_state
      : 'healthy',
    mcpDisabled: row.mcp_disabled === true,
    vaultDisabled: row.vault_disabled === true,
    requireReauth: row.require_reauth === true,
    reason: typeof row.reason === 'string' ? row.reason : null,
  };
}

async function loadRuntimeControl(agentId: string): Promise<RuntimeControl | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('agent_runtime_controls')
      .select('panic_state,mcp_disabled,vault_disabled,require_reauth,reason')
      .eq('agent_id', agentId)
      .maybeSingle();
    if (error) return null;
    return mapControl(data as Record<string, unknown> | null);
  } catch {
    return null;
  }
}

function inferState(activeCount: number, control: RuntimeControl | null): PanicState {
  if (control?.panicState === 'emergency' || control?.mcpDisabled || control?.vaultDisabled) return 'emergency';
  if (activeCount >= 5) return 'heavy_activity';
  if (activeCount > 0) return 'warning';
  return 'healthy';
}

async function writeRuntimeControl(params: {
  agentId: string;
  workspaceId?: string | null;
  state: PanicState;
  mcpDisabled: boolean;
  vaultDisabled: boolean;
  requireReauth: boolean;
  reason: string;
  lastAction?: PanicAction | null;
  lastExecutionId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const now = new Date().toISOString();
    await getSupabaseAdmin()
      .from('agent_runtime_controls')
      .upsert({
        agent_id: params.agentId,
        workspace_id: params.workspaceId ?? null,
        panic_state: params.state,
        mcp_disabled: params.mcpDisabled,
        vault_disabled: params.vaultDisabled,
        require_reauth: params.requireReauth,
        reason: params.reason,
        last_action: params.lastAction ?? null,
        last_action_at: now,
        last_execution_id: params.lastExecutionId ?? null,
        metadata: params.metadata ?? {},
        updated_at: now,
      }, { onConflict: 'agent_id' });
  } catch {
    // Runtime control persistence is best-effort until migration 027 is applied.
  }
}

async function cleanActiveVaultRuntimeGrants(agentId: string): Promise<number> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('vault_runtime_grants')
      .update({
        status: 'cleaned',
        cleaned_up_at: new Date().toISOString(),
      })
      .eq('owner_agent_id', agentId)
      .eq('status', 'active')
      .select('id');
    if (error) return 0;
    return (data ?? []).length;
  } catch {
    return 0;
  }
}

export async function getPanicStatus(params: {
  agentId: string;
  workspaceId?: string | null;
  sessionId?: string | null;
}): Promise<PanicStatus> {
  const [executions, control] = await Promise.all([
    listExecutions({
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      sessionId: params.sessionId,
      status: 'all',
      limit: 250,
    }),
    loadRuntimeControl(params.agentId),
  ]);
  const active = executions.filter(item => isExecutionActiveStatus(item.status));
  return {
    state: inferState(active.length, control),
    activeCount: active.length,
    mcpDisabled: control?.mcpDisabled ?? false,
    vaultDisabled: control?.vaultDisabled ?? false,
    requireReauth: control?.requireReauth ?? false,
    reason: control?.reason ?? null,
    executions: active,
  };
}

export async function executePanicAction(params: {
  agentId: string;
  workspaceId?: string | null;
  sessionId?: string | null;
  action: PanicAction;
}): Promise<PanicStatus & { affected: number; vaultRuntimeGrantsRevoked: number }> {
  const status = await getPanicStatus(params);
  const nextAction = params.action === 'pause' ? 'pause' : 'cancel';
  const affected: ExecutionRecord[] = [];
  const skipped: string[] = [];
  for (const execution of status.executions) {
    try {
      affected.push(await requestExecutionAction({
        agentId: params.agentId,
        executionId: execution.id,
        action: nextAction,
      }));
    } catch {
      skipped.push(execution.id);
    }
  }

  if (status.executions.length > 0 && affected.length === 0) {
    throw new ValidationError('No active executions could be changed. Refresh the workspace and retry panic control.');
  }

  let vaultRuntimeGrantsRevoked = 0;
  if (params.action === 'lockdown') {
    vaultRuntimeGrantsRevoked = await cleanActiveVaultRuntimeGrants(params.agentId);
    await writeRuntimeControl({
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      state: 'emergency',
      mcpDisabled: true,
      vaultDisabled: true,
      requireReauth: true,
      reason: 'Panic lockdown',
      lastAction: params.action,
      lastExecutionId: affected[0]?.id ?? null,
      metadata: {
        sessionId: params.sessionId ?? null,
        stoppedExecutions: affected.length,
        skippedExecutions: skipped,
        vaultRuntimeGrantsRevoked,
      },
    });
  } else {
    const control = await loadRuntimeControl(params.agentId);
    await writeRuntimeControl({
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      state: params.action === 'pause' && affected.length > 0 ? 'warning' : 'healthy',
      mcpDisabled: control?.mcpDisabled ?? false,
      vaultDisabled: control?.vaultDisabled ?? false,
      requireReauth: control?.requireReauth ?? false,
      reason: params.action === 'pause' ? 'Panic pause' : 'Panic stop all',
      lastAction: params.action,
      lastExecutionId: affected[0]?.id ?? null,
      metadata: {
        sessionId: params.sessionId ?? null,
        affectedExecutions: affected.length,
        skippedExecutions: skipped,
      },
    });
  }

  const nextStatus = await getPanicStatus(params);
  return {
    ...nextStatus,
    affected: affected.length,
    vaultRuntimeGrantsRevoked,
  };
}

export async function assertMcpRuntimeAllowed(agentId: string): Promise<void> {
  const control = await loadRuntimeControl(agentId);
  if (control?.mcpDisabled) {
    throw new PermissionError('MCP is disabled by Panic lockdown. Re-authentication is required before external MCP calls can run.');
  }
}

export async function assertVaultRuntimeAllowed(agentId: string): Promise<void> {
  const control = await loadRuntimeControl(agentId);
  if (control?.vaultDisabled) {
    throw new PermissionError('Vault runtime grants are disabled by Panic lockdown. Re-authentication is required before secrets can be granted.');
  }
}
