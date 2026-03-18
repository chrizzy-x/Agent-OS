import { describe, expect, it } from 'vitest';
import {
  STUDIO_ADVANCED_MODE_TTL_MS,
  clampStudioTranscriptHistory,
  createStudioAdvancedSession,
  isStudioAdvancedSessionActive,
  parseStudioAdvancedSession,
} from '../../src/studio/client-state.js';

describe('studio client state helpers', () => {
  it('creates a 15 minute advanced session window', () => {
    const session = createStudioAdvancedSession(1000);
    expect(session.enabledAt).toBe(1000);
    expect(session.expiresAt).toBe(1000 + STUDIO_ADVANCED_MODE_TTL_MS);
  });

  it('parses valid session JSON and rejects invalid data', () => {
    expect(parseStudioAdvancedSession('{"enabledAt":100,"expiresAt":200}')).toEqual({ enabledAt: 100, expiresAt: 200 });
    expect(parseStudioAdvancedSession('{"enabledAt":"bad"}')).toBeNull();
    expect(parseStudioAdvancedSession('not-json')).toBeNull();
  });

  it('reports whether a stored advanced session is still active', () => {
    const session = { enabledAt: 100, expiresAt: 200 };
    expect(isStudioAdvancedSessionActive(session, 150)).toBe(true);
    expect(isStudioAdvancedSessionActive(session, 250)).toBe(false);
  });

  it('keeps only the most recent transcript entries', () => {
    const entries = Array.from({ length: 40 }, (_, index) => ({
      id: `${index}`,
      createdAt: new Date(index * 1000).toISOString(),
      command: `help ${index}`,
      response: { kind: 'result' as const, mutating: false, summary: `entry ${index}` },
    }));

    const clamped = clampStudioTranscriptHistory(entries);
    expect(clamped).toHaveLength(30);
    expect(clamped[0]?.id).toBe('10');
    expect(clamped.at(-1)?.id).toBe('39');
  });
});
