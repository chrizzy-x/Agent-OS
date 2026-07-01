import { expect, test } from '@playwright/test';

const widths = [360, 390, 768, 1024, 1440] as const;
const routes = [
  '/studio?mode=nl',
  '/studio?mode=workflow',
  '/studio?mode=code',
  '/tasks',
  '/projects',
  '/library',
  '/appstore',
  '/skillstore',
  '/subagents',
  '/workflows',
  '/mcp',
  '/vault',
  '/settings',
] as const;

test.describe('AgentOS V6.6.7 responsive acceptance', () => {
  test.beforeEach(async ({ page }) => {
    const session = {
      authenticated: true,
      session: {
        agentName: 'QA Operator',
        plan: 'enterprise_max',
        planLabel: 'Enterprise Max',
        accountType: 'enterprise',
        capabilities: ['access_developer_console', 'create_app', 'create_skill'],
        expiresAt: '2030-01-01T00:00:00.000Z',
      },
    };
    await page.route('**/api/session**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) });
    });
    await page.route('**/api/shell/bootstrap', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          workspaces: [{ id: 'workspace-qa', name: 'QA Workspace', slug: 'qa', plan: 'enterprise_max' }],
          sessions: [],
          projects: [{ id: 'project-qa', workspaceId: 'workspace-qa', name: 'Contract QA', status: 'active', pinned: true, updatedAt: new Date().toISOString() }],
          notifications: { unread: 1 },
          agents: { connected: 1 },
        }),
      });
    });
    await page.route('**/api/studio/bootstrap**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: null,
          sessions: [],
          lineage: { parent: null, children: [] },
          messages: [],
          events: [],
          workspaces: [{ id: 'workspace-qa', name: 'QA Workspace' }],
          projects: [{ id: 'project-qa', workspaceId: 'workspace-qa', name: 'Contract QA', description: null, status: 'active' }],
          currentProject: { id: 'project-qa', workspaceId: 'workspace-qa', name: 'Contract QA', description: null, status: 'active' },
          workflows: [],
          vaultSecrets: [],
          installedSkills: [],
          installedApps: [],
          superAgent: { id: 'agent-1', name: 'Super AgentOS', instructions: '', status: 'active' },
          subagents: [],
          memoryEntries: [],
          fileTree: [],
        }),
      });
    });
    await page.route('**/api/notifications**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) });
    });
    await page.route('**/api/tasks**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tasks: [] }) });
    });
  });

  test('has no horizontal overflow at required acceptance widths', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Viewport matrix runs once.');
    test.setTimeout(180_000);

    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      for (const route of routes) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(150);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${route} overflow at ${width}px`).toBeLessThanOrEqual(2);
      }
    }
  });
});
