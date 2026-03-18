export const STUDIO_ADVANCED_MODE_TTL_MS = 15 * 60 * 1000;

export type StudioAdvancedSession = {
  enabledAt: number;
  expiresAt: number;
};

export type StudioTranscriptEntry = {
  id: string;
  createdAt: string;
  command: string;
  response: {
    kind: 'help' | 'preview' | 'result' | 'error';
    mutating: boolean;
    summary: string;
    confirmToken?: string;
    result?: unknown;
    snippet?: string;
    warnings?: string[];
    preview?: {
      action: string;
      target?: string;
      payloadSummary?: string;
      risks?: string[];
    };
  };
};

export function getStudioHistoryStorageKey(agentId: string): string {
  return `studio:history:${agentId}`;
}

export function getStudioDraftStorageKey(agentId: string): string {
  return `studio:draft:${agentId}`;
}

export function getStudioAdvancedSessionKey(agentId: string): string {
  return `studio:advanced:${agentId}`;
}

export function createStudioAdvancedSession(now = Date.now()): StudioAdvancedSession {
  return {
    enabledAt: now,
    expiresAt: now + STUDIO_ADVANCED_MODE_TTL_MS,
  };
}

export function parseStudioAdvancedSession(raw: string | null): StudioAdvancedSession | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StudioAdvancedSession>;
    if (
      typeof parsed.enabledAt === 'number' &&
      Number.isFinite(parsed.enabledAt) &&
      typeof parsed.expiresAt === 'number' &&
      Number.isFinite(parsed.expiresAt)
    ) {
      return {
        enabledAt: parsed.enabledAt,
        expiresAt: parsed.expiresAt,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function isStudioAdvancedSessionActive(
  session: StudioAdvancedSession | null | undefined,
  now = Date.now(),
): boolean {
  return Boolean(session && session.expiresAt > now);
}

export function clampStudioTranscriptHistory(entries: StudioTranscriptEntry[]): StudioTranscriptEntry[] {
  return entries.slice(-30);
}
