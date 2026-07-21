import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

function source(...parts: string[]) {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

describe('Phase 43 app and skill monetization', () => {
  it('keeps developer console monetization tied to apps and skills', () => {
    const consolePage = source('components', 'pages', 'DeveloperConsolePage.tsx');

    expect(consolePage).toContain('appPricingLabel');
    expect(consolePage).toContain('skillPricingLabel');
    expect(consolePage).toContain('Developer Earnings');
    expect(consolePage).toContain('70}% developer / ${earnings.platform_share_pct ?? 30}% platform');
    expect(consolePage).toContain('Apps and skills can be free or priced after listing metadata, permissions, verification, and review.');
    expect(consolePage).toContain('Workflows and subagents are reusable execution assets, not monetized marketplace products.');
    expect(consolePage).toContain('Agent Credits remain platform compute accounting and are separate from developer earnings.');
  });

  it('returns explicit developer and platform share fields from earnings API', () => {
    const earningsRoute = source('app', 'api', 'developer', 'earnings', 'route.ts');

    expect(earningsRoute).toContain('gross_all_time');
    expect(earningsRoute).toContain('platform_cut_all_time');
    expect(earningsRoute).toContain('revenue_share_pct: 70');
    expect(earningsRoute).toContain('platform_share_pct: 30');
    expect(earningsRoute).toContain("monetization_source: 'skills'");
  });

  it('documents monetization without overclaiming unavailable records', () => {
    const monetization = source('docs', 'monetization.md');
    const dataDiscipline = source('docs', 'data-discipline.md');

    expect(monetization).toContain('AgentOS monetization belongs to apps and skills.');
    expect(monetization).toContain('Developer earnings are calculated only from real paid app or skill usage records.');
    expect(monetization).toContain('Workflows and subagents are not monetized marketplace products.');
    expect(monetization).toContain('Agent Credits are separate from monetization.');
    expect(dataDiscipline).toContain('No paid app transactions recorded');
    expect(dataDiscipline).toContain('No skill revenue recorded');
  });
});
