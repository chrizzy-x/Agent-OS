import { expect, test, type Page } from '@playwright/test';

const now = '2026-07-09T00:00:00.000Z';

function studioPayload(messages: Array<Record<string, unknown>>) {
  return {
    session: {
      id: 'session-layout',
      workspaceId: 'workspace-layout',
      projectId: 'project-layout',
      title: 'Layout QA',
      visibility: 'private',
      updatedAt: now,
    },
    sessions: [],
    lineage: { parent: null, children: [] },
    messages,
    events: [],
    workspaces: [{ id: 'workspace-layout', name: 'Layout Workspace' }],
    projects: [{ id: 'project-layout', workspaceId: 'workspace-layout', name: 'Layout Project', description: null, status: 'active' }],
    currentProject: { id: 'project-layout', workspaceId: 'workspace-layout', name: 'Layout Project', description: null, status: 'active' },
    workflows: [],
    vaultSecrets: [],
    installedSkills: [],
    installedApps: [],
    superAgent: { id: 'super-layout', name: 'Super AgentOS', instructions: '', status: 'active' },
    subagents: [],
    memoryEntries: [],
    fileTree: [],
  };
}

async function gotoAndExpect(page: Page, url: string, ready: ReturnType<Page['locator']>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (await ready.isVisible().catch(() => false)) return;
    await page.waitForTimeout(250);
  }
  await expect(ready).toBeVisible();
}

test.describe('NL Studio layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('agentos.shell.leftCollapsed', 'false');
      window.localStorage.setItem('agentos.shell.rightCollapsed', 'false');
    });
    await page.route(/\/api\/session(?:\/refresh)?(?:\?|$)/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          session: {
            agentName: 'Layout QA',
            plan: 'pro',
            planLabel: 'Pro',
            accountType: 'retail',
            capabilities: [],
            expiresAt: '2030-01-01T00:00:00.000Z',
          },
        }),
      });
    });
    await page.route('**/api/session**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          session: {
            agentName: 'Layout QA',
            plan: 'pro',
            planLabel: 'Pro',
            accountType: 'retail',
            capabilities: [],
            expiresAt: '2030-01-01T00:00:00.000Z',
          },
        }),
      });
    });
    await page.route('**/api/shell/bootstrap', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          workspaces: [{ id: 'workspace-layout', name: 'Layout Workspace', slug: 'layout', plan: 'pro' }],
          sessions: [],
          projects: [{ id: 'project-layout', workspaceId: 'workspace-layout', name: 'Layout Project', status: 'active', pinned: false, updatedAt: now }],
          notifications: { unread: 0 },
          agents: { connected: 0 },
        }),
      });
    });
    await page.route('**/api/executions**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ executions: [] }) });
    });
    await page.route('**/api/recovery**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ executions: [] }) });
    });
    await page.route('**/api/notifications**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) });
    });
  });

  test('keeps the empty state compact before conversation starts', async ({ page }) => {
    await page.route('**/api/studio/bootstrap**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(studioPayload([])) });
    });

    await gotoAndExpect(page, '/studio?mode=nl', page.getByRole('heading', { name: 'What should Super AgentOS do?' }));
    await expect(page.locator('.nl-message-list')).toHaveCount(0);
    await expect(page.locator('.nl-composer')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test('turns the active conversation into the page on desktop and mobile', async ({ page }) => {
    const messages = [
      { id: 'message-user', role: 'user', content: 'Summarize the project status.', createdAt: now, state: 'complete' },
      {
        id: 'message-assistant',
        role: 'assistant',
        content: 'AgentOS is moving through controlled phases. Studio now keeps the conversation centered and readable.',
        createdAt: now,
        state: 'complete',
      },
    ];
    await page.route('**/api/studio/bootstrap**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(studioPayload(messages)) });
    });

    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await gotoAndExpect(page, '/studio?mode=nl&session=session-layout', page.locator('.nl-message.user'));

      await expect(page.locator('.nl-empty-state')).toHaveCount(0);
      await expect(page.locator('.nl-message.user')).toBeVisible();
      await expect(page.locator('.nl-message.assistant')).toBeVisible();
      await expect(page.locator('.nl-composer')).toBeVisible();
      const metrics = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        column: Math.round(document.querySelector('.nl-message-list')?.getBoundingClientRect().width ?? 0),
      }));
      expect(metrics.overflow).toBeLessThanOrEqual(2);
      expect(metrics.column).toBeLessThanOrEqual(viewport.width < 720 ? viewport.width - 20 : 822);
    }
  });
});
