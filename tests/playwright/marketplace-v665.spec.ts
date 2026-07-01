import { expect, test } from '@playwright/test';

test.describe('AgentOS V6.6.7 marketplace experience routes', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('agentos:theme', 'light');
      document.documentElement.dataset.theme = 'light';
    });
  });

  test('renders App Store and Skill Store marketplace shells', async ({ page }) => {
    await page.goto('/appstore');
    await expect(page.locator('.surface-shell-main').getByRole('heading', { name: 'App Store' })).toBeVisible();
    await expect(page.getByLabel('Search apps')).toBeVisible();
    await expect(page.locator('.market-shell').first()).not.toHaveCSS('background-color', 'rgb(0, 0, 0)');
    const appstoreWidth = await page.locator('.surface-shell-main').evaluate(element => element.clientWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(appstoreWidth / viewportWidth).toBeGreaterThan(0.7);

    await page.goto('/skillstore');
    await expect(page.locator('.surface-shell-main').getByRole('heading', { name: 'Skill Store' })).toBeVisible();
    await expect(page.getByLabel('Search skills')).toBeVisible();
    await expect(page.locator('.market-shell').first()).not.toHaveCSS('background-color', 'rgb(0, 0, 0)');
  });

  test('renders publishing routes', async ({ page }) => {
    await page.goto('/publish/app');
    await expect(page.getByText(/Publish App|Publishing Access/)).toBeVisible();

    await page.goto('/publish/skill');
    await expect(page.getByText(/Publish Skill|Publishing Access/)).toBeVisible();
  });
});
