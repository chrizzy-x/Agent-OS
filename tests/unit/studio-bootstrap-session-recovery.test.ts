import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Studio bootstrap session recovery', () => {
  it('loads requested sessions directly instead of replacing them with new sessions', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'studio', 'bootstrap.ts'), 'utf8');

    expect(source).toContain("listStudioSessions(params.ownerAgentId, { status: 'active', limit: 60 })");
    expect(source).toContain('const requestedSessionBundle = params.sessionId && !session');
    expect(source).toContain('getStudioSessionBundle(params.ownerAgentId, params.sessionId).catch(() => null)');
    expect(source).toContain('if (!session && defaultWorkspace && !params.sessionId)');
    expect(source).toContain('requestedSessionBundle?.session.id === session?.id');
    expect(source).toContain('const fallbackSessionSelection = migrateLegacyExecutionTargetToIntelligenceSelection');
    expect(source).toContain('withBootstrapTimeout<{ selection: IntelligenceSelection }>');
    expect(source).toContain('.then(record => ({ selection: record.selection }))');
  });

  it('keeps bounded session lists available to bootstrap callers', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'studio', 'persistence.ts'), 'utf8');

    expect(source).toContain('limit?: number');
    expect(source).toContain('query = query.limit(Math.floor(options.limit));');
    expect(source).toContain('sorted.slice(0, Math.floor(options.limit))');
  });
});
