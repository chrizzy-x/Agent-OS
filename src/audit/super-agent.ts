import crypto from 'crypto';
import { redactSecretsDeep } from '../security/secret-redaction.js';
import { getSupabaseAdmin } from '../storage/supabase.js';
import { sanitizeErrorMessage } from '../utils/output-sanitizer.js';

export type SuperAgentAuditEntry = {
  userId: string;
  workspaceId?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
  action: string;
  capabilityId?: string | null;
  riskLevel?: string | null;
  permissionUsed?: string | null;
  success: boolean;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logSuperAgentAudit(entry: SuperAgentAuditEntry): Promise<string | null> {
  try {
    const id = crypto.randomUUID();
    const { data, error } = await getSupabaseAdmin()
      .from('super_agent_audit_logs')
      .insert({
        id,
        user_id: entry.userId,
        workspace_id: entry.workspaceId ?? null,
        session_id: entry.sessionId ?? null,
        task_id: entry.taskId ?? null,
        action: entry.action,
        capability_id: entry.capabilityId ?? null,
        risk_level: entry.riskLevel ?? null,
        permission_used: entry.permissionUsed ?? null,
        success: entry.success,
        error_message: entry.errorMessage ? sanitizeErrorMessage(entry.errorMessage) : null,
        metadata: redactSecretsDeep(entry.metadata ?? {}),
      })
      .select('id')
      .single();
    return data?.id ? String(data.id) : id;
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[super-agent-audit] failed to write log entry:', error instanceof Error ? error.message : error);
    }
    return null;
  }
}
