export function cleanAgentDisplayName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeAgentDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = cleanAgentDisplayName(value);
  return clean ? clean.toLowerCase() : null;
}

