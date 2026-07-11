import { expect, test, type Page, type Route } from '@playwright/test';

const now = '2026-07-11T09:00:00.000Z';

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockScheduledWorkflow(page: Page) {
  let workflow = {
    id: 'workflow-scheduled',
    name: 'Phase 20 scheduled workflow',
    summary: 'Runs recurring launch checks.',
    status: 'active',
    visibility: 'private',
    schedule: '@hourly',
    task_id: 'task-scheduled',
    version: 4,
    steps: [{ order: 1, tool: 'skill:research', description: 'Research launch checks.', input: { query: 'phase 20' } }],
    graph_state: { nodes: [], edges: [] },
    code_state: null,
    canonical_doc: {},
    last_result: { message: 'Last scheduled run completed.' },
    last_error: null,
    last_run_at: now,
  };
  const patchBodies: Array<Record<string, unknown>> = [];

  await page.addInitScript(() => {
    window.localStorage.setItem('agentos.shell.leftCollapsed', 'false');
    window.localStorage.setItem('agentos.shell.rightCollapsed', 'false');
  });
  await page.route(/\/api\/session(?:\/refresh)?(?:\?|$)/, async route => fulfillJson(route, {
    authenticated: true,
    session: {
      agentName: 'Workflow Scheduler',
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
      agentName: 'Workflow Scheduler',
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
    workspaces: [{ id: 'workspace-schedule', name: 'Schedule Workspace', slug: 'schedule', plan: 'pro' }],
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
    if (url.pathname.endsWith(`/api/agent/workflows/${workflow.id}`) && request.method() === 'PATCH') {
      const body = await request.postDataJSON() as Record<string, unknown>;
      patchBodies.push(body);
      workflow = {
        ...workflow,
        status: typeof body.status === 'string' ? body.status : workflow.status,
        schedule: body.schedule === null ? null : typeof body.schedule === 'string' ? body.schedule : workflow.schedule,
        task_id: body.schedule === null ? workflow.task_id : workflow.task_id || 'task-scheduled',
      };
      await fulfillJson(route, { workflow });
      return;
    }
    await fulfillJson(route, { workflows: [workflow] });
  });

  return { patchBodies };
}

test.describe('Workflow scheduling', () => {
  test('edits and toggles recurring workflow schedules honestly', async ({ page }) => {
    const state = await mockScheduledWorkflow(page);
    await page.goto('/workflows/workflow-scheduled', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Phase 20 scheduled workflow' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Recurring schedule')).toBeVisible();
    await expect(page.getByText('enabled')).toBeVisible();
    await expect(page.getByText('Current schedule: Hourly')).toBeVisible();
    await expect(page.getByText(/Next run:/).last()).toBeVisible();

    await page.getByRole('button', { name: 'Disable recurring' }).click();
    await expect(page.getByText('Recurring workflow disabled.')).toBeVisible();
    await expect(page.getByText('disabled', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '15 min' }).click();
    await page.getByRole('button', { name: 'Save schedule' }).click();
    await expect(page.getByText('Recurring schedule saved.')).toBeVisible();
    await expect(page.getByText('Current schedule: Every 15 minutes')).toBeVisible();

    await page.getByRole('button', { name: 'Remove schedule' }).click();
    await expect(page.getByText('Recurring schedule removed.')).toBeVisible();
    await expect(page.getByText('Current schedule: Manual')).toBeVisible();

    expect(state.patchBodies).toEqual([
      expect.objectContaining({ status: 'paused' }),
      expect.objectContaining({ schedule: '*/15 * * * *', status: 'active' }),
      expect.objectContaining({ schedule: null }),
    ]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
