import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  allowLocalDataFallback,
  formatCountLabel,
  formatMetricCount,
  formatMoneyMetric,
  formatRatingLabel,
} from '../../src/data/discipline.js';
import { hasSecretLikeValue, redactSecretsInString } from '../../src/security/secret-redaction.js';

function source(...parts: string[]) {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

describe('real data and empty-state discipline', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSkillFallback = process.env.AGENTOS_ALLOW_LOCAL_SKILL_FALLBACK;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalSkillFallback === undefined) delete process.env.AGENTOS_ALLOW_LOCAL_SKILL_FALLBACK;
    else process.env.AGENTOS_ALLOW_LOCAL_SKILL_FALLBACK = originalSkillFallback;
  });

  it('blocks local fallback flags in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.AGENTOS_ALLOW_LOCAL_SKILL_FALLBACK = '1';
    expect(allowLocalDataFallback('AGENTOS_ALLOW_LOCAL_SKILL_FALLBACK')).toBe(false);

    process.env.NODE_ENV = 'development';
    expect(allowLocalDataFallback('AGENTOS_ALLOW_LOCAL_SKILL_FALLBACK')).toBe(true);
  });

  it('formats missing marketplace metrics as honest empty states', () => {
    expect(formatCountLabel(0, 'install', 'installs')).toBe('No installs yet');
    expect(formatCountLabel(12, 'install', 'installs')).toBe('12 installs');
    expect(formatMetricCount(0, 'No downloads recorded')).toBe('No downloads recorded');
    expect(formatRatingLabel(4.8, 0)).toBe('New');
    expect(formatRatingLabel(4.8, 3)).toBe('4.8 rating');
    expect(formatMoneyMetric('0.00')).toBe('No revenue recorded');
  });

  it('keeps skill store local fallback development-only', () => {
    expect(source('src', 'skills', 'marketplace.ts')).toContain("allowLocalDataFallback('AGENTOS_ALLOW_LOCAL_SKILL_FALLBACK')");
    expect(source('app', 'api', 'skills', 'route.ts')).toContain('local sample data was not returned');
    expect(source('app', 'api', 'skills', 'installed', 'route.ts')).toContain('local sample data was not returned');
    expect(source('app', 'api', 'skills', 'discovery', 'route.ts')).toContain("allowLocalDataFallback('AGENTOS_ALLOW_LOCAL_SKILL_FALLBACK')");
    expect(source('app', 'api', 'skills', '[id]', 'route.ts')).toContain("allowLocalDataFallback('AGENTOS_ALLOW_LOCAL_SKILL_FALLBACK')");
    expect(source('app', 'skills', '[slug]', 'page.tsx')).toContain("allowLocalDataFallback('AGENTOS_ALLOW_LOCAL_SKILL_FALLBACK')");
  });

  it('keeps marketplace listing pages aligned with live backend state', () => {
    expect(source('app', 'appstore', '[slug]', 'page.tsx')).toContain("dynamic = 'force-dynamic'");
    expect(source('app', 'skills', '[slug]', 'page.tsx')).toContain("dynamic = 'force-dynamic'");
  });

  it('keeps dark marketplace empty metrics readable', () => {
    const css = source('app', 'globals.css');
    expect(css).toContain('--market-card: rgba(18, 27, 45, 0.92)');
    expect(css).not.toContain('--market-card: #FFFFFF;');
  });

  it('keeps marketplace install labels honest across shared cards', () => {
    expect(source('components', 'marketplace', 'MarketplacePrimitives.tsx')).toContain("formatCountLabel(developer.totalInstalls, 'install', 'installs')");
    expect(source('components', 'pages', 'DeveloperProfilePage.tsx')).toContain("formatCountLabel(app.installCount, 'install', 'installs')");
    expect(source('components', 'pages', 'DeveloperProfilePage.tsx')).toContain("formatCountLabel(skill.total_installs, 'install', 'installs')");
    expect(source('components', 'os', 'ui.tsx')).toContain("formatCountLabel(props.installs, 'install', 'installs')");
  });

  it('does not synthesize listing history or execution output', () => {
    expect(source('components', 'pages', 'AppDetailPage.tsx')).not.toContain('Current production release.');
    expect(source('components', 'pages', 'SkillDetailPage.tsx')).not.toContain('Current production release.');
    expect(source('components', 'pages', 'SkillDetailPage.tsx')).not.toContain('Expected output from');
    expect(source('src', 'skills', 'marketplace.ts')).not.toContain('Result from ${skill.name}');
  });

  it('keeps developer analytics and revenue honest', () => {
    const developerConsole = source('components', 'pages', 'DeveloperConsolePage.tsx');
    expect(developerConsole).toContain('No revenue data');
    expect(developerConsole).toContain('No monetization records are available from the backend yet.');
    expect(developerConsole).not.toContain("analytics?.app_totals?.installs ?? apps.reduce");
    expect(developerConsole).not.toContain("`$${earnings?.all_time ?? '0.00'}`");
    expect(developerConsole).not.toContain("detail.manifest?.version ?? '1.0.0'");
  });

  it('keeps secrets out of durable memory controls', () => {
    expect(hasSecretLikeValue('api_key=sk-test1234567890abcdef')).toBe(true);
    expect(hasSecretLikeValue('Authorization: Bearer secret-token-value')).toBe(true);
    expect(redactSecretsInString('Authorization: Bearer secret-token-value')).not.toContain('secret-token-value');
    expect(hasSecretLikeValue('Remember that the user prefers concise reports.')).toBe(false);

    const memoryService = source('src', 'memory', 'service.ts');
    const memoryRoute = source('app', 'api', 'memory', 'route.ts');
    const memoryItemRoute = source('app', 'api', 'memory', '[id]', 'route.ts');
    const memoryPage = source('components', 'pages', 'MemoryPage.tsx');

    expect(memoryService).toContain('Secrets must be stored in Vault, not memory');
    expect(memoryService).toContain('includeDisabled');
    expect(memoryRoute).toContain('includeDisabled');
    expect(memoryItemRoute).toContain('disabledReason');
    expect(memoryPage).toContain('Disabled memory stays visible here');
    expect(memoryPage).toContain('Use active project scope');
    expect(memoryPage).toContain('Credential-shaped text detected');
    expect(source('docs', 'memory-controls.md')).toContain('Secrets must be stored in Vault, not memory');
  });

  it('documents the production data law', () => {
    const doc = source('docs', 'data-discipline.md');
    expect(doc).toContain('real backend data');
    expect(doc).toContain('must not show local runtime fallback data');
    expect(doc).toContain('fake validators');
  });
});
