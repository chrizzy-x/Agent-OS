const SECRET_VALUE_KEYS = new Set([
  'secret',
  'token',
  'api_key',
  'apikey',
  'password',
  'authorization',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'private_key',
]);

export function hasSecretLikeValue(value: string): boolean {
  return /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|secret|token|password|authorization)\s*[:=]\s*["']?)([^"'\s,}]{6,})/i.test(value)
    || /([A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|PASSWORD)[A-Z0-9_]*=)([^\s]{6,})/.test(value)
    || /\b(sk-[a-zA-Z0-9_-]{16,}|Bearer\s+[a-zA-Z0-9._-]{16,}|gh[pousr]_[a-zA-Z0-9_]{20,})\b/.test(value);
}

export function redactSecretsInString(value: string): string {
  return value
    .replace(
      /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|secret|token|password|authorization)\s*[:=]\s*["']?)([^"'\s,}]+)/gi,
      '$1[redacted]',
    )
    .replace(
      /(([A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|PASSWORD)[A-Z0-9_]*)=)([^\s]+)/g,
      '$1[redacted]',
    )
    .replace(
      /\b(Bearer\s+)[a-zA-Z0-9._-]{16,}\b/g,
      '$1[redacted]',
    )
    .replace(
      /\b(sk-[a-zA-Z0-9_-]{16,}|gh[pousr]_[a-zA-Z0-9_]{20,})\b/g,
      '[redacted]',
    );
}

export function maskSecretValue(value?: string | null): string {
  if (!value) return '****************';
  return `${'*'.repeat(Math.max(12, Math.min(20, value.length)))}${value.length > 4 ? value.slice(-4) : ''}`;
}

export function redactSecretsDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecretsDeep);
  if (typeof value === 'string') return redactSecretsInString(value);
  if (!value || typeof value !== 'object') return value;

  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    next[key] = SECRET_VALUE_KEYS.has(normalized) || normalized.endsWith('_secret') || normalized.endsWith('_token')
      ? '[redacted]'
      : redactSecretsDeep(item);
  }
  return next;
}
