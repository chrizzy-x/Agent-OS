import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('ops provider-neutral routing', () => {
  it('does not couple operations triage to a provider-specific SDK or key', () => {
    const source = readFileSync('src/ops/service.ts', 'utf8');

    expect(source).not.toContain("@anthropic-ai/sdk");
    expect(source).not.toContain('ANTHROPIC_API_KEY');
    expect(source).not.toContain('hasAnthropic');
    expect(source).toContain('generateWithStudioProvider');
    expect(source).toContain('getStudioProviderStatus');
    expect(source).toContain('hasStudioProvider');
  });
});
