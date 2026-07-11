import { expect, test, type Page, type Route } from '@playwright/test';

const now = '2026-07-11T00:00:00.000Z';

type SavedWorkflow = {
  id: string;
  name: string;
  summary: string | null;
  status: string;
  schedule: string | null;
  project_id: string | null;
  steps: Array<Record<string, unknown>>;
  graph_state: { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> };
  code_state: string;
  canonical_doc: Record<string, unknown>;
};

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockWorkflowBuilder(page: Page) {
  const workflows: SavedWorkflow[] = [];
  const lastPayloads: Array<Record<string, unknown>> = [];

  await page.addInitScript(() => {
    window.localStorage.setItem('agentos.shell.leftCollapsed', 'false');
    window.localStorage.setItem('agentos.shell.rightCollapsed', 'false');
  });

  await page.route(/\/api\/session(?:\/refresh)?(?:\?|$)/, async route => {
    await fulfillJson(route, {
      authenticated: true,
      session: {
        agentName: 'Workflow QA',
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
        agentName: 'Workflow QA',
        plan: 'pro',
        planLabel: 'Pro',
        accountType: 'retail',
        capabilities: [],
        expiresAt: '2030-01-01T00:00:00.000Z',
      },
    });
  });
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
    projects: [{ id: 'project-flow', workspaceId: 'workspace-flow', name: 'Workflow Project', status: 'active', pinned: false, updatedAt: now }],
    notifications: { unread: 0 },
    agents: { connected: 0 },
  }));
  await page.route('**/api/executions**', async route => fulfillJson(route, { executions: [] }));
  await page.route('**/api/recovery**', async route => fulfillJson(route, { executions: [] }));
  await page.route('**/api/notifications**', async route => fulfillJson(route, { notifications: [] }));
  await page.route('**/api/studio/bootstrap**', async route => {
    await fulfillJson(route, {
      mode: 'workflow',
      session: {
        id: 'session-flow',
        workspaceId: 'workspace-flow',
        projectId: 'project-flow',
        title: 'Workflow Builder',
        visibility: 'private',
        updatedAt: now,
      },
      sessions: [],
      messages: [],
      events: [],
      lineage: { parent: null, children: [] },
      workspaces: [{ id: 'workspace-flow', name: 'Workflow Workspace' }],
      projects: [{ id: 'project-flow', workspaceId: 'workspace-flow', name: 'Workflow Project', description: null, status: 'active' }],
      currentProject: { id: 'project-flow', workspaceId: 'workspace-flow', name: 'Workflow Project', description: null, status: 'active' },
      workflows,
      vaultSecrets: [{ id: 'secret-openai', name: 'OpenAI API key', status: 'active' }],
      installedSkills: [{ id: 'skill-research', name: 'Research Skill', slug: 'research-skill', description: 'Research capability' }],
      installedApps: [{ id: 'app-brief', name: 'Brief Builder', slug: 'brief-builder', description: 'Briefing app' }],
      subagents: [{ id: 'subagent-ops', workspaceId: 'workspace-flow', projectId: 'project-flow', name: 'Ops Subagent', description: null, visibility: 'private', exposedCapabilities: [], status: 'active', updatedAt: now }],
      superAgent: null,
      fileTree: [],
      memoryEntries: [],
      workspaceAssets: [],
    });
  });
  await page.route('**/api/agent/workflows', async route => {
    if (route.request().method() !== 'POST') {
      await fulfillJson(route, { workflows });
      return;
    }
    const body = await route.request().postDataJSON() as Record<string, unknown>;
    lastPayloads.push(body);
    const graph = body.graph as SavedWorkflow['graph_state'];
    const workflow: SavedWorkflow = {
      id: 'workflow-created',
      name: String(body.name),
      summary: typeof body.summary === 'string' ? body.summary : null,
      status: 'active',
      schedule: null,
      project_id: typeof body.projectId === 'string' ? body.projectId : null,
      steps: (graph.nodes ?? []).filter(node => node.type !== 'trigger' && node.type !== 'output'),
      graph_state: graph,
      code_state: '{}',
      canonical_doc: { updatedFrom: 'visual', graph },
    };
    workflows.unshift(workflow);
    await fulfillJson(route, { workflow }, 201);
  });

  return { lastPayloads };
}

test.describe('Workflow Builder core', () => {
  test('creates and configures a real workflow graph', async ({ page }) => {
    const state = await mockWorkflowBuilder(page);
    await page.goto('/studio?mode=workflow', { waitUntil: 'domcontentloaded' });

    await expect(page.getByLabel('Workflow name')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'MCP' })).toBeDisabled();

    await page.getByLabel('Workflow name').fill('Phase 18 launch workflow');
    await page.getByLabel('Workflow summary').fill('Build a reusable launch workflow.');
    await page.getByRole('button', { name: 'Skill' }).click();
    await page.getByTestId('workflow-skill-resource').selectOption('skill-research');
    await page.getByTestId('workflow-node-input').fill('Research the launch facts.');
    await page.getByTestId('workflow-node-output').fill('Research notes.');

    await page.getByRole('button', { name: 'Vault' }).click();
    await page.getByTestId('workflow-vault-resource').selectOption('secret-openai');
    await page.getByTestId('workflow-node-input').fill('Use provider credentials only at runtime.');

    await page.getByRole('button', { name: 'Save workflow' }).click();
    await expect(page.getByRole('link', { name: 'Open details' })).toHaveAttribute('href', /workflow-created/);
    expect(state.lastPayloads).toHaveLength(1);
    expect(state.lastPayloads[0].projectId).toBe('project-flow');
    expect(((state.lastPayloads[0].graph as { nodes: unknown[] }).nodes).length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(state.lastPayloads[0])).not.toContain('sk-');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
