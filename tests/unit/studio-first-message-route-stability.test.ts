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

  it('does not let background session refresh replace active streaming messages', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'studio', 'StudioProvider.tsx'), 'utf8');

    expect(source).toContain('const streamingSessionIdRef = useRef<string | null>(null);');
    expect(source).toContain('if (!activeStreamingSessionId || nextSession?.id !== activeStreamingSessionId) {');
    expect(source).toContain('if (payload.messages && streamingSessionIdRef.current !== sessionId) {');
    expect(source).toContain('streamingSessionIdRef.current = activeSession.id;');
    expect(source).toContain('streamingSessionIdRef.current = null;');
  });

  it('preserves completed streamed turns when the immediate bundle reload is stale', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'studio', 'StudioProvider.tsx'), 'utf8');

    expect(source).toContain('function preserveCompletedStreamedTurn');
    expect(source).toContain('let streamedAssistantContent = \'\';');
    expect(source).toContain('streamedAssistantContent += event.data.text;');
    expect(source).toContain('!hasPersistedAssistantForTurn(bundle?.messages ?? [], createdAt)');
  });

  it('backfills connected intelligence when bootstrap returns an empty connection list', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'studio', 'StudioProvider.tsx'), 'utf8');

    expect(source).toContain('const bootstrapIntelligenceConnections = (payload.intelligenceConnections ?? []) as IntelligenceConnectionRecord[];');
    expect(source).toContain('bootstrapIntelligenceConnections.length === 0 && nextWorkspaceId');
    expect(source).toContain('/api/intelligence/connections?workspaceId=');
    expect(source).toContain('setIntelligenceConnections(connections)');
  });

  it('keeps approvals tied to the originating Studio session', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'studio', 'StudioProvider.tsx'), 'utf8');

    expect(source).toContain('sessionId: string | null;');
    expect(source).toContain('sessionId: typeof event.data.sessionId === \'string\'');
    expect(source).toContain('pendingApproval.sessionId ?? session?.id ?? requestedSessionId ?? null');
  });
});
