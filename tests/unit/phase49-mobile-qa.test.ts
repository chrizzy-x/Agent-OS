import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STUDIO_MODES } from '../../src/studio/modes.js';

const root = process.cwd();

function readSource(...parts: string[]) {
  return readFileSync(join(root, ...parts), 'utf8');
}

describe('phase 49 mobile QA hardening', () => {
  it('keeps Studio mobile mode labels compact and readable', () => {
    expect(STUDIO_MODES.map(mode => mode.shortLabel)).toEqual(['Chat', 'Flow', 'Code']);

    const source = readSource('components', 'studio', 'ModeSwitch.tsx');
    expect(source).toContain('@media (max-width: 520px)');
    expect(source).toContain('.studio-mode-icon');
    expect(source).toContain('display: none;');
  });

  it('records mobile route QA evidence', () => {
    const source = readSource('docs', 'mobile-qa-phase49.md');
    expect(source).toContain('/studio?mode=nl');
    expect(source).toContain('/appstore');
    expect(source).toContain('/vault');
    expect(source).toContain('No tested route had horizontal mobile overflow');
  });
});
