import { expect, test, type Page, type Route } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const now = '2026-07-11T00:00:00.000Z';
const artifactDir = 'agentos-artifacts/phase22-code-studio';

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockCodeStudio(page: Page) {
  const sessionPayload = {
    authenticated: true,
    session: {
      agentName: 'Code QA',
      plan: 'pro',
      planLabel: 'Pro',
      accountType: 'retail',
      capabilities: [],
      expiresAt: '2030-01-01T00:00:00.000Z',
    },
  };
  const shellPayload = {
    workspaces: [{ id: 'workspace-code', name: 'Code Workspace', slug: 'code', plan: 'pro' }],
    sessions: [],
    projects: [{ id: 'project-code', workspaceId: 'workspace-code', name: 'AgentOS Repo', status: 'active', pinned: false, updatedAt: now }],
    notifications: { unread: 0 },
    agents: { connected: 0 },
  };
  const executionsPayload = {
    executions: [{
      id: 'execution-build',
      title: 'Build check',
      status: 'COMPLETED',
      sourceType: 'CODE_STUDIO',
      sourceId: 'project-code',
      sessionId: 'session-code',
      failure: null,
      output: null,
      durationMs: 1200,
      estimatedCost: 0,
      updatedAt: now,
      createdAt: now,
    }],
  };
  const studioPayload = {
    mode: 'code',
    session: {
      id: 'session-code',
      workspaceId: 'workspace-code',
      projectId: 'project-code',
      title: 'Code Studio QA',
      visibility: 'private',
      updatedAt: now,
    },
    sessions: [],
    messages: [],
    events: [{ id: 'event-1', type: 'build.check', createdAt: now, payload: { status: 'passed', command: 'npm run build' } }],
    lineage: { parent: null, children: [] },
    workspaces: [{ id: 'workspace-code', name: 'Code Workspace' }],
    projects: [{ id: 'project-code', workspaceId: 'workspace-code', name: 'AgentOS Repo', description: null, status: 'active' }],
    currentProject: { id: 'project-code', workspaceId: 'workspace-code', name: 'AgentOS Repo', description: null, status: 'active' },
    workflows: [{ id: 'workflow-release', name: 'Release Workflow', summary: 'Release gate', status: 'active', project_id: 'project-code' }],
    vaultSecrets: [],
    installedSkills: [{ id: 'skill-tests', name: 'Test Runner', slug: 'test-runner', description: 'Test planning' }],
    installedApps: [{ id: 'app-vercel', name: 'Vercel Deploy', slug: 'vercel-deploy', description: 'Deployment app' }],
    subagents: [],
    superAgent: { id: 'super-code', name: 'Super AgentOS', instructions: '', status: 'active' },
    memoryEntries: [],
    fileEntries: [{ id: 'file-1', path: 'package.json', visibility: 'private', metadata: {}, updatedAt: now }],
    fileTree: [{
      id: 'root',
      name: 'AgentOS',
      path: '/',
      kind: 'directory',
      children: [
        { id: 'file-package', name: 'package.json', path: 'package.json', kind: 'file', contentType: 'application/json' },
        { id: 'file-code', name: 'CodeStudioPanel.tsx', path: 'components/studio/CodeStudioPanel.tsx', kind: 'file', contentType: 'text/typescript' },
      ],
    }],
  };
  await page.addInitScript(({ sessionPayload, shellPayload, executionsPayload, studioPayload }) => {
    window.localStorage.setItem('agentos.shell.leftCollapsed', 'false');
    window.localStorage.setItem('agentos.shell.rightCollapsed', 'false');
    const originalFetch = window.fetch.bind(window);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
      const url = new URL(raw, window.location.origin);
      if (url.pathname === '/api/session' || url.pathname === '/api/session/refresh') return json(sessionPayload);
      if (url.pathname === '/api/shell/bootstrap') return json(shellPayload);
      if (url.pathname === '/api/studio/bootstrap') return json(studioPayload);
      if (url.pathname === '/api/executions') return json(executionsPayload);
      if (url.pathname === '/api/recovery') return json({ executions: [] });
      if (url.pathname === '/api/notifications') return json({ notifications: [] });
      if (url.pathname === '/api/panic') return json({ state: 'healthy', activeCount: 0, mcpDisabled: false, vaultDisabled: false, requireReauth: false });
      return originalFetch(input, init);
    };
  }, { sessionPayload, shellPayload, executionsPayload, studioPayload });
  await page.route(/\/api\/session(?:\/refresh)?(?:\?|$)/, route => fulfillJson(route, sessionPayload));
  await page.route('**/api/session**', route => fulfillJson(route, sessionPayload));
  await page.route('**/api/panic**', route => fulfillJson(route, {
    state: 'healthy',
    activeCount: 0,
    mcpDisabled: false,
    vaultDisabled: false,
    requireReauth: false,
  }));
  await page.route('**/api/shell/bootstrap**', route => fulfillJson(route, shellPayload));
  await page.route('**/api/executions**', route => fulfillJson(route, executionsPayload));
  await page.route('**/api/recovery**', route => fulfillJson(route, { executions: [] }));
  await page.route('**/api/notifications**', route => fulfillJson(route, { notifications: [] }));
  await page.route('**/api/studio/bootstrap**', route => fulfillJson(route, studioPayload));
}

test('Code Studio exposes developer task, build/test, deployment, and results controls', async ({ page }, testInfo) => {
  await mockCodeStudio(page);
  await page.goto('/studio?mode=code&session=session-code&project=project-code', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('Developer task', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Project: AgentOS Repo')).toBeVisible();
  await expect(page.getByText('Deployment readiness')).toBeVisible();
  await expect(page.getByText('Connected: Vercel Deploy')).toBeVisible();
  await expect(page.getByText('Build check')).toBeVisible();

  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.getByLabel('Developer task')).toHaveValue(/build readiness/);
  await expect(page.getByPlaceholder(/Enable terminal|Run a command/)).toHaveValue('npm run build');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: `${artifactDir}/${testInfo.project.name}-code-studio.png`, fullPage: true });
});
