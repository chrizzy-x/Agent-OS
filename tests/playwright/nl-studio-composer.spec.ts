import { expect, test } from '@playwright/test';

const now = '2026-07-09T00:00:00.000Z';

function studioPayload() {
  return {
    session: {
      id: 'session-composer',
      workspaceId: 'workspace-composer',
      projectId: 'project-alpha',
      title: 'Composer QA',
      visibility: 'private',
      updatedAt: now,
    },
    sessions: [],
    lineage: { parent: null, children: [] },
    messages: [
      { id: 'message-user', role: 'user', content: 'Prepare the workspace.', createdAt: now, state: 'complete' },
      { id: 'message-assistant', role: 'assistant', content: 'Ready.', createdAt: now, state: 'complete' },
    ],
    events: [],
    workspaces: [{ id: 'workspace-composer', name: 'Composer Workspace' }],
    projects: [
      { id: 'project-alpha', workspaceId: 'workspace-composer', name: 'Alpha Project', description: null, status: 'active' },
      { id: 'project-beta', workspaceId: 'workspace-composer', name: 'Beta Project', description: null, status: 'active' },
    ],
    currentProject: { id: 'project-alpha', workspaceId: 'workspace-composer', name: 'Alpha Project', description: null, status: 'active' },
    workflows: [],
    vaultSecrets: [],
    installedSkills: [],
    installedApps: [],
    superAgent: { id: 'super-composer', name: 'Super AgentOS', instructions: '', status: 'active' },
    subagents: [
      { id: 'subagent-research', workspaceId: 'workspace-composer', projectId: 'project-alpha', name: 'Research Operator', description: 'Private research operator', visibility: 'private', exposedCapabilities: [], status: 'active', updatedAt: now },
    ],
    memoryEntries: [],
    fileEntries: [],
    fileTree: [],
  };
}

test.describe('NL Studio composer', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/session**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          session: {
            agentName: 'Composer QA',
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
          workspaces: [{ id: 'workspace-composer', name: 'Composer Workspace', slug: 'composer', plan: 'pro' }],
          sessions: [],
          projects: [
            { id: 'project-alpha', workspaceId: 'workspace-composer', name: 'Alpha Project', status: 'active', pinned: false, updatedAt: now },
            { id: 'project-beta', workspaceId: 'workspace-composer', name: 'Beta Project', status: 'active', pinned: false, updatedAt: now },
          ],
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
  });

  test('selects subagents, projects, and context from the composer', async ({ page }) => {
    await page.goto('/studio?mode=nl&session=session-composer', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Project: Alpha Project')).toBeVisible();
    await page.locator('.nl-composer-tools').getByRole('button', { name: 'Subagents' }).click();
    await page.getByRole('menu', { name: 'subagent resources' }).getByRole('button', { name: 'Research Operator' }).click();
    await expect(page.getByRole('button', { name: 'subagent: Research Operator x' })).toBeVisible();

    await page.locator('.nl-composer-tools').getByRole('button', { name: 'Project' }).click();
    await page.getByRole('menu', { name: 'project resources' }).getByRole('button', { name: 'Beta Project' }).click();
    await expect(page).toHaveURL(/project=project-beta/);

    await page.locator('.nl-composer-tools').getByRole('button', { name: 'Context' }).click();
    await page.getByRole('menu', { name: 'context resources' }).getByRole('button', { name: 'Memory' }).click();
    await expect(page.getByRole('heading', { name: 'Memory' })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test('shows honest empty states for unavailable composer resources', async ({ page }) => {
    await page.goto('/studio?mode=nl&session=session-composer', { waitUntil: 'domcontentloaded' });

    await page.locator('.nl-composer-tools').getByRole('button', { name: 'Skills' }).click();
    await expect(page.getByRole('menu', { name: 'skill resources' })).toContainText('No connected skill resources.');

    await page.locator('.nl-composer-tools').getByRole('button', { name: 'Apps' }).click();
    await expect(page.getByRole('menu', { name: 'app resources' })).toContainText('No connected app resources.');
  });
});
