import { expect, test, type Page, type Route } from '@playwright/test';

const now = '2026-07-11T09:00:00.000Z';

type Execution = {
  id: string;
  title: string;
  status: string;
  workflowId: string;
  output: unknown;
  error: Record<string, unknown> | null;
  failure: Record<string, unknown> | null;
  recoveryAction: string | null;
  recoveryRequestedAt: string | null;
  durationMs: number | null;
  startedAt: string | null;
  pausedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Log = {
  id: string;
  executionId: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  data: Record<string, unknown>;
  createdAt: string;
};

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockWorkflowRuns(page: Page) {
  const workflow = {
    id: 'workflow-run',
    name: 'Phase 19 launch workflow',
    summary: 'Runs launch checks and records safe logs.',
    status: 'active',
    visibility: 'private',
    schedule: 'RRULE:FREQ=DAILY;BYHOUR=9',
    version: 3,
    steps: [{ order: 1, tool: 'skill:research', description: 'Research launch facts.', input: { query: 'phase 19' } }],
    graph_state: { nodes: [], edges: [] },
    code_state: null,
    canonical_doc: {},
    last_result: { message: 'Previous run summary.' },
    last_error: null,
  };
  let executions: Execution[] = [
    {
      id: 'exec-failed',
      title: 'Phase 19 launch workflow',
      status: 'FAILED',
      workflowId: workflow.id,
      output: null,
      error: { whatFailed: 'Provider rejected request', possibleFix: 'Reconnect Vault grant' },
      failure: { whatFailed: 'Provider rejected request', possibleFix: 'Reconnect Vault grant' },
      recoveryAction: null,
      recoveryRequestedAt: null,
      durationMs: 1450,
      startedAt: '2026-07-11T08:58:00.000Z',
      pausedAt: null,
      cancelledAt: null,
      completedAt: '2026-07-11T08:58:02.000Z',
      createdAt: '2026-07-11T08:57:59.000Z',
      updatedAt: '2026-07-11T08:58:02.000Z',
    },
    {
      id: 'exec-running',
      title: 'Phase 19 active workflow',
      status: 'RUNNING',
      workflowId: workflow.id,
      output: null,
      error: null,
      failure: null,
      recoveryAction: null,
      recoveryRequestedAt: null,
      durationMs: null,
      startedAt: '2026-07-11T08:59:00.000Z',
      pausedAt: null,
      cancelledAt: null,
      completedAt: null,
      createdAt: '2026-07-11T08:59:00.000Z',
      updatedAt: '2026-07-11T08:59:10.000Z',
    },
  ];
  const logs = new Map<string, Log[]>([
    ['exec-failed', [
      { id: 'log-start', executionId: 'exec-failed', level: 'info', message: 'Workflow started', data: { step: 'research' }, createdAt: '2026-07-11T08:58:00.000Z' },
      { id: 'log-fail', executionId: 'exec-failed', level: 'error', message: 'Provider rejected request', data: { token: 'sk-live-secret-value-1234567890', stack: 'suppressed stack trace' }, createdAt: '2026-07-11T08:58:02.000Z' },
    ]],
    ['exec-running', [
      { id: 'log-run', executionId: 'exec-running', level: 'info', message: 'Executing skill node', data: { node: 'Research Skill' }, createdAt: '2026-07-11T08:59:01.000Z' },
    ]],
  ]);

  await page.addInitScript(() => {
    window.localStorage.setItem('agentos.shell.leftCollapsed', 'false');
    window.localStorage.setItem('agentos.shell.rightCollapsed', 'false');
  });
  await page.route(/\/api\/session(?:\/refresh)?(?:\?|$)/, async route => fulfillJson(route, {
    authenticated: true,
    session: {
      agentName: 'Workflow Runner',
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
      agentName: 'Workflow Runner',
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
    workspaces: [{ id: 'workspace-flow', name: 'Workflow Workspace', slug: 'workflow', plan: 'pro' }],
    sessions: [],
    projects: [],
    notifications: { unread: 0 },
    agents: { connected: 0 },
  }));
  await page.route('**/api/recovery**', async route => fulfillJson(route, { executions: [] }));
  await page.route('**/api/notifications**', async route => fulfillJson(route, { notifications: [] }));
  await page.route('**/api/agent/workflows**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/run-due')) {
      const body = await route.request().postDataJSON() as Record<string, unknown>;
      expect(body.workflowId).toBe(workflow.id);
      const execution: Execution = {
        id: 'exec-manual',
        title: 'Manual launch workflow run',
        status: 'COMPLETED',
        workflowId: workflow.id,
        output: { message: 'Manual run completed.' },
        error: null,
        failure: null,
        recoveryAction: null,
        recoveryRequestedAt: null,
        durationMs: 900,
        startedAt: now,
        pausedAt: null,
        cancelledAt: null,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      executions = [execution, ...executions];
      logs.set(execution.id, [{ id: 'log-manual', executionId: execution.id, level: 'info', message: 'Manual run completed', data: { result: 'ok' }, createdAt: now }]);
      await fulfillJson(route, { ran: 1, executionId: execution.id, results: [{ workflowId: workflow.id, status: 'completed' }] });
      return;
    }
    await fulfillJson(route, { workflows: [workflow] });
  });
  await page.route('**/api/executions**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const actionMatch = url.pathname.match(/\/api\/executions\/([^/]+)\/actions$/);
    const bundleMatch = url.pathname.match(/\/api\/executions\/([^/]+)$/);
    if (actionMatch && request.method() === 'POST') {
      const action = ((await request.postDataJSON()) as Record<string, unknown>).action;
      const id = actionMatch[1];
      executions = executions.map(item => item.id === id ? {
        ...item,
        status: action === 'retry' ? 'QUEUED' : action === 'cancel' ? 'CANCELLED' : item.status,
        recoveryAction: String(action),
        recoveryRequestedAt: now,
        updatedAt: now,
        cancelledAt: action === 'cancel' ? now : item.cancelledAt,
        completedAt: action === 'cancel' ? now : item.completedAt,
      } : item);
      logs.set(id, [...(logs.get(id) ?? []), { id: `log-${String(action)}`, executionId: id, level: action === 'cancel' ? 'warning' : 'info', message: `Execution action requested: ${String(action)}`, data: {}, createdAt: now }]);
      await fulfillJson(route, { execution: executions.find(item => item.id === id) });
      return;
    }
    if (bundleMatch && request.method() === 'GET') {
      const id = bundleMatch[1];
      await fulfillJson(route, { execution: executions.find(item => item.id === id), logs: logs.get(id) ?? [] });
      return;
    }
    await fulfillJson(route, { executions });
  });
}

