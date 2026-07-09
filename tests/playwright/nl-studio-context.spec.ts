import { expect, test, type Page, type Route } from '@playwright/test';

const now = '2026-07-09T00:00:00.000Z';

type StudioSession = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  title: string;
  visibility: 'private' | 'workspace' | 'public';
  linkedSubagentId: string | null;
  linkedWorkflowId: string | null;
  linkedAppId: string | null;
  linkedFilePaths: string[];
  linkedMemoryRefs: string[];
  updatedAt: string;
};

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function studioPayload(session: StudioSession) {
  return {
    session,
    sessions: [session],
    lineage: { parent: null, children: [] },
    messages: [
      { id: 'message-user', role: 'user', content: 'Use project context without leaking secrets.', createdAt: now, state: 'complete' },
      { id: 'message-assistant', role: 'assistant', content: 'Context is separated by source and Vault values stay hidden.', createdAt: now, state: 'complete' },
    ],
    events: [{ id: 'event-context', type: 'workflow_log', createdAt: now, payload: { status: 'completed', action: 'summarize', token: 'secret-event-token' } }],
    workspaces: [{ id: 'workspace-context', name: 'Context Workspace' }],
    projects: [{ id: 'project-context', workspaceId: 'workspace-context', name: 'Context Project', description: 'Context boundary QA', status: 'active' }],
    currentProject: { id: 'project-context', workspaceId: 'workspace-context', name: 'Context Project', description: 'Context boundary QA', status: 'active' },
    workflows: [{ id: 'workflow-report', name: 'Report Workflow', summary: 'Reusable report workflow', status: 'active', visibility: 'private' }],
    vaultSecrets: [{ id: 'secret-openai', name: 'OpenAI API', status: 'available' }],
    installedSkills: [{ skill: { id: 'skill-research', name: 'Research Skill', slug: 'research-skill', description: 'Research topics with citations.' } }],
    installedApps: [{ id: 'app-report', name: 'Report Builder', slug: 'report-builder', description: 'Create project reports.' }],
    superAgent: { id: 'super-context', name: 'Super AgentOS', instructions: '', status: 'active' },
    subagents: [{ id: 'subagent-private', workspaceId: 'workspace-context', projectId: 'project-context', name: 'Private Operator', description: 'Private project operator', visibility: 'private', exposedCapabilities: ['research'], status: 'active', updatedAt: now }],
    memoryEntries: [{ id: 'memory-secret', key: 'release-preference', content: 'Use concise reports; api_key=sk-phase16secret1234567890', visibility: 'private', namespaceType: 'workspace', namespaceId: 'workspace-context', updatedAt: now }],
    fileEntries: [{ id: 'file-notes', path: 'uploads/context-notes.txt', visibility: 'private', metadata: { kind: 'file' }, updatedAt: now }],
    fileTree: [],
  };
}

