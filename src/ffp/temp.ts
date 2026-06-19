import { readLocalRuntimeState, updateLocalRuntimeState } from '../storage/local-state.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { resolveDefaultWorkspaceForAgent } from '../workspaces/service.js';

export type FfpTempSettings = {
  workspaceId: string | null;
  enabled: boolean;
  status: 'FFP Disabled' | 'FFP Enabled';
  route: string;
  affectedExecutionTypes: string[];
  bypassedExecutionTypes: string[];
  updatedAt: string | null;
};

const AFFECTED = ['multi-agent workflows', 'subagent collaboration', 'multi-agent delegation'];
const BYPASSED = ['single-agent chat', 'single workflow run', 'single app execution', 'single skill execution', 'single MCP call'];

function mapRow(row: Record<string, unknown> | null, workspaceId: string | null): FfpTempSettings {
  const enabled = false;
  return {
    workspaceId,
    enabled,
    status: enabled ? 'FFP Enabled' : 'FFP Disabled',
    route: enabled
      ? 'Multi-agent activities -> FFP temporary abstraction layer -> Unified Execution Engine'
      : 'Multi-agent activities -> Unified Execution Engine',
    affectedExecutionTypes: AFFECTED,
    bypassedExecutionTypes: BYPASSED,
    updatedAt: typeof row?.updated_at === 'string' ? row.updated_at : typeof row?.updatedAt === 'string' ? row.updatedAt : null,
  };
}

async function resolveWorkspace(ownerAgentId: string, workspaceId?: string | null): Promise<string | null> {
  if (workspaceId) return workspaceId;
  return (await resolveDefaultWorkspaceForAgent(ownerAgentId))?.id ?? null;
}

function dbWorkspaceId(workspaceId: string | null): string {
  return workspaceId ?? '';
}

export async function getFfpTempSettings(params: {
  ownerAgentId: string;
  workspaceId?: string | null;
}): Promise<FfpTempSettings> {
  const workspaceId = await resolveWorkspace(params.ownerAgentId, params.workspaceId);
  try {
    let query = getSupabaseAdmin()
      .from('ffp_temp_settings')
      .select('*')
      .eq('owner_agent_id', params.ownerAgentId);
    query = query.eq('workspace_id', dbWorkspaceId(workspaceId));
    const { data, error } = await query.maybeSingle();
    if (!error) return mapRow((data as Record<string, unknown> | null) ?? null, workspaceId);
  } catch {
    // Fall through to local dev/test state.
  }

  const state = await readLocalRuntimeState();
  const local = state.ffpTempSettings.find(item =>
    item.ownerAgentId === params.ownerAgentId
    && item.workspaceId === dbWorkspaceId(workspaceId)
  );
  return mapRow(local ? { enabled: local.enabled, updatedAt: local.updatedAt } : null, workspaceId);
}

export async function updateFfpTempSettings(params: {
  ownerAgentId: string;
  workspaceId?: string | null;
  enabled: boolean;
}): Promise<FfpTempSettings> {
  const workspaceId = await resolveWorkspace(params.ownerAgentId, params.workspaceId);
  const now = new Date().toISOString();
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('ffp_temp_settings')
      .upsert({
        owner_agent_id: params.ownerAgentId,
        workspace_id: dbWorkspaceId(workspaceId),
        enabled: false,
        updated_at: now,
      }, { onConflict: 'owner_agent_id,workspace_id' })
      .select('*')
      .single();
    if (!error && data) return mapRow(data as Record<string, unknown>, workspaceId);
  } catch {
    // Fall through to local dev/test state.
  }

  await updateLocalRuntimeState(state => {
    const key = dbWorkspaceId(workspaceId);
    const existing = state.ffpTempSettings.find(item => item.ownerAgentId === params.ownerAgentId && item.workspaceId === key);
    if (existing) {
      existing.enabled = false;
      existing.updatedAt = now;
      return;
    }
    state.ffpTempSettings.unshift({
      ownerAgentId: params.ownerAgentId,
      workspaceId: key,
      enabled: false,
      updatedAt: now,
    });
  });
  return mapRow({ enabled: false, updatedAt: now }, workspaceId);
}

export function shouldUseFfpTemp(settings: FfpTempSettings, executionKind: string): boolean {
  void settings;
  void executionKind;
  return false;
}
