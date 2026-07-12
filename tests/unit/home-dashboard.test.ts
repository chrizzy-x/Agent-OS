import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

function source(...parts: string[]) {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

describe('Home dashboard baseline', () => {
  it('uses the dashboard backend contract instead of browser-side product synthesis', () => {
    const page = source('components', 'pages', 'HomePage.tsx');
    expect(source('app', 'page.tsx')).toContain("import HomePage from '@/components/pages/HomePage'");
    expect(page).toContain('fetchDashboardResponse(dashboardUrl(shell.activeWorkspaceId))');
    expect(page).toContain("type DashboardPayload =");
    expect(page).not.toContain("fetchWithBrowserSession('/api/studio/sessions");
    expect(page).not.toContain("fetchWithBrowserSession('/api/super-agent");
  });

  it('renders required command overview surfaces and honest unavailable credit state', () => {
    const page = source('components', 'pages', 'HomePage.tsx');
    expect(page).toContain('Recent Studio Sessions');
    expect(page).toContain('Active Projects');
    expect(page).toContain('Installed Apps');
    expect(page).toContain('Installed Skills');
    expect(page).toContain('Active Workflows');
    expect(page).toContain('Incognito Subagents');
    expect(page).toContain('Vault Health');
    expect(page).toContain('MCP Status');
    expect(page).toContain('Recommended Next Actions');
    expect(page).toContain('payload.credits.message');
  });

  it('does not drift back to a public marketing landing page', () => {
    const page = source('components', 'pages', 'HomePage.tsx');
    expect(page).not.toContain('Your AI operating system.');
    expect(page).not.toContain('Talk to it. Build with it. Install what it needs.');
    expect(page).toContain('Open Super AgentOS');
    expect(page).toContain('Home is public. Everyone can see the AgentOS command map here; personal workspace data appears only after sign-in.');
    expect(page).toContain('Personal data hidden until sign-in.');
    expect(page).toContain('Public Home shows the product map only. It does not invent sessions, installs, ratings, logs, secrets, credits, validators, or usage.');
    expect(page).toContain('const [loading, setLoading] = useState(false);');
  });

  it('documents Home data discipline', () => {
    const doc = source('docs', 'home-dashboard.md');
    expect(doc).toContain('backed by `/api/dashboard`');
    expect(doc).toContain('must not invent credit balances');
    expect(doc).toContain('Secret names and secret values must not appear');
  });
});
