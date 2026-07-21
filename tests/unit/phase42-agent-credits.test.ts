import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('Phase 42 Agent Credits visibility', () => {
  it('keeps dashboard credits honest until telemetry exists', () => {
    const route = readFileSync('app/api/dashboard/route.ts', 'utf8');
    expect(route).toContain("label: 'Agent Credits'");
    expect(route).toContain('usageHistory: []');
    expect(route).toContain('consumedBy: []');
    expect(route).toContain('computeSeparatedFromMonetization: true');
    expect(route).toContain('will not show fake balances');
  });

  it('shows compute details without mixing developer earnings into credits', () => {
    const home = readFileSync('components/pages/HomePage.tsx', 'utf8');
    const settings = readFileSync('components/pages/SettingsPage.tsx', 'utf8');
    expect(home).toContain('Developer monetization: separate from compute credits');
    expect(home).toContain('Usage history:');
    expect(settings).toContain('Developer earnings stay separate from Agent Credits compute accounting.');
  });

  it('documents Agent Credits as platform compute accounting', () => {
    const doc = readFileSync('docs/agent-credits.md', 'utf8');
    expect(doc).toContain('Agent Credits are AgentOS compute accounting');
    expect(doc).toContain('must not invent');
    expect(doc).toContain('Developer earnings from apps and skills remain a separate monetization surface.');
  });
});
