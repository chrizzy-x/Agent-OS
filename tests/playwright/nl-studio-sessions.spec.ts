import { expect, test, type Route } from '@playwright/test';

const now = '2026-07-09T00:00:00.000Z';

type StudioSession = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  title: string;
  visibility: 'private' | 'workspace' | 'public';
  pinnedAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  updatedAt: string;
};

const projects = [
  { id: 'project-alpha', workspaceId: 'workspace-sessions', name: 'Alpha Project', description: null, status: 'active' },
  { id: 'project-beta', workspaceId: 'workspace-sessions', name: 'Beta Project', description: null, status: 'active' },
];

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function baseBootstrap(sessions: StudioSession[], requestedSessionId: string | null) {
  const activeSession = sessions.find(item => item.id === requestedSessionId) ?? null;
  const currentProject = projects.find(item => item.id === activeSession?.projectId) ?? projects[0];
  return {
    session: activeSession,
    sessions,
    lineage: { parent: null, children: [] },
    messages: activeSession ? [
      { id: 'message-user', role: 'user', content: 'Keep this session durable.', createdAt: now, state: 'complete' },
      { id: 'message-assistant', role: 'assistant', content: 'Session state is preserved.', createdAt: now, state: 'complete' },
    ] : [],
    events: [],
    workspaces: [{ id: 'workspace-sessions', name: 'Sessions Workspace' }],
    projects,
    currentProject,
    workflows: [],
    vaultSecrets: [],
    installedSkills: [],
    installedApps: [],
    superAgent: { id: 'super-sessions', name: 'Super AgentOS', instructions: '', status: 'active' },
    subagents: [],
    memoryEntries: [],
    fileEntries: [],
    fileTree: [],
  };
}

