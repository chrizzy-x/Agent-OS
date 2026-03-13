import { getSupabaseAdmin } from '../storage/supabase.js';

interface AuditEntry {
  agentId: string;
  primitive: 'fs' | 'net' | 'proc' | 'mem' | 'db' | 'events';
  operation: string;
  success: boolean;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

// Write a single audit log entry to Supabase.
// This is fire-and-forget — audit failures should never block the main operation.
export async function logOperation(entry: AuditEntry): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('audit_logs').insert({
      agent_id: entry.agentId,
      primitive: entry.primitive,
      operation: entry.operation,
      success: entry.success,
      duration_ms: entry.durationMs,
      metadata: entry.metadata ?? {},
      error: entry.error,
    });
  } catch (err) {
    // Log to stderr but don't propagate — audit failure must not break agent operations
    console.error('[audit] failed to write log entry:', err instanceof Error ? err.message : err);
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
