import { getSupabaseAdmin } from '../storage/supabase.js';
import { sanitizeErrorMessage, sanitizeOutput } from '../utils/output-sanitizer.js';

interface AuditEntry {
  agentId: string;
  primitive: 'fs' | 'net' | 'proc' | 'mem' | 'db' | 'events' | 'x' | 'notify' | 'workflow' | 'action' | 'system';
  operation: string;
  success: boolean;
  durationMs?: number;
  workspaceId?: string | null;
  sessionId?: string | null;
  executionId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
  error?: string;
}

// Write a single audit log entry to Supabase.
// This is fire-and-forget - audit failures should never block the main operation.
export async function logOperation(entry: AuditEntry): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('audit_logs').insert({
      agent_id: entry.agentId,
      primitive: entry.primitive,
      operation: entry.operation,
      success: entry.success,
      duration_ms: entry.durationMs,
      workspace_id: entry.workspaceId ?? null,
      session_id: entry.sessionId ?? null,
      execution_id: entry.executionId ?? null,
      source_type: entry.sourceType ?? null,
      source_id: entry.sourceId ?? null,
      metadata: sanitizeOutput(entry.metadata ?? {}),
      error: entry.error ? sanitizeErrorMessage(entry.error) : null,
    }).select('id').single();
    return data?.id ? String(data.id) : null;
  } catch (err) {
    // Log to stderr but don't propagate - audit failure must not break agent operations
    if (process.env.NODE_ENV !== 'test') {
      console.error('[audit] failed to write log entry:', err instanceof Error ? err.message : err);
    }
    return null;
  }
}

// Wrap an async operation with automatic audit logging.
// Records duration, success/failure, and any error message.
export async function withAudit<T>(
  entry: Omit<AuditEntry, 'success' | 'durationMs' | 'error'>,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    await logOperation({
      ...entry,
      success: true,
      durationMs: Date.now() - start,
    });
    return result;
  } catch (err) {
    await logOperation({
      ...entry,
      success: false,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
