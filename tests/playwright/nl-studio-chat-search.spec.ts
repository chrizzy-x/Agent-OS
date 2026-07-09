import { expect, test, type Page } from '@playwright/test';

const now = '2026-07-09T00:00:00.000Z';

function studioPayload() {
  return {
    session: {
      id: 'session-search',
      workspaceId: 'workspace-search',
      projectId: 'project-search',
      title: 'Search QA',
      visibility: 'private',
      updatedAt: now,
    },
    sessions: [],
    lineage: { parent: null, children: [] },
    messages: [
      {
        id: 'message-user',
        role: 'user',
        content: 'We need vault handoff notes for the Alpha project. Vault access must stay private.',
        createdAt: now,
        state: 'complete',
      },
      {
        id: 'message-assistant',
        role: 'assistant',
        content: 'Vault permissions are required before a workflow can use secrets. The Alpha project remains attached.',
        createdAt: now,
        state: 'complete',
      },
    ],
    events: [],
    workspaces: [{ id: 'workspace-search', name: 'Search Workspace' }],
    projects: [{ id: 'project-search', workspaceId: 'workspace-search', name: 'Search Project', description: null, status: 'active' }],
    currentProject: { id: 'project-search', workspaceId: 'workspace-search', name: 'Search Project', description: null, status: 'active' },
    workflows: [],
    vaultSecrets: [],
    installedSkills: [],
    installedApps: [],
    superAgent: { id: 'super-search', name: 'Super AgentOS', instructions: '', status: 'active' },
    subagents: [],
    memoryEntries: [],
    fileTree: [],
  };
}

async function mockStudio(page: Page) {
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
          agentName: 'Search QA',
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
          agentName: 'Search QA',
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
        workspaces: [{ id: 'workspace-search', name: 'Search Workspace', slug: 'search', plan: 'pro' }],
        sessions: [],
        projects: [{ id: 'project-search', workspaceId: 'workspace-search', name: 'Search Project', status: 'active', pinned: false, updatedAt: now }],
        notifications: { unread: 0 },
        agents: { connected: 0 },
      }),
    });
  });
  await page.route('**/api/studio/bootstrap**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(studioPayload()) });
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
}

async function gotoStudio(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto('/studio?mode=nl&session=session-search', { waitUntil: 'domcontentloaded' });
    if (await page.getByRole('textbox', { name: 'Search active conversation' }).isVisible().catch(() => false)) return;
    await page.waitForTimeout(250);
  }
  await expect(page.getByRole('textbox', { name: 'Search active conversation' })).toBeVisible();
}

test.describe('NL Studio active chat search', () => {
  test.beforeEach(async ({ page }) => {
    await mockStudio(page);
  });

  test('highlights matches and jumps through active conversation results', async ({ page }) => {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await gotoStudio(page);

      const input = page.getByRole('textbox', { name: 'Search active conversation' });
      await input.fill('vault');
      await expect(page.getByText('1/3 matches')).toBeVisible();
      await expect(page.locator('mark.nl-chat-search-hit')).toHaveCount(3);
      await expect(page.locator('mark.nl-chat-search-hit.active')).toHaveCount(1);

      await page.getByRole('button', { name: 'Next match' }).click();
      await expect(page.getByText('2/3 matches')).toBeVisible();

      await input.press('Shift+Enter');
      await expect(page.getByText('1/3 matches')).toBeVisible();

      await input.fill('missing');
      await expect(page.getByText('0 matches')).toBeVisible();
      await expect(page.locator('mark.nl-chat-search-hit')).toHaveCount(0);

      await page.getByRole('button', { name: 'Clear chat search' }).click();
      await expect(input).toHaveValue('');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(2);
    }
  });
});
