import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Application shell context sync', () => {
  it('can accept live session refs and keeps Studio branded as Native Super AgentOS', () => {
    const source = readFileSync(join(process.cwd(), 'components', 'os', 'application-shell.tsx'), 'utf8');

    expect(source).toContain('type ShellSyncContext');
    expect(source).toContain('context.session');
    expect(source).toContain('...current.sessions.filter(item => item.id !== context.session?.id)');
    expect(source).toContain("process.env.NEXT_PUBLIC_AGENTOS_MODEL ?? 'Native Super AgentOS'");
    expect(source).not.toContain("process.env.NEXT_PUBLIC_AGENTOS_MODEL ?? 'Default model'");
  });
});
