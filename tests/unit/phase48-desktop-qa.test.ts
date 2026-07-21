import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('phase 48 desktop browser QA fixes', () => {
  it('records the desktop QA route set and outcome', () => {
    const report = read('docs/desktop-qa-phase48.md');

    expect(report).toContain('/studio?mode=nl');
    expect(report).toContain('/studio?mode=workflow');
    expect(report).toContain('/studio?mode=code');
    expect(report).toContain('/appstore');
    expect(report).toContain('/skillstore');
    expect(report).toContain('/notifications');
    expect(report).toContain('All tested routes returned `200`.');
  });

  it('guards protected desktop page loads before protected API calls', () => {
    expect(read('components/pages/SubagentsPage.tsx')).toContain('const session = await fetchBrowserSession().catch(() => null);');
    expect(read('components/pages/VaultPage.tsx')).toContain('const session = await fetchBrowserSession().catch(() => null);');
    expect(read('components/pages/McpDiagnosticsPage.tsx')).toContain('if (!sessionData)');
  });
});
