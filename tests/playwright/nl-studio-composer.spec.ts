import { expect, test, type Page } from '@playwright/test';

const now = '2026-07-09T00:00:00.000Z';

function studioPayload() {
  return {
    session: {
      id: 'session-composer',
      workspaceId: 'workspace-composer',
      projectId: 'project-alpha',
      title: 'Composer QA',
      visibility: 'private',
      updatedAt: now,
    },
    sessions: [],
    lineage: { parent: null, children: [] },
    messages: [
      { id: 'message-user', role: 'user', content: 'Prepare the workspace.', createdAt: now, state: 'complete' },
      { id: 'message-assistant', role: 'assistant', content: 'Ready.', createdAt: now, state: 'complete' },
    ],
    events: [],
    workspaces: [{ id: 'workspace-composer', name: 'Composer Workspace' }],
    projects: [
      { id: 'project-alpha', workspaceId: 'workspace-composer', name: 'Alpha Project', description: null, status: 'active' },
      { id: 'project-beta', workspaceId: 'workspace-composer', name: 'Beta Project', description: null, status: 'active' },
    ],
    currentProject: { id: 'project-alpha', workspaceId: 'workspace-composer', name: 'Alpha Project', description: null, status: 'active' },
    workflows: [],
    vaultSecrets: [],
    intelligenceConnections: [
      {
        id: 'connection-openai',
        ownerAgentId: 'agent-composer',
        workspaceId: 'workspace-composer',
        vendor: 'openai',
        displayName: 'Primary OpenAI',
        status: 'active',
        selectedModelId: 'gpt-5',
        availableModels: ['gpt-5', 'gpt-5-mini'],
        capabilities: {},
        health: {},
        lastValidatedAt: now,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'connection-anthropic',
        ownerAgentId: 'agent-composer',
        workspaceId: 'workspace-composer',
        vendor: 'anthropic',
        displayName: 'Research Anthropic',
        status: 'active',
        selectedModelId: 'claude-sonnet-4-6',
        availableModels: ['claude-sonnet-4-6'],
        capabilities: {},
        health: {},
        lastValidatedAt: now,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    sessionIntelligenceSelection: {
      mode: 'native',
      connectionId: null,
      modelId: null,
      consensusConfigurationId: null,
      selectionSource: 'session',
    },
    installedSkills: [],
    installedApps: [],
    superAgent: { id: 'super-composer', name: 'Super AgentOS', instructions: '', status: 'active' },
    subagents: [
      { id: 'subagent-research', workspaceId: 'workspace-composer', projectId: 'project-alpha', name: 'Research Operator', description: 'Private research operator', visibility: 'private', exposedCapabilities: [], status: 'active', updatedAt: now },
    ],
    memoryEntries: [],
    fileEntries: [],
    fileTree: [],
  };
}

async function gotoAndExpect(page: Page, url: string, ready: ReturnType<Page['locator']>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (await ready.isVisible().catch(() => false)) return;
    await page.waitForTimeout(250);
  }
  await expect(ready).toBeVisible({ timeout: 60_000 });
}

test.describe('NL Studio composer', () => {
  test.setTimeout(150_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('agentos.shell.leftCollapsed', 'false');
      window.localStorage.setItem('agentos.shell.rightCollapsed', 'false');
    });
    await page.route(/\/api\/session(?:\/refresh)?(?:\?|$)/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          session: {
            agentName: 'Composer QA',
            plan: 'pro',
            planLabel: 'Pro',
            accountType: 'retail',
            capabilities: [],
            expiresAt: '2030-01-01T00:00:00.000Z',
          },
        }),
      });
    });
    await page.route('**/api/session**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          session: {
            agentName: 'Composer QA',
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
          workspaces: [{ id: 'workspace-composer', name: 'Composer Workspace', slug: 'composer', plan: 'pro' }],
          sessions: [],
          projects: [
            { id: 'project-alpha', workspaceId: 'workspace-composer', name: 'Alpha Project', status: 'active', pinned: false, updatedAt: now },
            { id: 'project-beta', workspaceId: 'workspace-composer', name: 'Beta Project', status: 'active', pinned: false, updatedAt: now },
          ],
          notifications: { unread: 0 },
          agents: { connected: 0 },
        }),
      });
    });
    await page.route('**/api/studio/bootstrap**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(studioPayload()) });
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

  test('selects Prime Agents, projects, and context from the composer', async ({ page }) => {
    await gotoAndExpect(page, '/studio?mode=nl&session=session-composer', page.getByText('Project: Alpha Project'));
    await page.locator('.nl-composer-tools').getByRole('button', { name: 'Prime Agents' }).click();
    await page.getByRole('menu', { name: 'subagent resources' }).getByRole('button', { name: 'Research Operator' }).click();
    await expect(page.getByRole('button', { name: 'Prime Agent: Research Operator x' })).toBeVisible();

    await page.locator('.nl-composer-tools').getByRole('button', { name: 'Project' }).click();
    await page.getByRole('menu', { name: 'project resources' }).getByRole('button', { name: 'Beta Project' }).click();
    await expect(page).toHaveURL(/project=project-beta/);

    await page.locator('.nl-composer-tools').getByRole('button', { name: 'Context' }).click();
    await page.getByRole('menu', { name: 'context resources' }).getByRole('button', { name: 'Memory' }).click();
    await expect(page.getByRole('heading', { name: 'Memory' })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test('shows honest empty states for unavailable composer resources', async ({ page }) => {
    await gotoAndExpect(page, '/studio?mode=nl&session=session-composer', page.getByText('Project: Alpha Project'));

    await page.locator('.nl-composer-tools').getByRole('button', { name: 'Skills' }).click();
    await expect(page.getByRole('menu', { name: 'skill resources' })).toContainText('No connected skill resources.');

    await page.locator('.nl-composer-tools').getByRole('button', { name: 'Apps' }).click();
    await expect(page.getByRole('menu', { name: 'app resources' })).toContainText('No connected app resources.');
  });

  test('selects exact connected models and clears one-message override after send', async ({ page }) => {
    const patchBodies: Array<Record<string, unknown>> = [];
    let streamBody: Record<string, unknown> | null = null;

    await page.route('**/api/studio/sessions/session-composer', async route => {
      const request = route.request();
      if (request.method() === 'PATCH') {
        const body = request.postDataJSON() as Record<string, unknown>;
        patchBodies.push(body);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            session: studioPayload().session,
            intelligenceSelection: body.intelligenceSelection,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...studioPayload(),
          intelligenceSelection: patchBodies.at(-1)?.intelligenceSelection ?? studioPayload().sessionIntelligenceSelection,
        }),
      });
    });
    await page.route('**/api/studio/intent/stream', async route => {
      streamBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          'event: execution',
          'data: {"executionId":"execution-1","status":"RUNNING"}',
          '',
          'event: delta',
          'data: {"text":"Done."}',
          '',
          'event: done',
          'data: {"executionId":"execution-1","status":"COMPLETED"}',
          '',
        ].join('\n'),
      });
    });

    await gotoAndExpect(page, '/studio?mode=nl&session=session-composer', page.getByText('Project: Alpha Project'));
    await page.getByRole('button', { name: 'Choose intelligence' }).click();
    await expect(page.getByRole('menu', { name: 'Intelligence options' })).toContainText('Native Super AgentOS');
    await expect(page.getByRole('menu', { name: 'Intelligence options' })).toContainText('gpt-5');
    await expect(page.getByRole('menu', { name: 'Intelligence options' })).toContainText('gpt-5-mini');
    await expect(page.getByRole('menu', { name: 'Intelligence options' })).not.toContainText('Orchestrator');

    await page.getByRole('menuitemradio', { name: /gpt-5-mini/ }).click();
    await expect(page.locator('.nl-intelligence-trigger')).toContainText('OpenAI / gpt-5-mini');
    expect(JSON.stringify(patchBodies.at(-1))).toContain('"modelId":"gpt-5-mini"');
    expect(JSON.stringify(patchBodies.at(-1))).not.toContain('executionTargetId');

    await page.getByRole('button', { name: 'Choose intelligence' }).click();
    await page.locator('.nl-intelligence-option').filter({ hasText: 'claude-sonnet-4-6' }).getByRole('button', { name: 'Once' }).click();
    await expect(page.locator('.nl-intelligence-trigger')).toContainText('Anthropic / claude-sonnet-4-6');
    await expect(page.locator('.nl-intelligence-trigger')).toContainText('Once');

    await page.getByLabel('Message Super AgentOS').fill('Summarize the workspace');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect.poll(() => streamBody?.intelligenceSelection ? 'sent' : 'pending').toBe('sent');
    await expect(page.locator('.nl-intelligence-trigger')).toContainText('OpenAI / gpt-5-mini');
    expect(streamBody?.intelligenceSelection).toMatchObject({ connectionId: 'connection-anthropic', modelId: 'claude-sonnet-4-6' });
    expect(streamBody?.sessionIntelligenceSelection).toMatchObject({ connectionId: 'connection-openai', modelId: 'gpt-5-mini' });
    expect(JSON.stringify(streamBody)).not.toContain('executionTargetId');
  });

  test('uses bottom-sheet selector behavior on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoAndExpect(page, '/studio?mode=nl&session=session-composer', page.getByText('Project: Alpha Project'));
    await page.getByRole('button', { name: 'Choose intelligence' }).click();
    const metrics = await page.locator('.nl-intelligence-menu').evaluate(element => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return { position: style.position, bottomGap: Math.round(window.innerHeight - rect.bottom) };
    });

    expect(metrics.position).toBe('fixed');
    expect(metrics.bottomGap).toBeLessThanOrEqual(2);
  });
});
