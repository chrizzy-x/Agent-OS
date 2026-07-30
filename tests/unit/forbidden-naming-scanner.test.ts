import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanForbiddenNaming } from '../../scripts/check-forbidden-naming.mjs';

describe('forbidden naming scanner', () => {
  it('allows vendor proper nouns and selected model labels', () => {
    const root = mkdtempSync(join(tmpdir(), 'agentos-naming-'));
    mkdirSync(join(root, 'components'));
    writeFileSync(join(root, 'components', 'VendorLabel.tsx'), [
      'export const label = "OpenAI";',
      'export const exactModel = "Claude Sonnet";',
      'export const packageName = "@anthropic-ai/sdk";',
      'export const metadata = "Intelligence: Gemini 2.5";',
    ].join('\n'));

    expect(scanForbiddenNaming({ root, roots: ['components'] })).toEqual([]);
  });

  it('blocks generic product and implementation names', () => {
    const root = mkdtempSync(join(tmpdir(), 'agentos-naming-'));
    mkdirSync(join(root, 'app'));
    writeFileSync(join(root, 'app', 'page.tsx'), [
      'export const badCopy = "Powered by Claude";',
      'export const badLabel = "AI provider";',
      'export const badSlug = "ai-runtime";',
    ].join('\n'));

    expect(scanForbiddenNaming({ root, roots: ['app'] }).map(violation => violation.rule)).toEqual([
      'powered_by',
      'ai_provider',
      'standalone_ai',
      'ai_runtime',
      'ai_implementation_name',
    ]);
  });
});
