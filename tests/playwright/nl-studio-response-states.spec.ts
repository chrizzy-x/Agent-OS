import { expect, test } from '@playwright/test';

const now = '2026-07-09T00:00:00.000Z';

function studioPayload(messages: Array<Record<string, unknown>>) {
  return {
    session: {
      id: 'session-response',
      workspaceId: 'workspace-response',
      projectId: 'project-response',
      title: 'Response QA',
      visibility: 'private',
      updatedAt: now,
    },
    sessions: [],
    lineage: { parent: null, children: [] },
    messages,
    events: [],
    workspaces: [{ id: 'workspace-response', name: 'Response Workspace' }],
    projects: [{ id: 'project-response', workspaceId: 'workspace-response', name: 'Response Project', description: null, status: 'active' }],
    currentProject: { id: 'project-response', workspaceId: 'workspace-response', name: 'Response Project', description: null, status: 'active' },
    workflows: [],
    vaultSecrets: [],
    installedSkills: [{ id: 'skill-summary', name: 'Summarizer', slug: 'summarizer', description: 'Summarizes workspace context' }],
    installedApps: [],
    superAgent: { id: 'super-response', name: 'Super AgentOS', instructions: '', status: 'active' },
    subagents: [],
    memoryEntries: [],
    fileEntries: [],
    fileTree: [],
  };
}

function sse(events: Array<{ event: string; data: Record<string, unknown> }>) {
  return events.map(item => `event: ${item.event}\ndata: ${JSON.stringify(item.data)}\n\n`).join('');
}

test.describe('NL Studio response states', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/session**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          session: {
            agentName: 'Response QA',
            plan: 'pro',
            planLabel: 'Pro',
            accountType: 'retail',
            capabilities: [],
            expiresAt: '2030-01-01T00:00:00.000Z',
          },
        }),
      });
    });
    await page.route('**/api/shell/bootstrap', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          workspaces: [{ id: 'workspace-response', name: 'Response Workspace', slug: 'response', plan: 'pro' }],
          sessions: [],
          projects: [{ id: 'project-response', workspaceId: 'workspace-response', name: 'Response Project', status: 'active', pinned: false, updatedAt: now }],
          notifications: { unread: 0 },
          agents: { connected: 0 },
        }),
      });
    });
    await page.route('**/api/executions**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ executions: [] }) });
    });
    await page.route('**/api/recovery**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ executions: [] }) });
    });
    await page.route('**/api/notifications**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notifications: [] }) });
    });
  });

  test('shows compact execution status while a selected skill is running', async ({ page }) => {
    await page.route('**/api/studio/bootstrap**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(studioPayload([])) });
    });
    await page.route('**/api/studio/sessions/session-response', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(studioPayload([
          { id: 'message-user', role: 'user', content: 'Summarize this.', createdAt: now, state: 'complete' },
          { id: 'message-assistant', role: 'assistant', content: 'Skill completed.', createdAt: now, state: 'complete' },
        ])),
      });
    });

    let releaseStream: () => void = () => undefined;
    const streamGate = new Promise<void>(resolve => {
      releaseStream = resolve;
    });
    await page.route('**/api/studio/intent/stream', async route => {
      await streamGate;
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream; charset=utf-8',
        body: sse([
          { event: 'execution', data: { executionId: 'execution-response', status: 'RUNNING' } },
          { event: 'status', data: { text: 'Running selected skill...' } },
          { event: 'delta', data: { text: 'Skill completed.' } },
          { event: 'done', data: { executionId: 'execution-response', status: 'COMPLETED' } },
        ]),
      });
    });

    await page.goto('/studio?mode=nl&session=session-response', { waitUntil: 'domcontentloaded' });
    await page.locator('.nl-composer-tools').getByRole('button', { name: 'Skills' }).click();
    await page.getByRole('menu', { name: 'skill resources' }).getByRole('button', { name: 'Summarizer' }).click();
    await page.getByLabel('Message Super AgentOS').fill('Summarize this.');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(page.locator('.nl-execution-card')).toBeVisible();
    await expect(page.locator('.nl-execution-card')).toContainText('Preparing Super AgentOS execution');
    await expect(page.locator('.nl-execution-card')).toContainText('skill: Summarizer');
    await expect(page.locator('.nl-execution-card').getByRole('button', { name: 'Stop' })).toBeVisible();

    releaseStream();
    await expect(page.getByText('Skill completed.')).toBeVisible();
  });

  test('shows failed state and shields internal JSON payloads', async ({ page }) => {
    const messages = [
      { id: 'message-user', role: 'user', content: 'Show raw internals.', createdAt: now, state: 'complete' },
      { id: 'message-assistant', role: 'assistant', content: '{"executionId":"secret","stack":"provider stack"}', createdAt: now, state: 'error' },
    ];
    await page.route('**/api/studio/bootstrap**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(studioPayload(messages)) });
    });

    await page.goto('/studio?mode=nl&session=session-response', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Super AgentOS returned a structured execution result. Open Context logs for details.')).toBeVisible();
    await expect(page.getByText('Response failed')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();

    const assistantText = await page.locator('.nl-message.assistant').innerText();
    expect(assistantText).not.toContain('executionId');
    expect(assistantText).not.toContain('provider stack');
  });
});
