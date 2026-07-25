import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

function source(...parts: string[]) {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

describe('AgentOS public whitepaper', () => {
  it('publishes the complete whitepaper as a public page', () => {
    const page = source('app', 'whitepaper', 'page.tsx');
    const content = source('app', 'whitepaper', 'content.ts');
    const finalPart = source('app', 'whitepaper', 'content', 'part-10.ts');

    expect(page).toContain('AGENTOS_WHITEPAPER_MARKDOWN');
    expect(page).toContain('Download PDF on GitHub');
    expect(page).toContain('The operating ecosystem for autonomous intelligence.');
    expect(page).toContain('agentos-whitepaper-root');
    expect(content).toContain('part10');
    expect(finalPart).toContain('Appendix C — Whitepaper Audit Record');
  });

  it('keeps the PDF on the official GitHub repository', () => {
    const constants = source('components', 'landing', 'constants.ts');
    const nav = source('components', 'landing', 'LandingNavigation.tsx');

    expect(constants).toContain("export const AGENTOS_WHITEPAPER_ROUTE = '/whitepaper'");
    expect(constants).toContain('github.com/chrizzy-x/Agent-OS/raw/main/docs/AgentOS_Whitepaper_v1.0_July_2026.pdf');
    expect(nav).toContain('Whitepaper');
    expect(nav).toContain('activeItem');
  });
});
