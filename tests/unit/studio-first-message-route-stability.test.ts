import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Studio first message route stability', () => {
  it('keeps the streamed first response mounted when the session URL is persisted', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'studio', 'StudioProvider.tsx'), 'utf8');

    expect(source).toContain('replaceCurrentHistoryRoute');
    expect(source).toContain('window.history.replaceState');
    expect(source).toContain('const activeProjectId = activeSession.projectId ?? currentProject?.id ?? requestedProjectId ?? null;');
    expect(source).toContain('session: {');
    expect(source).not.toContain('if (createdSession) {');
  });
});
