import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const artifactDir = 'agentos-artifacts/v664-browser';

test('desktop shell navigation, collapse, persistence, and FFP state', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile');
  await page.goto('/');
  const left = page.locator('.agentos-global-left');
  const right = page.locator('.agentos-global-right');
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();

  const labels = await page.locator('.agentos-global-nav b').allTextContents();
  expect(labels).toEqual(['Home', 'Studio', 'Projects', 'Workflows', 'Library', 'App Store', 'Developer', 'FFP', 'Settings']);

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

test('every first-class module renders inside the persistent shell', async ({ page }) => {
  const routes = ['/', '/studio', '/projects', '/workflows', '/library', '/appstore', '/developer', '/ffp', '/settings'];
  for (const route of routes) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.agentos-global-shell')).toBeVisible();
    await expect(page.locator('.agentos-global-header')).toBeVisible();
  }
});

test('Studio modes retain the global shell', async ({ page }, testInfo) => {
  await page.goto('/studio?mode=nl');
  await expect(page.locator('.agentos-global-shell')).toHaveAttribute('data-studio', 'true');
  await page.getByRole('tab', { name: 'Workflow Studio' }).click();
  await expect(page.locator('.agentos-global-shell')).toHaveAttribute('data-studio', 'true');
  await expect(page.locator('.agentos-global-header')).toBeVisible();
  await page.getByRole('tab', { name: 'Code Studio' }).click();
  await expect(page.locator('.agentos-global-shell')).toHaveAttribute('data-studio', 'true');
  await expect(page.locator('.agentos-global-header')).toBeVisible();
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: `${artifactDir}/${testInfo.project.name}-studio-code.png`, fullPage: true });
});

test('mobile uses the five-item bottom navigation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await page.goto('/');
  await expect(page.locator('.agentos-mobile-primary-nav a')).toHaveCount(5);
  await expect(page.locator('.agentos-mobile-primary-nav')).toContainText('Home');
  await expect(page.locator('.agentos-mobile-primary-nav')).toContainText('Studio');
  await expect(page.locator('.agentos-mobile-primary-nav')).toContainText('Library');
  await expect(page.locator('.agentos-mobile-primary-nav')).toContainText('Workflows');
  await expect(page.locator('.agentos-mobile-primary-nav')).toContainText('Settings');
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: `${artifactDir}/mobile-bottom-nav.png`, fullPage: true });
});
