import { expect, test, type Page, type Route } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const artifactDir = 'agentos-artifacts/v663-browser';

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockCollapsedShell(page: Page) {
  const now = new Date().toISOString();
  const session = {
    agentName: 'Shell QA',
    plan: 'enterprise_max',
    planLabel: 'Enterprise Max',
    accountType: 'enterprise',
    capabilities: ['access_developer_console'],
    expiresAt: '2030-01-01T00:00:00.000Z',
  };
  const handleSession = (route: Route) => {
    if (route.request().url().includes('/refresh')) return fulfillJson(route, { authenticated: true });
    return fulfillJson(route, { authenticated: true, session });
  };
  await page.route(/\/api\/session(?:\/refresh)?(?:\?|$)/, handleSession);
  await page.route('**/api/session**', handleSession);
  await page.route('**/api/shell/bootstrap**', route => fulfillJson(route, {
    workspaces: [{ id: 'workspace-shell', name: 'Shell Workspace', slug: 'shell', plan: 'enterprise_max' }],
    sessions: [
      { id: 'session-a', workspaceId: 'workspace-shell', projectId: 'project-a', title: 'A', status: 'active', pinnedAt: null, archivedAt: null, updatedAt: now },
      { id: 'session-b', workspaceId: 'workspace-shell', projectId: null, title: 'B', status: 'active', pinnedAt: null, archivedAt: null, updatedAt: now },
    ],
    projects: [{ id: 'project-a', workspaceId: 'workspace-shell', name: 'Alpha', status: 'active', pinned: true, updatedAt: now }],
    notifications: { unread: 7 },
    agents: { connected: 3 },
  }));
  await page.route('**/api/notifications**', route => fulfillJson(route, {
    notifications: [
      { id: 'n1', type: 'system', title: 'One', body: 'Ready', status: 'unread', metadata: {}, createdAt: now, readAt: null },
      { id: 'n2', type: 'system', title: 'Two', body: 'Ready', status: 'unread', metadata: {}, createdAt: now, readAt: null },
    ],
  }));
  await page.route('**/api/studio/bootstrap**', route => fulfillJson(route, {
    session: null,
    sessions: [],
    lineage: { parent: null, children: [] },
    messages: [],
    events: [],
    workspaces: [{ id: 'workspace-shell', name: 'Shell Workspace' }],
    projects: [{ id: 'project-a', workspaceId: 'workspace-shell', name: 'Alpha', description: null, status: 'active' }],
    currentProject: { id: 'project-a', workspaceId: 'workspace-shell', name: 'Alpha', description: null, status: 'active' },
    workflows: [],
    vaultSecrets: [],
    installedSkills: [],
    installedApps: [],
    superAgent: { id: 'super-shell', name: 'Super AgentOS', instructions: '', status: 'active' },
    subagents: [],
    memoryEntries: [],
    fileTree: [],
  }));
  await page.route('**/api/executions**', route => fulfillJson(route, { executions: [] }));
  await page.route('**/api/recovery**', route => fulfillJson(route, { executions: [] }));
  await page.route('**/api/tasks**', route => fulfillJson(route, { tasks: [] }));
}

test('desktop shell navigation, collapse, persistence, and FFP state', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile');
  await page.goto('/studio');
  const left = page.locator('.agentos-global-left');
  const right = page.locator('.agentos-global-right');
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();

  const labels = await page.locator('.agentos-global-nav b').allTextContents();
  expect(labels).toEqual(['Home', 'Studio', 'Search', 'Tasks', 'Projects', 'Library', 'App Store', 'Skill Store', 'Subagents', 'Workflows', 'Memory', 'Vault', 'Universal MCP', 'Developer', 'Community', 'FFP', 'Docs', 'Settings']);

  if (await page.locator('.agentos-global-shell').getAttribute('data-left-collapsed') === 'true') {
    await page.getByLabel('Expand navigation sidebar').click();
  }
  await page.getByLabel('Collapse navigation sidebar').click();
  await expect(page.locator('.agentos-global-shell')).toHaveAttribute('data-left-collapsed', 'true');
  await expect.poll(async () => Number(await page.locator('html').getAttribute('data-agentos-sidebar-ms'))).toBeLessThan(50);
  await page.reload();
  await expect(page.locator('.agentos-global-shell')).toHaveAttribute('data-left-collapsed', 'true');

  await page.goto('/ffp');
  await expect(page.getByRole('heading', { name: 'Coming Soon' })).toBeVisible();
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: `${artifactDir}/${testInfo.project.name}-shell.png`, fullPage: true });
  const response = await request.patch('/api/ffp/temp', { data: { enabled: true } });
  expect(response.status()).toBe(405);
});

