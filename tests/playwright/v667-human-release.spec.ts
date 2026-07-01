import { expect, test, type Page, type Route } from '@playwright/test';

const now = '2026-07-01T08:00:00.000Z';

type TaskStatus = 'queued' | 'planning' | 'awaiting_confirmation' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'needs_configuration';

type QaTask = {
  id: string;
  sessionId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  title: string;
  status: TaskStatus;
  plan: Array<Record<string, unknown>>;
  capabilityIds: string[];
  requiredPermissions: string[];
  confirmationStatus: 'not_required' | 'pending' | 'approved' | 'rejected';
  progress: number;
  errorMessage: string | null;
  resultSummary: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type QaConfirmation = {
  id: string;
  taskId: string | null;
  actionName: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  dataSummary: string;
  secretScopes: string[];
  expectedResult: string;
  approvalCount: number;
  requiredApprovals: number;
};

function sse(events: Array<[string, Record<string, unknown>]>): string {
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installReleaseMocks(page: Page) {
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
  const shellPayload = {
    workspaces: [{ id: 'workspace-release', name: 'Release Workspace', slug: 'release', plan: 'enterprise_max' }],
    sessions: [{ id: 'session-release-1', workspaceId: 'workspace-release', projectId: 'project-release', title: 'Release report chat', status: 'active', pinnedAt: null, archivedAt: null, updatedAt: now }],
    projects: [{ id: 'project-release', workspaceId: 'workspace-release', name: 'Launch QA Project', status: 'active', pinned: true, updatedAt: now }],
    notifications: { unread: 2 },
    agents: { connected: 1 },
  };
  const studioSession = {
    id: 'session-release-1',
    workspaceId: 'workspace-release',
    projectId: 'project-release',
    title: 'Release report chat',
    visibility: 'private',
    updatedAt: now,
  };
  const baseBootstrap = {
    session: null,
    sessions: shellPayload.sessions,
    lineage: { parent: null, children: [] },
    messages: [],
    events: [],
    workspaces: shellPayload.workspaces,
    projects: [{ id: 'project-release', workspaceId: 'workspace-release', name: 'Launch QA Project', description: 'Public release validation', status: 'active' }],
    currentProject: { id: 'project-release', workspaceId: 'workspace-release', name: 'Launch QA Project', description: 'Public release validation', status: 'active' },
    workflows: [{ id: 'workflow-daily-market', name: 'Daily Market Report', summary: 'Daily release report', status: 'active', visibility: 'private' }],
    vaultSecrets: [{ id: 'secret-openai', name: 'OpenAI API', status: 'available' }],
    installedSkills: [{ skill: { id: 'skill-research', name: 'Research Skill', slug: 'research-skill', description: 'Research topics with citations.' } }],
    installedApps: [{ id: 'app-report', name: 'Report Builder', slug: 'report-builder', description: 'Create project reports.' }],
    superAgent: { id: 'super-agentos', name: 'Super AgentOS', instructions: '', status: 'active' },
    subagents: [{ id: 'subagent-research', workspaceId: 'workspace-release', projectId: 'project-release', name: 'Research Subagent', description: 'Private research agent', visibility: 'private', exposedCapabilities: ['research'], status: 'active', updatedAt: now }],
    memoryEntries: [{ id: 'memory-lp', key: 'furgepad-lp-settings', content: 'Use conservative LP settings.', visibility: 'private', namespaceType: 'workspace', namespaceId: 'workspace-release', updatedAt: now }],
    fileTree: [{ id: 'readme', name: 'README.md', path: 'README.md', type: 'file', children: [] }],
  };
  let uploaded = false;
  let streamBodies: Array<Record<string, unknown>> = [];
  let approvalBodies: Array<Record<string, unknown>> = [];
  let notifications = [
    { id: 'n-task', type: 'task_completed', title: 'Task completed', body: 'Release report is ready.', status: 'unread', metadata: { actionHref: '/tasks?task=task-release-completed' }, createdAt: now, readAt: null },
    { id: 'n-config', type: 'mcp_disconnected', title: 'MCP needs auth', body: 'GitHub MCP requires authentication.', status: 'unread', metadata: {}, createdAt: now, readAt: null },
  ];
  const tasks: QaTask[] = [
    {
      id: 'task-release-running',
      sessionId: 'session-release-1',
      workspaceId: 'workspace-release',
      projectId: 'project-release',
      title: 'Live research task',
      status: 'running',
      plan: [{ step: 'research', status: 'running' }],
      capabilityIds: ['skill:research-skill'],
      requiredPermissions: ['workspace:read'],
      confirmationStatus: 'not_required',
      progress: 44,
      errorMessage: null,
      resultSummary: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    },
    {
      id: 'task-release-queued',
      sessionId: 'session-release-1',
      workspaceId: 'workspace-release',
      projectId: 'project-release',
      title: 'Queued workflow task',
      status: 'queued',
      plan: [{ step: 'queue_workflow', status: 'queued' }],
      capabilityIds: ['workflow:workflow-daily-market'],
      requiredPermissions: ['run_workflow'],
      confirmationStatus: 'not_required',
      progress: 0,
      errorMessage: null,
      resultSummary: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    },
    {
      id: 'task-release-approval',
      sessionId: 'session-release-1',
      workspaceId: 'workspace-release',
      projectId: 'project-release',
      title: 'Derek trade approval',
      status: 'awaiting_confirmation',
      plan: [{ step: 'request_confirmation', status: 'pending' }],
      capabilityIds: ['app:derek'],
      requiredPermissions: ['trade:execute', 'vault:use'],
      confirmationStatus: 'pending',
      progress: 20,
      errorMessage: null,
      resultSummary: 'Critical action paused before execution.',
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    },
    {
      id: 'task-release-completed',
      sessionId: 'session-release-1',
      workspaceId: 'workspace-release',
      projectId: 'project-release',
      title: 'Release report task',
      status: 'completed',
      plan: [{ step: 'save_report', status: 'completed' }],
      capabilityIds: ['skill:research-skill', 'app:report-builder', 'project:project-release'],
      requiredPermissions: ['project:write'],
      confirmationStatus: 'not_required',
      progress: 100,
      errorMessage: null,
      resultSummary: 'Report saved to Launch QA Project.',
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    },
    {
      id: 'task-release-failed',
      sessionId: 'session-release-1',
      workspaceId: 'workspace-release',
      projectId: 'project-release',
      title: 'GitHub issue sync',
      status: 'needs_configuration',
      plan: [{ step: 'connect_mcp', status: 'needs_configuration' }],
      capabilityIds: ['mcp:github'],
      requiredPermissions: ['mcp:execute'],
      confirmationStatus: 'not_required',
      progress: 0,
      errorMessage: 'GitHub MCP requires authentication.',
      resultSummary: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    },
    {
      id: 'task-release-cancelled',
      sessionId: 'session-release-1',
      workspaceId: 'workspace-release',
      projectId: 'project-release',
      title: 'Cancelled browser automation',
      status: 'cancelled',
      plan: [{ step: 'computer_use', status: 'cancelled' }],
      capabilityIds: ['system:computer-use'],
      requiredPermissions: ['computer:use'],
      confirmationStatus: 'not_required',
      progress: 100,
      errorMessage: null,
      resultSummary: 'Browser automation unavailable; task cancelled.',
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    },
  ];
  const confirmations: QaConfirmation[] = [{
    id: 'confirm-derek',
    taskId: 'task-release-approval',
    actionName: 'Use Derek to execute a trade',
    riskLevel: 'critical',
    status: 'pending',
    dataSummary: 'Trade details and wallet secret scope will be sent server-side only.',
    secretScopes: ['wallet:trade'],
    expectedResult: 'Trade execution after double approval.',
    approvalCount: 0,
    requiredApprovals: 2,
  }];

  await page.route('**/api/session**', async route => {
    if (route.request().method() === 'DELETE') {
      await fulfillJson(route, { ok: true });
      return;
    }
    await fulfillJson(route, session);
  });
  await page.route('**/api/shell/bootstrap', async route => fulfillJson(route, {
    ...shellPayload,
    notifications: { unread: notifications.filter(item => item.status === 'unread').length },
  }));
  await page.route('**/api/studio/bootstrap**', async route => {
    const requestedSession = new URL(route.request().url()).searchParams.get('session');
    const lastMessage = streamBodies.at(-1)?.message;
    const messages = !requestedSession && streamBodies.length === 0 ? [] : [
      { id: 'm-user', role: 'user', content: lastMessage ?? 'Release request', createdAt: now },
      {
        id: 'm-assistant',
        role: 'assistant',
        content: approvalBodies.length > 0
          ? 'First approval recorded. Derek remains gated until the second approval.'
          : lastMessage === 'Use Derek to execute a trade.'
            ? 'Critical trade requires double confirmation before any Derek execution.'
            : 'Release report created from the uploaded market notes, Research Skill, Report Builder, Daily Market Report workflow, and Universal MCP metadata.',
        createdAt: now,
      },
    ];
    await fulfillJson(route, {
      ...baseBootstrap,
      session: requestedSession || streamBodies.length > 0 ? studioSession : null,
      messages,
    });
  });
  await page.route('**/api/studio/sessions', async route => fulfillJson(route, { session: studioSession }, 201));
  await page.route('**/api/studio/sessions/session-release-1', async route => fulfillJson(route, {
    session: studioSession,
    messages: [
      { id: 'm-user', role: 'user', content: streamBodies.at(-1)?.message ?? 'Release request', createdAt: now },
      {
        id: 'm-assistant',
        role: 'assistant',
        content: streamBodies.at(-1)?.message === 'Use Derek to execute a trade.'
          ? 'Critical trade requires double confirmation before any Derek execution.'
          : 'Release report created from the uploaded market notes, Research Skill, Report Builder, Daily Market Report workflow, and Universal MCP metadata.',
        createdAt: now,
      },
    ],
    events: [{ id: 'event-1', type: 'task_completed', createdAt: now, payload: { taskId: 'task-release-completed' } }],
    lineage: { parent: null, children: [] },
  }));
  await page.route('**/api/files**', async route => {
    if (route.request().method() === 'POST') {
      uploaded = true;
      await fulfillJson(route, { entry: { id: 'file-market-notes', path: 'uploads/market-notes.txt', contentType: 'text/plain' } }, 201);
      return;
    }
    await fulfillJson(route, { entries: uploaded ? [{ id: 'file-market-notes', path: 'uploads/market-notes.txt', visibility: 'private', metadata: { originalName: 'market-notes.txt' }, updatedAt: now }] : [] });
  });
  await page.route('**/api/studio/intent/stream', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    streamBodies.push(body);
    if (body.message === 'Use Derek to execute a trade.') {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse([
          ['execution', { executionId: 'exec-derek', status: 'RUNNING' }],
          ['status', { text: 'Checking risk policy' }],
          ['delta', { text: 'Critical trade requires double confirmation before any Derek execution.' }],
          ['approval', { confirmToken: 'confirm-derek-token', reply: 'Critical trade requires double confirmation before any Derek execution.' }],
          ['done', { executionId: 'exec-derek', status: 'PAUSED' }],
        ]),
      });
      return;
    }
    expect(body).toMatchObject({
      sessionId: 'session-release-1',
      workspaceId: 'workspace-release',
      projectId: 'project-release',
    });
    expect(body.attachments).toEqual([expect.objectContaining({ id: 'file-market-notes', name: 'market-notes.txt' })]);
    expect(body.invocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'skill', ref: 'research-skill' }),
      expect.objectContaining({ kind: 'app', ref: 'report-builder' }),
      expect.objectContaining({ kind: 'workflow', ref: 'workflow-daily-market' }),
      expect.objectContaining({ kind: 'mcp', ref: 'universal-mcp' }),
    ]));
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sse([
        ['execution', { executionId: 'exec-release', status: 'RUNNING' }],
        ['status', { text: 'Executing release task' }],
        ['delta', { text: 'Release report created from uploaded notes and registered capabilities.' }],
        ['done', { executionId: 'exec-release', status: 'COMPLETED' }],
      ]),
    });
  });
  await page.route('**/api/studio/intent', async route => {
    approvalBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await fulfillJson(route, { kind: 'approval_recorded', reply: 'First approval recorded. Derek remains gated until the second approval.' });
  });
  await page.route('**/api/executions**', async route => fulfillJson(route, {
    executions: [{ id: 'exec-release', title: 'Release report task', status: 'COMPLETED', sourceType: 'super_agent', sourceId: 'session-release-1', sessionId: 'session-release-1', failure: null, output: {}, durationMs: 820, estimatedCost: 0, updatedAt: now, createdAt: now }],
  }));
  await page.route('**/api/recovery**', async route => fulfillJson(route, { executions: [] }));
  await page.route('**/api/tasks/*/cancel', async route => {
    const id = route.request().url().split('/api/tasks/')[1].split('/')[0];
    const task = tasks.find(item => item.id === id);
    if (task) task.status = 'cancelled';
    await fulfillJson(route, { task });
  });
  await page.route('**/api/tasks/*/retry', async route => {
    const id = route.request().url().split('/api/tasks/')[1].split('/')[0];
    const task = tasks.find(item => item.id === id);
    if (task) {
      task.status = 'queued';
      task.progress = 0;
      task.errorMessage = null;
    }
    await fulfillJson(route, { task });
  });
  await page.route('**/api/tasks**', async route => fulfillJson(route, { tasks }));
  await page.route('**/api/confirmations/*/approve', async route => {
    confirmations[0].status = 'approved';
    confirmations[0].approvalCount = 1;
    tasks.find(item => item.id === 'task-release-approval')!.confirmationStatus = 'approved';
    await fulfillJson(route, { confirmation: confirmations[0] });
  });
  await page.route('**/api/confirmations/*/reject', async route => {
    confirmations[0].status = 'rejected';
    await fulfillJson(route, { confirmation: confirmations[0] });
  });
  await page.route('**/api/confirmations**', async route => fulfillJson(route, { confirmations }));
  await page.route('**/api/notifications**', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body.action === 'mark_all_read') notifications = notifications.map(item => ({ ...item, status: 'read', readAt: now }));
      if (typeof body.notificationId === 'string') {
        notifications = notifications.map(item => item.id === body.notificationId ? { ...item, status: String(body.status ?? 'read') as never, readAt: now } : item);
      }
    }
    await fulfillJson(route, { notifications });
  });

  return {
    get streamBodies() {
      return streamBodies;
    },
    get approvalBodies() {
      return approvalBodies;
    },
  };
}

