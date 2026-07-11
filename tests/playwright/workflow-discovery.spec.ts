import { expect, test, type Page, type Route } from '@playwright/test';

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockWorkflowDiscovery(page: Page) {
  let starred = false;
  let forked = false;
  let privateWorkflows: unknown[] = [];
  const actions: Array<Record<string, unknown>> = [];

  const publicWorkflow = {
    id: 'workflow-public',
    name: 'Public launch workflow',
    summary: 'Checks launch readiness without copying private data.',
    status: 'active',
    visibility: 'public',
    schedule: null,
    version: 2,
    stepCount: 1,
    starred,
    forked,
    monetization: 'not_monetized',
    pricingLabel: 'Not monetized',
    requiresVaultConfiguration: true,
    privateContextRemoved: true,
    privacyNote: 'Forks create a private copy without source project context or Vault secret values.',
  };

  await page.addInitScript(() => {
    window.localStorage.setItem('agentos.shell.leftCollapsed', 'false');
    window.localStorage.setItem('agentos.shell.rightCollapsed', 'false');
  });
  await page.route(/\/api\/session(?:\/refresh)?(?:\?|$)/, async route => fulfillJson(route, {
    authenticated: true,
    session: {
      agentName: 'Workflow Discoverer',
      plan: 'pro',
      planLabel: 'Pro',
      accountType: 'retail',
      capabilities: [],
      expiresAt: '2030-01-01T00:00:00.000Z',
    },
  }));
  await page.route('**/api/session**', async route => fulfillJson(route, {
    authenticated: true,
    session: {
      agentName: 'Workflow Discoverer',
      plan: 'pro',
      planLabel: 'Pro',
      accountType: 'retail',
      capabilities: [],
      expiresAt: '2030-01-01T00:00:00.000Z',
    },
  }));
  await page.route('**/api/panic**', async route => fulfillJson(route, {
    state: 'healthy',
    activeCount: 0,
    mcpDisabled: false,
    vaultDisabled: false,
    requireReauth: false,
  }));
  await page.route('**/api/shell/bootstrap**', async route => fulfillJson(route, {
    workspaces: [{ id: 'workspace-discovery', name: 'Discovery Workspace', slug: 'discovery', plan: 'pro' }],
    sessions: [],
    projects: [],
    notifications: { unread: 0 },
    agents: { connected: 0 },
  }));
  await page.route('**/api/recovery**', async route => fulfillJson(route, { executions: [] }));
  await page.route('**/api/notifications**', async route => fulfillJson(route, { notifications: [] }));
  await page.route('**/api/executions**', async route => fulfillJson(route, { executions: [] }));
  await page.route('**/api/agent/workflows**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/api/agent/workflows/workflow-public/actions') && request.method() === 'POST') {
      const body = await request.postDataJSON() as Record<string, unknown>;
      actions.push(body);
      if (body.action === 'star') {
        starred = true;
        await fulfillJson(route, { starred: true, monetization: 'not_monetized' });
        return;
      }
      forked = true;
      const forkedWorkflow = {
        id: 'workflow-fork',
        name: 'Fork of Public launch workflow',
        summary: 'Configure your own Vault secrets before running.',
        status: 'paused',
        visibility: 'private',
        schedule: null,
        version: 1,
        steps: [{ order: 1, tool: 'skill.launch', description: 'Run launch check', input: { vaultSecretId: null, query: 'readiness' } }],
        graph_state: { nodes: [], edges: [] },
        code_state: null,
        canonical_doc: {},
      };
      privateWorkflows = [forkedWorkflow];
      await fulfillJson(route, { forked: true, workflow: forkedWorkflow, monetization: 'not_monetized' }, 201);
      return;
    }
    if (url.searchParams.get('discover') === 'public') {
      await fulfillJson(route, { workflows: [{ ...publicWorkflow, starred, forked }] });
      return;
    }
    await fulfillJson(route, { workflows: privateWorkflows });
  });

  return { actions };
}

test.describe('Workflow discovery', () => {
  test('stars and forks public workflows without monetization confusion', async ({ page }) => {
    const state = await mockWorkflowDiscovery(page);
    await page.goto('/workflows', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Public workflow discovery')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Workflows are not monetized assets.')).toBeVisible();
    await expect(page.getByText('Public launch workflow')).toBeVisible();
    await expect(page.getByText('1 steps | Manual | Not monetized')).toBeVisible();
    await expect(page.getByText('Fork requires your own Vault secret configuration.')).toBeVisible();
    await expect(page.getByText('Private project and workspace references are stripped on fork.')).toBeVisible();

    await page.getByRole('button', { name: 'Star' }).click();
    await expect(page.getByText('Workflow starred into your Library. Workflows are shared, not monetized.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Starred' })).toBeVisible();

    await page.getByRole('button', { name: 'Fork privately' }).click();
    await expect(page.getByText('Workflow forked privately. Configure your own Vault secrets before running it.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fork of Public launch workflow' })).toBeVisible();

    expect(state.actions).toEqual([{ action: 'star' }, { action: 'fork' }]);
    const pageState = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      rawJsonVisible: /\{\s*"|stack trace|Unhandled|TypeError|SyntaxError/.test(document.body.innerText),
    }));
    expect(pageState.overflow).toBeLessThanOrEqual(2);
    expect(pageState.rawJsonVisible).toBe(false);
  });
});
