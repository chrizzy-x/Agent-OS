type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatKey(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}

function parseJsonLike(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

export function truncateText(value: string, max = 160): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 3))}...`;
}

export function summarizeValue(value: unknown, max = 160): string {
  const parsed = parseJsonLike(value);
  if (parsed === null || parsed === undefined) return 'No details';
  if (typeof parsed === 'string') return truncateText(parsed, max);
  if (typeof parsed === 'number' || typeof parsed === 'boolean') return String(parsed);
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return 'No items';
    const preview = parsed.slice(0, 3).map(item => summarizeValue(item, 40)).join(', ');
    return truncateText(`${parsed.length} item${parsed.length === 1 ? '' : 's'}: ${preview}`, max);
  }
  if (isRecord(parsed)) {
    const preferred = ['summary', 'message', 'status', 'result', 'error', 'tool', 'action', 'name', 'title'];
    for (const key of preferred) {
      if (key in parsed) {
        return truncateText(`${formatKey(key)}: ${summarizeValue(parsed[key], Math.max(48, max - key.length - 2))}`, max);
      }
    }

    const entries = Object.entries(parsed).slice(0, 3).map(([key, item]) => `${formatKey(key)}: ${summarizeValue(item, 48)}`);
    return truncateText(entries.join(' | '), max);
  }

  return truncateText(String(parsed), max);
}

export function summarizeStudioEvent(type: string, payload: JsonRecord): string {
  const normalized = type.toLowerCase();
  if (normalized === 'thinking_started') return 'Analyzing request';
  if (normalized === 'plan_created') return summarizeValue(payload.summary ?? payload, 120);
  if (normalized === 'task_started') return summarizeValue(payload.summary ?? payload, 120);
  if (normalized === 'task_progress') return summarizeValue(payload.tool ?? payload.step ?? payload, 120);
  if (normalized === 'task_completed') return summarizeValue(payload.workflowId ? `Workflow ${payload.workflowId} updated` : 'Execution completed', 120);
  if (normalized === 'workflow_created' || normalized === 'workflow_updated' || normalized === 'workflow_code_updated') {
    return summarizeValue(payload.name ?? payload.workflowId ?? payload, 120);
  }
  if (normalized === 'secret_required' || normalized === 'secret_added') return summarizeValue(payload.secretName ?? payload.name ?? payload, 120);
  if (normalized === 'app_installed' || normalized === 'skill_installed') return summarizeValue(payload.appName ?? payload.skillId ?? payload.name ?? payload, 120);
  if (normalized.endsWith('_blocked')) return summarizeValue(payload.capability ?? payload.reason ?? payload, 120);
  return summarizeValue(payload, 120);
}

export function summarizeWorkflowRun(value: unknown): string {
  const parsed = parseJsonLike(value);
  if (isRecord(parsed)) {
    if (typeof parsed.answer === 'string') return truncateText(parsed.answer, 180);
    if (typeof parsed.message === 'string') return truncateText(parsed.message, 180);
    if (typeof parsed.error === 'string') return `Error: ${truncateText(parsed.error, 160)}`;
    if (parsed.results !== undefined) return summarizeValue(parsed.results, 180);
  }
  return summarizeValue(parsed, 180);
}

export function summarizeSkillCapability(params?: Record<string, string> | null, returns?: string | null): string {
  const entries = Object.entries(params ?? {});
  const parts: string[] = [];
  if (entries.length > 0) {
    parts.push(`${entries.length} input${entries.length === 1 ? '' : 's'}`);
  } else {
    parts.push('No explicit inputs');
  }
  if (returns) {
    parts.push(`Returns ${returns}`);
  }
  return parts.join(' | ');
}

export function summarizeAgentResult(value: unknown): string {
  const parsed = parseJsonLike(value);
  if (isRecord(parsed)) {
    if (typeof parsed.answer === 'string') return truncateText(parsed.answer, 200);
    if (typeof parsed.body === 'string') return summarizeValue(parsed.body, 200);
    if (parsed.result !== undefined) return summarizeValue(parsed.result, 200);
  }
  return summarizeValue(parsed, 200);
}
