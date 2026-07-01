import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const surfaces = [
  ['home', '/'],
  ['search', '/search'],
  ['tasks', '/tasks'],
  ['library', '/library'],
  ['apps', '/apps'],
  ['skills', '/skills'],
  ['appstore', '/appstore'],
  ['skillstore', '/skillstore'],
  ['developer', '/developer'],
  ['projects', '/projects'],
  ['subagents', '/subagents'],
  ['workflows', '/workflows'],
  ['memory', '/memory'],
  ['vault', '/vault'],
  ['universal-mcp', '/mcp'],
  ['community', '/community'],
  ['resources', '/resources'],
  ['settings', '/settings'],
  ['ffp', '/ffp'],
] as const;

const navLabels = [
  'Home',
  'Studio',
  'Search',
  'Tasks',
  'Projects',
  'Library',
  'App Store',
  'Skill Store',
  'Subagents',
  'Workflows',
  'Memory',
  'Vault',
  'MCP',
  'Developer',
  'Community',
  'FFP',
  'Resources',
  'Settings',
];

test.describe('AgentOS V6.6.7 OS surfaces', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('agentos:theme', 'light');
      document.documentElement.dataset.theme = 'light';
    });
    const session = {
      authenticated: true,
      session: {
        agentName: 'QA Operator',
        plan: 'enterprise_max',
        planLabel: 'Enterprise Max',
        accountType: 'enterprise',
        capabilities: ['access_developer_console', 'create_app', 'create_skill', 'publish_skill', 'manage_webhook'],
        expiresAt: '2030-01-01T00:00:00.000Z',
      },
    };
    await page.route('**/api/session**', async route => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
        return;
      }
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
          notifications: { unread: 3 },
          agents: { connected: 2 },
        }),
      });
    });
    await page.route('**/api/notifications', async route => {
      const notifications = [
        { id: 'n1', type: 'workflow', title: 'Workflow finished', body: 'Daily research completed.', status: 'unread', metadata: {}, createdAt: new Date().toISOString(), readAt: null },
        { id: 'n2', type: 'billing', title: 'Invoice ready', body: 'Workspace invoice is available.', status: 'unread', metadata: {}, createdAt: new Date().toISOString(), readAt: null },
        { id: 'n3', type: 'security', title: 'New session', body: 'A desktop session signed in.', status: 'read', metadata: {}, createdAt: new Date().toISOString(), readAt: new Date().toISOString() },
      ];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications }) });
    });
  });

  test('renders required surfaces and captures QA screenshots', async ({ page }, testInfo) => {
    mkdirSync('agentos-artifacts/v666-qa', { recursive: true });

    for (const [name, route] of surfaces) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      await expect(page.locator('body')).not.toContainText('Unhandled Runtime Error');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(2);
      await page.screenshot({
        path: `agentos-artifacts/v666-qa/${testInfo.project.name}-${name}.png`,
        fullPage: true,
      });
    }
  });

  test('captures notification drawer and publishing flows', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    mkdirSync('agentos-artifacts/v666-qa', { recursive: true });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/unread notifications/).click();
    await expect(page.locator('.agentos-notification-drawer')).toBeVisible();
    await page.screenshot({
      path: `agentos-artifacts/v666-qa/${testInfo.project.name}-notifications.png`,
      fullPage: true,
    });

    await page.goto('/developer', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Media' }).click();
    await expect(page.getByText('Media Manager')).toBeVisible();
    await page.screenshot({
      path: `agentos-artifacts/v666-qa/${testInfo.project.name}-developer-media.png`,
      fullPage: true,
    });

    await page.goto('/publish/app', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Store Listing' }).click();
    await expect(page.locator('[data-surface="app-media-preview"]')).toBeVisible();
    await page.screenshot({
      path: `agentos-artifacts/v666-qa/${testInfo.project.name}-publishing-app.png`,
      fullPage: true,
    });

    await page.goto('/publish/skill', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Store Listing' }).click();
    await expect(page.locator('[data-surface="skill-media-preview"]')).toBeVisible();
    await page.screenshot({
      path: `agentos-artifacts/v666-qa/${testInfo.project.name}-publishing-skill.png`,
      fullPage: true,
    });

    await page.goto('/settings?section=billing', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Subscription & Billing' }),
    ).toBeVisible();
    await page.screenshot({
      path: `agentos-artifacts/v666-qa/${testInfo.project.name}-settings-billing.png`,
      fullPage: true,
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Open account menu').click();
    await expect(page.getByText('Logout All Devices')).toBeVisible();
    await page.screenshot({
      path: `agentos-artifacts/v666-qa/${testInfo.project.name}-avatar-menu.png`,
      fullPage: true,
    });
  });

  test('uses the required sidebar order on desktop', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop sidebar order only.');
    await page.goto('/');
    const labels = await page.locator('.agentos-global-nav a b').allTextContents();
    expect(labels).toEqual(navLabels);
  });

  test('keeps marketplace surfaces full-width and light in light mode', async ({ page }) => {
    for (const route of ['/appstore', '/skillstore']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const searchLabel = route === '/appstore' ? 'Search apps' : 'Search skills';
      const surface = page.locator('.surface-shell-main').filter({ has: page.getByLabel(searchLabel) }).first();
      const market = surface.locator('.market-shell').first();
      await expect(surface).toBeVisible();
      await expect(market).toBeVisible();
      const marketBg = await market.evaluate(element => getComputedStyle(element).backgroundColor);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      await expect.poll(async () => surface.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(0);
      const surfaceWidth = await surface.evaluate(element => element.getBoundingClientRect().width);
      expect(marketBg).not.toBe('rgb(0, 0, 0)');
      expect(surfaceWidth / viewportWidth).toBeGreaterThan(0.65);
    }
  });

  test('keeps legacy routes as aliases', async ({ page }) => {
    await page.goto('/billing');
    await expect(page).toHaveURL(/\/settings\?section=billing$/);
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/settings\?section=account$/);
    await page.goto('/apps');
    await expect(page.getByRole('heading', { name: 'Apps' })).toBeVisible();
    await page.goto('/skills/installed');
    await expect(page).toHaveURL(/\/skills$/);
    await page.goto('/docs');
    await expect(page).toHaveURL(/\/resources$/);
    await page.goto('/connectors');
    await expect(page).toHaveURL(/\/mcp$/);
    await page.goto('/skillstore');
    await expect(page.locator('.surface-shell-main').getByRole('heading', { name: 'Skill Store' })).toBeVisible();
  });
});
