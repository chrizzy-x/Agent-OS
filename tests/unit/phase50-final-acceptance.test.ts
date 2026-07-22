import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function readDoc() {
  return readFileSync(join(root, 'docs', 'final-production-acceptance-phase50.md'), 'utf8');
}

describe('phase 50 final acceptance gate', () => {
  it('keeps final release recommendation honest', () => {
    const doc = readDoc();
    expect(doc).toContain('Recommendation: beta release candidate, not final production-grade certification.');
    expect(doc).toContain('live credentials and backend data');
    expect(doc).toContain('AgentOS should remain described as a beta release candidate');
  });

  it('records desktop and mobile production route QA coverage', () => {
    const doc = readDoc();
    for (const route of [
      '/',
      '/dashboard',
      '/studio?mode=nl',
      '/studio?mode=workflow',
      '/studio?mode=code',
      '/appstore',
      '/skillstore',
      '/library',
      '/projects',
      '/subagents',
      '/vault',
      '/mcp',
      '/ffp',
      '/settings',
      '/docs/ffp',
      '/notifications',
    ]) {
      expect(doc).toContain(route);
    }
    expect(doc).toContain('No tested production route had horizontal overflow on desktop or mobile.');
  });

  it('does not certify fake FFP production behavior', () => {
    const doc = readDoc();
    expect(doc).toContain('FFP remains visible and disabled/coming-soon');
    expect(doc).toContain('no fake validator, proof, transaction, or consensus UI');
  });
});
