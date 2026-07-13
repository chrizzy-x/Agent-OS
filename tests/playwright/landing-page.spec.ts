import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const artifactDir = 'agentos-artifacts/landing-page';

test('root renders the animated AgentOS landing page', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('.agentos-global-shell')).toHaveCount(0);
  await expect(page.locator('.agentos-landing-headline')).toContainText('One command.');
  await expect(page.locator('.agentos-landing-headline')).toContainText('Super AgentOS handles the task end to end.');
  await expect(page.locator('.agentos-landing-copy')).toContainText('Describe the outcome. Super AgentOS understands the goal');
  await expect(page.locator('.agentos-super-badge')).toContainText('Super AgentOS');
  await expect(page.locator('.agentos-landing-descriptor')).toContainText('The default doorway into AgentOS');
  await expect(page.locator('.agentos-hero-logo')).toHaveCount(1);
  await expect(page.locator('.agentos-hero-logo')).toHaveAttribute('src', /agentos-landing-hero/);
  await expect(page.locator('.agentos-signal-line')).toHaveCount(5);
  await expect(page.locator('.agentos-command-text')).toContainText(/Build|Research|Turn my idea/, { timeout: 6000 });
  if (testInfo.project.name !== 'mobile') {
    await expect(page.getByRole('link', { name: 'Product' })).toHaveAttribute('href', '#product-demo');
    await expect(page.getByRole('link', { name: 'Appstore' })).toHaveAttribute('href', '/appstore');
    await expect(page.getByRole('link', { name: 'Developers' })).toHaveAttribute('href', '/developer');
  }
  await expect(page.getByRole('link', { name: 'Homepage' })).toHaveAttribute('href', '/dashboard');
  await expect(page.locator('.agentos-landing-open')).toHaveAttribute('href', '/studio?mode=nl');
});

test('landing page has no horizontal overflow on mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  expect(overflow).toBeLessThanOrEqual(4);
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: `${artifactDir}/390x844-landing.png`, fullPage: false });
});

test('reduced motion shows stable landing state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.agentos-command-text')).toContainText('Build and launch a complete product campaign.');
  await expect(page.locator('.agentos-status-indicator')).toContainText('Ready to enter AgentOS');
});

test('Open AgentOS enters the existing Studio route', async ({ page }) => {
  await page.goto('/');
  await page.locator('.agentos-landing-open').click();
  await expect(page).toHaveURL(/\/studio\?mode=nl/);
  await expect(page.locator('.agentos-global-shell')).toBeVisible();
});

test('Homepage enters the internal AgentOS Home route', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Homepage' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator('.agentos-global-shell')).toBeVisible();
});