test('collapsed sidebars keep icons and live counts visible', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile');
  await page.addInitScript(() => {
    window.localStorage.setItem('agentos.shell.leftCollapsed', 'false');
    window.localStorage.setItem('agentos.shell.rightCollapsed', 'false');
  });
  await mockCollapsedShell(page);
  await page.goto('/studio', { waitUntil: 'domcontentloaded' });
  const shell = page.locator('.agentos-global-shell');
  await expect(page.getByLabel('7 unread notifications').first()).toBeVisible();
  await expect(shell).toHaveAttribute('data-left-collapsed', 'false');
  await expect(shell).toHaveAttribute('data-right-collapsed', 'false');

  await page.getByLabel('Collapse navigation sidebar').click();
  await page.getByLabel('Collapse context sidebar').click();

  await expect(shell).toHaveAttribute('data-left-collapsed', 'true');
  await expect(shell).toHaveAttribute('data-right-collapsed', 'true');

  const nav = page.getByRole('navigation', { name: 'AgentOS modules' });
  await expect(nav.getByRole('link', { name: /Home/ }).locator('svg')).toBeVisible();
  await expect(nav.getByRole('link', { name: /Developer/ }).locator('svg')).toBeVisible();
  await expect(nav.getByRole('link', { name: /Home/ }).locator('.agentos-nav-badge')).toHaveText('7');
  await expect(nav.getByRole('link', { name: /Developer/ }).locator('.agentos-nav-badge')).toHaveText('3');

  const rail = page.locator('.agentos-global-context-rail');
  await expect(rail).toBeVisible();
  await expect(rail.getByRole('button', { name: /Open notifications/ }).locator('b')).toHaveText('7');
  await expect(rail.getByRole('button', { name: '3 connected agents' }).locator('b')).toHaveText('3');
});

test('every first-class module renders inside the persistent shell', async ({ page }) => {
  const routes = ['/studio', '/search', '/tasks', '/projects', '/library', '/skills', '/appstore', '/skillstore', '/subagents', '/mcp', '/vault', '/community', '/resources', '/ffp', '/settings'];
  for (const route of routes) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.agentos-global-shell')).toBeVisible();
    await expect(page.locator('.agentos-global-header')).toBeVisible();
  }
});

test('Studio modes retain the global shell', async ({ page }, testInfo) => {
  await page.goto('/studio?mode=nl');
  const shellInstance = await page.locator('.agentos-global-shell').getAttribute('data-shell-instance');
  await page.getByRole('tab', { name: 'Primeflow Builder' }).click();
  await expect(page.locator('.agentos-global-shell')).toHaveAttribute('data-shell-instance', shellInstance ?? '');
  await page.getByRole('tab', { name: 'Code Studio' }).click();
  await expect(page.locator('.agentos-global-shell')).toHaveAttribute('data-shell-instance', shellInstance ?? '');
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: `${artifactDir}/${testInfo.project.name}-studio-code.png`, fullPage: true });
});

test('mobile uses left and right drawers', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.locator('.agentos-global-shell')).toHaveAttribute('data-left-open', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-agentos-drawer-open', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('.agentos-global-shell')).toHaveAttribute('data-left-open', 'false');
  await expect(page.locator('body')).toHaveAttribute('data-agentos-drawer-open', 'false');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: /Library/ }).click();
  await expect(page).toHaveURL(/\/library/);
  await expect(page.locator('.agentos-global-shell')).toHaveAttribute('data-left-open', 'false');
  await page.getByRole('button', { name: 'Open context' }).click();
  await expect(page.locator('.agentos-global-shell')).toHaveAttribute('data-right-open', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-agentos-drawer-open', 'true');
  await expect(page.getByText('More', { exact: true })).toHaveCount(0);
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: `${artifactDir}/mobile-context.png`, fullPage: true });
});
