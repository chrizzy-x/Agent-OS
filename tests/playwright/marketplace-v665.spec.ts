import { expect, test } from '@playwright/test';

test.describe('AgentOS V6.6.7 marketplace experience routes', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('agentos:theme', 'light');
      document.documentElement.dataset.theme = 'light';
    });
  });

  test('renders App Store marketplace shell', async ({ page }) => {
    await page.goto('/appstore', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.surface-shell-main').getByRole('heading', { name: 'App Store' })).toBeVisible();
    await expect(page.getByLabel('Search apps')).toBeVisible();
    await expect(page.locator('.market-shell').first()).not.toHaveCSS('background-color', 'rgb(0, 0, 0)');
    const appstoreSurface = page.locator('.surface-shell-main:visible').first();
    await expect(appstoreSurface).toBeVisible();
    const appstoreWidth = await appstoreSurface.evaluate(element => element.clientWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(appstoreWidth / viewportWidth).toBeGreaterThan(0.7);
  });

  test('renders Skill Store marketplace shell', async ({ page }) => {
    await page.goto('/skillstore', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.surface-shell-main').getByRole('heading', { name: 'Skill Store' })).toBeVisible();
    await expect(page.getByLabel('Search skills')).toBeVisible();
    const skillFilterRow = page.locator('.market-filter-row').filter({ hasText: 'Filter' });
    await expect(skillFilterRow.locator('select').first()).toBeVisible();
    await expect(skillFilterRow.locator('select').last()).toBeVisible();
    await expect(skillFilterRow).toContainText('Needs permission');
    await expect(skillFilterRow).toContainText('Recent');
    await expect(page.locator('.market-shell').first()).not.toHaveCSS('background-color', 'rgb(0, 0, 0)');
  });

  test('renders publishing routes', async ({ page }) => {
    await page.goto('/publish/app');
    await expect(page.getByText(/Publish App|Publishing Access/)).toBeVisible();

    await page.goto('/publish/skill');
    await expect(page.getByText(/Publish Skill|Publishing Access/)).toBeVisible();
  });

  test('renders enterprise app publishing with honest review states', async ({ page }) => {
    await page.route('**/api/session**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          session: {
            agentName: 'Enterprise Publisher',
            plan: 'enterprise_max',
            planLabel: 'Enterprise Max',
            accountType: 'enterprise',
            capabilities: ['access_developer_console', 'create_app', 'publish_app'],
            expiresAt: '2030-01-01T00:00:00.000Z',
          },
        }),
      });
    });

    await page.goto('/publish/app', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Publish App' })).toBeVisible();
    await page.getByRole('tab', { name: 'Store Listing' }).click();
    await expect(page.getByText('Screenshots and design attachments')).toBeVisible();
    await expect(page.getByPlaceholder('Android build link optional')).toBeVisible();
    await expect(page.getByPlaceholder('iOS build link optional')).toBeVisible();
    await page.getByRole('tab', { name: 'Publish' }).click();
    await expect(page.getByText('Review readiness', { exact: true })).toBeVisible();
    await expect(page.getByText('Review backend disabled')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve Review' })).toBeDisabled();
    await expect(page.getByLabel('App manifest preview')).toBeVisible();
  });

  test('renders enterprise skill publishing with honest review and test states', async ({ page }) => {
    await page.route('**/api/session**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          session: {
            agentName: 'Enterprise Publisher',
            plan: 'enterprise_max',
            planLabel: 'Enterprise Max',
            accountType: 'enterprise',
            capabilities: ['access_developer_console', 'create_skill', 'publish_skill'],
            expiresAt: '2030-01-01T00:00:00.000Z',
          },
        }),
      });
    });

    await page.goto('/publish/skill', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Publish Skill' })).toBeVisible();
    await page.getByRole('tab', { name: 'Configure Skill' }).click();
    await expect(page.getByText('Test invocation', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run live test' })).toBeDisabled();
    await expect(page.getByText('Live runtime tests require installing the saved skill from Skill Store.')).toBeVisible();
    await page.getByRole('tab', { name: 'Store Listing' }).click();
    await expect(page.getByLabel('Upload skill visuals')).toBeDisabled();
    await expect(page.getByText('Binary visual upload is disabled until durable media storage is connected.')).toBeVisible();
    await page.getByRole('tab', { name: 'Publish' }).click();
    await expect(page.getByText('Review readiness', { exact: true })).toBeVisible();
    await expect(page.getByText('Review backend disabled')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve Review' })).toBeDisabled();
    await expect(page.getByLabel('Skill manifest preview')).toBeVisible();
  });
});