async function mockStudio(page: Page) {
  let session: StudioSession = {
    id: 'session-context',
    workspaceId: 'workspace-context',
    projectId: 'project-context',
    title: 'Context QA',
    visibility: 'private',
    linkedSubagentId: 'subagent-private',
    linkedWorkflowId: 'workflow-report',
    linkedAppId: 'app-report',
    linkedFilePaths: ['uploads/context-notes.txt'],
    linkedMemoryRefs: ['memory-secret'],
    updatedAt: now,
  };

  await page.addInitScript(() => {
    window.localStorage.setItem('agentos.shell.leftCollapsed', 'false');
    window.localStorage.setItem('agentos.shell.rightCollapsed', 'false');
  });
  await page.route(/\/api\/session(?:\/refresh)?(?:\?|$)/, async route => {
    await fulfillJson(route, {
      authenticated: true,
      session: {
        agentName: 'Context QA',
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
        agentName: 'Context QA',
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
      workspaces: [{ id: 'workspace-context', name: 'Context Workspace', slug: 'context', plan: 'pro' }],
      sessions: [{ ...session, status: 'active' }],
      projects: [{ id: 'project-context', workspaceId: 'workspace-context', name: 'Context Project', status: 'active', pinned: false, updatedAt: now }],
      notifications: { unread: 1 },
      agents: { connected: 0 },
    });
  });
  await page.route('**/api/studio/bootstrap**', async route => {
    await fulfillJson(route, studioPayload(session));
  });
  await page.route('**/api/studio/sessions/*', async route => {
    if (route.request().method() === 'PATCH') {
      const body = await route.request().postDataJSON() as Partial<StudioSession>;
      session = {
        ...session,
        linkedSubagentId: body.linkedSubagentId === undefined ? session.linkedSubagentId : body.linkedSubagentId ?? null,
        linkedWorkflowId: body.linkedWorkflowId === undefined ? session.linkedWorkflowId : body.linkedWorkflowId ?? null,
        linkedAppId: body.linkedAppId === undefined ? session.linkedAppId : body.linkedAppId ?? null,
        linkedFilePaths: Array.isArray(body.linkedFilePaths) ? body.linkedFilePaths : session.linkedFilePaths,
        linkedMemoryRefs: Array.isArray(body.linkedMemoryRefs) ? body.linkedMemoryRefs : session.linkedMemoryRefs,
      };
      await fulfillJson(route, { session });
      return;
    }
    await fulfillJson(route, { session, messages: studioPayload(session).messages, events: studioPayload(session).events, lineage: { parent: null, children: [] } });
  });
  await page.route('**/api/executions**', async route => {
    await fulfillJson(route, {
      executions: [{ id: 'exec-app', title: 'Report Builder output', status: 'COMPLETED', sourceType: 'app', sourceId: 'app-report', sessionId: 'session-context', failure: null, output: { hidden: true }, durationMs: 40, estimatedCost: 0, updatedAt: now, createdAt: now }],
    });
  });
  await page.route('**/api/recovery**', async route => {
    await fulfillJson(route, { executions: [] });
  });
  await page.route('**/api/notifications**', async route => {
    await fulfillJson(route, {
      notifications: [{ id: 'vault-needed', type: 'vault_permission', title: 'Vault permission required', body: 'A secret is needed for this action.', status: 'unread', executionId: null, createdAt: now }],
    });
  });
}

async function gotoStudio(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto('/studio?mode=nl&session=session-context', { waitUntil: 'domcontentloaded' });
    if (await page.getByLabel('Message Super AgentOS').isVisible().catch(() => false)) return;
    await page.waitForTimeout(250);
  }
  await expect(page.getByLabel('Message Super AgentOS')).toBeVisible();
}

async function openContextOverview(page: Page) {
  const topbarContext = page.locator('.studio-switchbar-actions').getByRole('button', { name: 'Context' });
  if (await topbarContext.isVisible().catch(() => false)) {
    await topbarContext.click();
    return;
  }
  await page.locator('.nl-composer-tools').getByRole('button', { name: 'Context' }).click();
  await page.getByRole('menu', { name: 'context resources' }).getByRole('button', { name: 'Context overview' }).click();
}

test.describe('NL Studio context overview', () => {
  test.beforeEach(async ({ page }) => {
    await mockStudio(page);
  });

  test('separates context sources, redacts secrets, and detaches selected resources', async ({ page }) => {
    await gotoStudio(page);

    await page.locator('.nl-composer-tools').getByRole('button', { name: 'Skills' }).click();
    await page.getByRole('menu', { name: 'skill resources' }).getByRole('button', { name: 'Research Skill' }).click();
    await expect(page.getByRole('button', { name: 'skill: Research Skill x' })).toBeVisible();

    await openContextOverview(page);
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    for (const label of [
      'Project Context',
      'Session Context',
      'Attached Files And Assets',
      'Selected Resources',
      'Installed Assets',
      'Memory Context',
      'Workflow Logs And App Outputs',
      'Vault Permission State',
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    await expect(page.getByText('Vault permission needed now')).toBeVisible();
    await expect(page.getByText('Secret value hidden. Status: available.')).toBeVisible();
    await expect(page.locator('body')).toContainText('api_key: [redacted]');
    await expect(page.locator('body')).not.toContainText('sk-phase16secret');
    await expect(page.locator('body')).not.toContainText('secret-event-token');

    const selectedGroup = page.locator('.studio-context-source-group').filter({ hasText: 'Selected Resources' });
    await expect(selectedGroup).toContainText('Research Skill');
    await selectedGroup.getByRole('button', { name: 'Detach' }).click();
    await expect(page.getByRole('button', { name: 'skill: Research Skill x' })).toHaveCount(0);
    await expect(selectedGroup).toContainText('Nothing attached.');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
