import { getSupabaseAdmin } from '../storage/supabase.js';

export interface AgentActivityEntry {
  primitive: string;
  operation: string;
  success: boolean;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function dateValue(value: string | null | undefined): number {
  return value ? new Date(value).getTime() : 0;
}

export async function getAgentActivity(agentId: string, limit = 50): Promise<AgentActivityEntry[]> {
  const supabase = getSupabaseAdmin();
  const safeLimit = Math.min(100, Math.max(1, limit));

  const [auditRes, workflowRes] = await Promise.all([
    supabase
      .from('audit_logs')
      .select('primitive, operation, success, duration_ms, error, created_at, metadata')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(safeLimit),
    supabase
      .from('agent_workflows')
      .select('id, name, summary, schedule, status, last_result, last_error, last_run_at, created_at')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(safeLimit),
  ]);

  if (auditRes.error) throw auditRes.error;
  if (workflowRes.error) throw workflowRes.error;

  const auditRows = (auditRes.data ?? []).map(row => ({
    primitive: String(row.primitive),
    operation: String(row.operation),
    success: Boolean(row.success),
    duration_ms: typeof row.duration_ms === 'number' ? row.duration_ms : null,
    error: typeof row.error === 'string' ? row.error : null,
    created_at: String(row.created_at),
    metadata: asRecord(row.metadata),
  }));

  const loggedWorkflowIds = new Set(
    auditRows
      .map(row => row.metadata.workflowId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );

  const workflowRows = (workflowRes.data ?? [])
    .filter(row => !loggedWorkflowIds.has(String(row.id)))
    .map(row => ({
      primitive: 'workflow',
      operation: String(row.name ?? 'Workflow run'),
      success: !row.last_error,
      duration_ms: null,
      error: typeof row.last_error === 'string' ? row.last_error : null,
      created_at: String(row.last_run_at ?? row.created_at),
      metadata: {
        workflowId: row.id,
        name: row.name,
        summary: row.summary,
        schedule: row.schedule,
        status: row.status,
        result: row.last_result,
      },
    }));

  return [...auditRows, ...workflowRows]
    .sort((a, b) => dateValue(b.created_at) - dateValue(a.created_at))
    .slice(0, safeLimit);
}