test.describe('Workflow runs and logs', () => {
  test('shows run lifecycle, safe logs, and supported retry/cancel actions', async ({ page }) => {
    await mockWorkflowRuns(page);
    await page.goto('/workflows/workflow-run', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Phase 19 launch workflow' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Run history')).toBeVisible();
    await expect(page.getByTestId('workflow-run-history')).toContainText('FAILED');

    await page.getByRole('button', { name: /Phase 19 launch workflow/ }).click();
    await expect(page.getByTestId('workflow-runtime-drawer')).toBeVisible();
    await expect(page.getByTestId('workflow-execution-logs')).toContainText('Provider rejected request');
    await page.getByTestId('workflow-execution-logs').getByText('Provider rejected request').click();
    await expect(page.getByTestId('workflow-execution-logs')).not.toContainText('sk-live-secret-value');
    await expect(page.getByRole('button', { name: 'Retry' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('Execution retry requested.')).toBeVisible();

    await page.getByRole('dialog', { name: 'Workflow runtime' }).getByRole('button', { name: 'Close drawer' }).click();
    await page.getByRole('button', { name: /Phase 19 active workflow/ }).click();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Execution cancel requested.')).toBeVisible();

    await page.getByRole('dialog', { name: 'Workflow runtime' }).getByRole('button', { name: 'Close drawer' }).click();
    await page.getByRole('button', { name: 'Manual Run' }).click();
    await expect(page.getByText('Run recorded as exec-manual.')).toBeVisible();
    await expect(page.getByTestId('workflow-run-history')).toContainText('COMPLETED');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