test.describe('AgentOS V6.6.7 human release flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('agentos:theme', 'light');
      document.documentElement.dataset.theme = 'light';
    });
  });

  test('mobile Studio completes a Super AgentOS task using file, skill, app, workflow, MCP, project, and memory assets', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Human mobile chat path runs once.');
    await installReleaseMocks(page);

    await page.goto('/studio?mode=nl&workspace=workspace-release&project=project-release', { waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('Message Super AgentOS')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('No workspace is available for this chat');

    const fileInputs = page.locator('.nl-composer input[type="file"]');
    await expect(fileInputs).toHaveCount(2);
    await fileInputs.nth(0).setInputFiles({
      name: 'market-notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('AI agent release notes, FURGEPAD LP settings, and report requirements.'),
    });
    await expect(page.locator('.nl-composer-meta')).toContainText('market-notes.txt');

    await page.locator('.nl-composer-tools').getByRole('button', { name: 'Skills' }).click();
    await page.getByRole('menu', { name: 'skill resources' }).getByRole('button', { name: 'Research Skill' }).click();
    await page.locator('.nl-composer-tools').getByRole('button', { name: 'Apps' }).click();
    await page.getByRole('menu', { name: 'app resources' }).getByRole('button', { name: 'Report Builder' }).click();
    await page.locator('.nl-composer-tools').getByRole('button', { name: 'Workflow' }).click();
    await page.getByRole('menu', { name: 'workflow resources' }).getByRole('button', { name: 'Daily Market Report' }).click();
    await page.locator('.nl-composer-tools').getByRole('button', { name: 'MCP' }).click();
    await page.getByRole('menu', { name: 'mcp resources' }).getByRole('button', { name: 'Universal MCP' }).click();

    await page.getByLabel('Message Super AgentOS').fill('Research AI agents, create a report, save it to my project, and notify me when done.');
    await page.getByLabel('Send message').click();
    await expect(page.getByText('Release report created from the uploaded market notes')).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Open navigation').click();
    await expect(page.getByRole('navigation', { name: 'AgentOS modules' })).toBeVisible();
    await page.getByRole('navigation', { name: 'AgentOS modules' }).getByRole('link', { name: 'Tasks' }).click();
    await expect(page).toHaveURL(/\/tasks/);
    await expect(page.getByText('Release report task')).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.tasks-table').getByText('Release report task').click();
    await expect(page.locator('.tasks-detail')).toContainText('Report saved to Launch QA Project.');
  });

  test('critical Derek trade pauses for approval and does not execute automatically', async ({ page }) => {
    const state = await installReleaseMocks(page);

    await page.goto('/studio?mode=nl&workspace=workspace-release&project=project-release', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Message Super AgentOS').fill('Use Derek to execute a trade.');
    await page.getByLabel('Send message').click();

    await expect(page.locator('.nl-approval-row')).toContainText('Critical trade requires double confirmation', { timeout: 15_000 });
    expect(state.approvalBodies).toHaveLength(0);
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('First approval recorded')).toBeVisible();
    expect(state.approvalBodies).toEqual([expect.objectContaining({
      approval: true,
      confirmToken: 'confirm-derek-token',
      sessionId: 'session-release-1',
    })]);
  });

  test('Task Center persists statuses after reload and wires cancel, retry, approval, and notifications', async ({ page }) => {
    await installReleaseMocks(page);

    await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.tasks-table')).toContainText('Live research task');
    await expect(page.locator('.tasks-table')).toContainText('Derek trade approval');
    await expect(page.locator('.tasks-table')).toContainText('GitHub issue sync');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.tasks-table')).toContainText('Release report task');
    await expect(page.locator('.tasks-table')).toContainText('Cancelled browser automation');

    await page.locator('.tasks-table').getByText('Live research task').click();
    await page.locator('tr').filter({ hasText: 'Live research task' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('cancel requested for Live research task.')).toBeVisible();

    await page.locator('.tasks-table').getByText('GitHub issue sync').click();
    await page.locator('tr').filter({ hasText: 'GitHub issue sync' }).getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('retry requested for GitHub issue sync.')).toBeVisible();

    await page.locator('.tasks-table').getByText('Derek trade approval').click();
    await expect(page.getByText('wallet:trade')).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('approve recorded for Use Derek to execute a trade.')).toBeVisible();

    await page.getByLabel('2 unread notifications').click();
    await expect(page.getByLabel('Notification drawer')).toBeVisible();
    await page.getByRole('button', { name: 'Mark All Read' }).click();
    await expect(page.getByLabel('Notification drawer')).toContainText('0 unread');
  });
});
