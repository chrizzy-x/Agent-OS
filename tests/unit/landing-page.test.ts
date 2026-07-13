import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

function source(...parts: string[]) {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

describe('AgentOS landing page', () => {
  it('makes root the animated public doorway into AgentOS', () => {
    const page = source('app', 'page.tsx');
    const landing = source('components', 'landing', 'LandingPage.tsx');
    const constants = source('components', 'landing', 'constants.ts');
    const shell = source('components', 'os', 'application-shell.tsx');

    expect(page).toContain("import LandingPage from '@/components/landing/LandingPage'");
    expect(page).toContain('AgentOS — One command. Every task, end to end.');
    expect(landing).toContain('AGENTOS_ENTRY_ROUTE');
    expect(landing).toContain('AGENTOS_HOME_ROUTE');
    expect(constants).toContain("'/studio?mode=nl'");
    expect(constants).toContain("'/dashboard'");
    expect(shell).toContain("const EXCLUDED_PREFIXES = ['/', '/signin', '/signup', '/login', '/forgot-password']");
  });

  it('uses the exact landing copy and command cycle', () => {
    const hero = source('components', 'landing', 'AgentOSHero.tsx');
    const constants = source('components', 'landing', 'constants.ts');
    const stage = source('components', 'landing', 'LiquidGlassExecutionStage.tsx');

    expect(hero).toContain('One command.');
    expect(hero).toContain('Super AgentOS handles the task end to end.');
    expect(hero).toContain('Describe the outcome. Super AgentOS understands the goal, plans the work, uses the right capabilities and delivers the finished result.');
    expect(constants).toContain('Interprets your outcome.');
    expect(constants).toContain('Builds the execution path.');
    expect(constants).toContain('Uses apps, skills and tools.');
    expect(constants).toContain('Returns the finished result.');
    expect(stage).toContain('agentos-glass-lens');
    expect(constants).toContain('Build and launch a complete product campaign.');
    expect(constants).toContain('Research this market and prepare the full report.');
    expect(constants).toContain('Turn my idea into a working product plan.');
  });

  it('uses processed official assets and native motion primitives', () => {
    const constants = source('components', 'landing', 'constants.ts');
    const nav = source('components', 'landing', 'LandingNavigation.tsx');
    const dashboard = source('app', 'dashboard', 'page.tsx');
    const signal = source('components', 'landing', 'AnimatedSignalField.tsx');
    const css = source('app', 'globals.css');

    expect(constants).toContain('/agentos-landing-hero.webp');
    expect(constants).toContain('/agentos-landing-mark.webp');
    expect(nav).toContain('Homepage');
    expect(dashboard).toContain('HomePage');
    expect(signal).toContain('viewBox="0 0 1400 340"');
    expect(signal).toContain('M0 177 C145 52 260 258 410 154');
    expect(css).toContain('#fbfbfd');
    expect(css).toContain('agentosLensFloat');
    expect(css).toContain('agentosCommandRipple');
    expect(css).toContain('agentosSignalDash');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
