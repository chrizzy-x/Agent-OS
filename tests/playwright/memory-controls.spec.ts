import { expect, test, type Page, type Route } from '@playwright/test';

const now = '2026-07-11T00:00:00.000Z';

type MemoryEntry = {
  id: string;
  ownerAgentId: string;
  workspaceId: string | null;
  key: string;
  content: string;
  tags: string[];
  visibility: 'private' | 'workspace' | 'public';
  namespaceType: string;
  namespaceId: string | null;
  metadata: Record<string, unknown>;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
};

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockMemory(page: Page) {
  let entries: MemoryEntry[] = [
    {
      id: 'memory-active',
      ownerAgentId: 'agent-memory',
      workspaceId: 'workspace-memory',
      key: 'launch-preference',
      content: 'Use concise launch updates.',
      tags: ['launch'],
      visibility: 'private',
      namespaceType: 'agent',
      namespaceId: 'agent-memory',
      metadata: {},
      disabled: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'memory-disabled',
      ownerAgentId: 'agent-memory',
      workspaceId: 'workspace-memory',
      key: 'old-disabled',
      content: 'Do not recall this old preference.',
      tags: [],
      visibility: 'private',
      namespaceType: 'workspace',
      namespaceId: 'project-memory',
      metadata: { disabled: true },
      disabled: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  await page.addInitScript(() => {
    window.localStorage.setItem('agentos.shell.leftCollapsed', 'false');
    window.localStorage.setItem('agentos.shell.rightCollapsed', 'false');
  });
  await page.route(/\/api\/session(?:\/refresh)?(?:\?|$)/, async route => {
    await fulfillJson(route, {
      authenticated: true,
      session: {
        agentName: 'Memory QA',
        plan: 'pro',
        planLabel: 'Pro',
        accountType: 'retail',
        capabilities: [],
        expiresAt: '2030-01-01T00:00:00.000Z',
      },
    });
  });
  await page.route('**/api/session**', async route => {
    await fulfillJson(route, {
      authenticated: true,
      session: {
        agentName: 'Memory QA',
        plan: 'pro',
        planLabel: 'Pro',
        accountType: 'retail',
        capabilities: [],
        expiresAt: '2030-01-01T00:00:00.000Z',
      },
    });
  });
  await page.route('**/api/shell/bootstrap', async route => {
    await fulfillJson(route, {
      workspaces: [{ id: 'workspace-memory', name: 'Memory Workspace', slug: 'memory', plan: 'pro' }],
      sessions: [],
      projects: [{ id: 'project-memory', workspaceId: 'workspace-memory', name: 'Memory Project', status: 'active', pinned: false, updatedAt: now }],
      notifications: { unread: 0 },
      agents: { connected: 0 },
    });
  });
  await page.route('**/api/panic**', async route => fulfillJson(route, {
    state: 'healthy',
    activeCount: 0,
    mcpDisabled: false,
    vaultDisabled: false,
    requireReauth: false,
  }));
  await page.route('**/api/memory/**', async route => {
    const id = route.request().url().split('/api/memory/')[1]?.split('?')[0] ?? '';
    const index = entries.findIndex(entry => entry.id === id);
    if (index < 0) {
      await fulfillJson(route, { error: 'missing' }, 404);
      return;
    }
    if (route.request().method() === 'PATCH') {
      const body = await route.request().postDataJSON() as Partial<MemoryEntry> & { disabledReason?: string };
      const metadata = {
        ...entries[index].metadata,
        ...(typeof body.disabled === 'boolean' ? { disabled: body.disabled, disabledReason: body.disabledReason ?? null } : {}),
      };
      entries[index] = {
        ...entries[index],
        content: typeof body.content === 'string' ? body.content : entries[index].content,
        visibility: body.visibility ?? entries[index].visibility,
        metadata,
        disabled: metadata.disabled === true,
        updatedAt: now,
      };
      await fulfillJson(route, { entry: entries[index] });
      return;
    }
    await fulfillJson(route, { entry: entries[index] });
  });
  await page.route('**/api/memory**', async route => {
    if (route.request().method() === 'POST') {
      const body = await route.request().postDataJSON() as Record<string, unknown>;
      if (typeof body.content === 'string' && /sk-[a-zA-Z0-9_-]{16,}/.test(body.content)) {
        await fulfillJson(route, { error: 'Secrets must be stored in Vault, not memory' }, 400);
        return;
      }
      const entry: MemoryEntry = {
        id: 'memory-created',
        ownerAgentId: 'agent-memory',
        workspaceId: 'workspace-memory',
        key: String(body.key),
        content: String(body.content),
        tags: [],
        visibility: body.visibility === 'workspace' || body.visibility === 'public' ? body.visibility : 'private',
        namespaceType: typeof body.namespaceType === 'string' ? body.namespaceType : 'agent',
        namespaceId: typeof body.namespaceId === 'string' ? body.namespaceId : 'agent-memory',
        metadata: {},
        disabled: false,
        createdAt: now,
        updatedAt: now,
      };
      entries = [entry, ...entries];
      await fulfillJson(route, { entry, execution: { id: 'exec-memory' } }, 201);
      return;
    }
    await fulfillJson(route, {
      entries,
      incomingGrants: [],
      viewerAgentId: 'agent-memory',
    });
  });
}

test.describe('Memory controls', () => {
  test.beforeEach(async ({ page }) => {
    await mockMemory(page);
  });

  test('manages memory status, scope, and secret safety', async ({ page }) => {
    await page.goto('/memory', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Memory settings')).toBeVisible();
    await expect(page.getByText('1 active')).toBeVisible();
    await expect(page.getByText('1 disabled')).toBeVisible();
    await expect(page.locator('strong').filter({ hasText: 'launch-preference' })).toBeVisible();
    await expect(page.getByText('old-disabled')).toHaveCount(0);

    await page.getByLabel('Memory status filter').selectOption('disabled');
    await expect(page.locator('strong').filter({ hasText: 'old-disabled' })).toBeVisible();
    await expect(page.getByText('launch-preference')).toHaveCount(0);

    await page.getByLabel('Memory status filter').selectOption('active');
    await page.getByPlaceholder('Memory key').fill('api-memory');
    await page.getByPlaceholder('What should AgentOS remember?').fill('api_key=sk-phase17secret1234567890');
    await expect(page.getByText('Detected credential-shaped text. Move that value to Vault before saving memory.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create memory' })).toBeDisabled();

    await page.getByPlaceholder('Memory key').fill('project-style');
    await page.getByPlaceholder('What should AgentOS remember?').fill('Use direct project updates.');
    await page.getByRole('button', { name: 'Use active project scope' }).click();
    await page.getByRole('button', { name: 'Create memory' }).click();
    await expect(page.getByText('Memory created.')).toBeVisible();
    await expect(page.locator('strong').filter({ hasText: 'project-style' })).toBeVisible();
    await expect(page.getByText('project/workspace:project-memory')).toBeVisible();

    const launchRow = page.locator('[data-memory-key="launch-preference"]');
    page.once('dialog', dialog => dialog.accept());
    await launchRow.getByRole('button', { name: 'Disable' }).click();
    await expect(page.getByText('Memory disabled.')).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