async function revealSessionControls(page: import('@playwright/test').Page) {
  const row = page.locator('.agentos-session-row').filter({ hasText: 'Planning chat' }).first();
  const reveal = async () => {
    const openNavigation = page.getByRole('button', { name: 'Open navigation' });
    if (await openNavigation.isVisible().catch(() => false)) {
      await openNavigation.click();
    }
    const shell = page.locator('.agentos-global-shell');
    if (await shell.evaluate(element => element.getAttribute('data-left-collapsed') === 'true').catch(() => false)) {
      await page.getByRole('button', { name: 'Expand navigation sidebar' }).click();
    }
    await expect(shell).toHaveAttribute('data-left-collapsed', 'false');
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await reveal();
    if (await row.isVisible().catch(() => false)) return;
    await page.goto('/studio?mode=nl&session=session-one', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(250);
  }
  await expect(row).toBeVisible();
}

test.describe('NL Studio session management', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('agentos.shell.leftCollapsed', 'false');
      window.localStorage.setItem('agentos.shell.rightCollapsed', 'false');
    });
    let sessions: StudioSession[] = [
      {
        id: 'session-one',
        workspaceId: 'workspace-sessions',
        projectId: 'project-alpha',
        title: 'Planning chat',
        visibility: 'private',
        pinnedAt: null,
        archivedAt: null,
        deletedAt: null,
        updatedAt: now,
      },
      {
        id: 'session-two',
        workspaceId: 'workspace-sessions',
        projectId: null,
        title: 'Loose research',
        visibility: 'private',
        pinnedAt: null,
        archivedAt: null,
        deletedAt: null,
        updatedAt: now,
      },
    ];

    await page.route(/\/api\/session(?:\/refresh)?(?:\?|$)/, async route => {
      await fulfillJson(route, {
        authenticated: true,
        session: {
          agentName: 'Sessions QA',
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
          agentName: 'Sessions QA',
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
        workspaces: [{ id: 'workspace-sessions', name: 'Sessions Workspace', slug: 'sessions', plan: 'pro' }],
        sessions: sessions.map(item => ({ ...item, status: 'active' })),
        projects: projects.map(item => ({ ...item, pinned: false, updatedAt: now })),
        notifications: { unread: 0 },
        agents: { connected: 0 },
      });
    });
    await page.route('**/api/studio/bootstrap**', async route => {
      const requestedSession = new URL(route.request().url()).searchParams.get('session');
      await fulfillJson(route, baseBootstrap(sessions, requestedSession));
    });
    await page.route('**/api/studio/sessions/*', async route => {
      const url = new URL(route.request().url());
      const sessionId = url.pathname.split('/').pop() ?? '';
      const index = sessions.findIndex(item => item.id === sessionId);
      if (index < 0) {
        await fulfillJson(route, { error: 'missing' }, 404);
        return;
      }
      if (route.request().method() === 'PATCH') {
        const body = await route.request().postDataJSON() as Partial<StudioSession> & { pinned?: boolean };
        sessions[index] = {
          ...sessions[index],
          title: typeof body.title === 'string' ? body.title : sessions[index].title,
          projectId: body.projectId === null || typeof body.projectId === 'string' ? body.projectId : sessions[index].projectId,
          pinnedAt: typeof body.pinned === 'boolean' ? body.pinned ? now : null : sessions[index].pinnedAt,
          updatedAt: now,
        };
        await fulfillJson(route, { session: sessions[index] });
        return;
      }
      if (route.request().method() === 'DELETE') {
        const deleteMode = url.searchParams.get('mode') === 'delete';
        sessions[index] = {
          ...sessions[index],
          archivedAt: deleteMode ? sessions[index].archivedAt : now,
          deletedAt: deleteMode ? now : sessions[index].deletedAt,
        };
        await fulfillJson(route, { session: sessions[index], archived: !deleteMode, deleted: deleteMode });
        return;
      }
      await fulfillJson(route, {
        session: sessions[index],
        messages: [],
        events: [],
        lineage: { parent: null, children: [] },
      });
    });
    await page.route('**/api/executions**', async route => fulfillJson(route, { executions: [] }));
    await page.route('**/api/recovery**', async route => fulfillJson(route, { executions: [] }));
    await page.route('**/api/notifications**', async route => fulfillJson(route, { notifications: [] }));
  });

  test('renames and attaches a session from the sidebar', async ({ page }) => {
    await page.goto('/studio?mode=nl&session=session-one', { waitUntil: 'domcontentloaded' });
    await revealSessionControls(page);

    const row = page.locator('.agentos-session-row').filter({ hasText: 'Planning chat' }).first();
    await expect(row).toContainText('Alpha Project | private');

    page.once('dialog', dialog => dialog.accept('Renamed workspace chat'));
    await row.getByRole('button', { name: 'Rename' }).click();
    const renamedRow = page.locator('.agentos-session-row').filter({ hasText: 'Renamed workspace chat' }).first();
    await expect(renamedRow).toBeVisible();

    await renamedRow.getByRole('button', { name: 'Attach' }).click();
    await page.getByRole('menu', { name: 'Attach Renamed workspace chat to project' }).getByRole('button', { name: 'Beta Project' }).click();
    await expect(page).toHaveURL(/project=project-beta/);
    await expect(renamedRow).toContainText('Beta Project | private');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test('pins and archives sessions without losing the active conversation shell', async ({ page }) => {
    await page.goto('/studio?mode=nl&session=session-one', { waitUntil: 'domcontentloaded' });
    await revealSessionControls(page);

    const row = page.locator('.agentos-session-row').filter({ hasText: 'Planning chat' }).first();
    await row.getByRole('button', { name: 'Pin' }).click();
    await expect(page.locator('.agentos-session-row').filter({ hasText: 'Pinned: Planning chat' }).first()).toBeVisible();

    page.once('dialog', dialog => dialog.accept());
    await row.getByRole('button', { name: 'Archive' }).click();
    await expect(page).not.toHaveURL(/session=session-one/);
    await expect(page.getByText('What should Super AgentOS do?')).toBeVisible();
    await revealSessionControls(page);
    await expect(page.getByRole('heading', { name: 'Archived Sessions' })).toBeVisible();
    await expect(page.locator('.agentos-session-row').filter({ hasText: 'Planning chat' }).getByRole('button', { name: 'Continue' })).toBeVisible();
  });
});
