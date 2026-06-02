import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAgentToken } from '../../src/auth/agent-identity.js';
import { mockSupabase } from '../setup.js';
import { POST as postInstall } from '../../app/api/apps/install/route.js';
import { GET as getInstalled } from '../../app/api/apps/installed/route.js';
import { POST as postOpen } from '../../app/api/apps/[slug]/open/route.js';
import { PATCH as patchInstallation, DELETE as deleteInstallation } from '../../app/api/apps/[slug]/installation/route.js';

type TableRow = Record<string, unknown>;

function agentRequest(url: string, method: string, token: string, body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function createAppSupabase() {
  const tables: Record<string, TableRow[]> = {
    agents: [],
    workspace_members: [],
    agent_apps: [],
    app_installations: [],
    skill_installations: [],
  };

  function applyFilters(rows: TableRow[], filters: Array<{ field: string; value: unknown }>) {
    return rows.filter(row => filters.every(filter => row[filter.field] === filter.value));
  }

  function builder(table: string) {
    const filters: Array<{ field: string; value: unknown }> = [];
    let orderField: string | null = null;
    let ascending = true;
    let updatePayload: TableRow | null = null;

    const query = {
      select: vi.fn().mockReturnThis(),
      eq(field: string, value: unknown) {
        filters.push({ field, value });
        return query;
      },
      order(field: string, options?: { ascending?: boolean }) {
        orderField = field;
        ascending = options?.ascending !== false;
        return query;
      },
      maybeSingle() {
        const rows = applyFilters(tables[table] ?? [], filters);
        if (updatePayload && rows[0]) {
          Object.assign(rows[0], updatePayload);
          return Promise.resolve({ data: rows[0], error: null });
        }
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      single() {
        const rows = applyFilters(tables[table] ?? [], filters);
        if (updatePayload && rows[0]) {
          Object.assign(rows[0], updatePayload);
          return Promise.resolve({ data: rows[0], error: null });
        }
        return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } });
      },
      update(payload: TableRow) {
        updatePayload = payload;
        return query;
      },
      upsert(payload: TableRow, options?: { onConflict?: string }) {
        const rows = tables[table] ?? [];
        const keys = (options?.onConflict ?? 'id').split(',').map(item => item.trim());
        const index = rows.findIndex(row => keys.every(key => row[key] === payload[key]));
        const next = index >= 0 ? { ...rows[index], ...payload } : { ...payload };
        if (index >= 0) rows[index] = next;
        else rows.push(next);
        tables[table] = rows;
        return {
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: next, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: next, error: null }),
        };
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        let rows = applyFilters(tables[table] ?? [], filters);
        if (orderField) {
          rows = [...rows].sort((left, right) => {
            const a = String(left[orderField] ?? '');
            const b = String(right[orderField] ?? '');
            return ascending ? a.localeCompare(b) : b.localeCompare(a);
          });
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };

    return query;
  }

  return {
    tables,
    client: {
      from: vi.fn((table: string) => builder(table)),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      storage: { from: vi.fn() },
    },
  };
}

describe.sequential('app installation lifecycle routes', () => {
  const token = createAgentToken('agent-retail', { expiresIn: '1h' });
  let db: ReturnType<typeof createAppSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createAppSupabase();
    mockSupabase.from.mockImplementation(db.client.from);
    mockSupabase.rpc.mockImplementation(db.client.rpc);

    db.tables.agents.push({
      id: 'agent-retail',
      name: 'Retail',
      tier: 'retail_free',
      metadata: { plan: 'retail_free', email: 'retail@example.com' },
    });
    db.tables.workspace_members.push({
      workspace_id: 'workspace-1',
      user_id: 'agent-retail',
      role: 'owner',
      workspaces: {
        id: 'workspace-1',
        name: 'Workspace',
        slug: 'workspace',
        owner_id: 'agent-retail',
        plan: 'retail_free',
        created_at: '2026-06-01T00:00:00Z',
      },
    });
    db.tables.agent_apps.push({
      id: 'app-1',
      workspace_id: 'workspace-1',
      name: 'Research Kit',
      slug: 'research-kit',
      category: 'Research',
      description: 'SDK research app',
      long_description: 'SDK research app',
      publisher_id: 'owner-agent',
      publisher_name: 'Owner',
      app_url: 'https://apps.example.com/research-kit',
      repository_url: null,
      device_targets: ['AgentOS Cloud', 'Android', 'iOS'],
      manifest: {
        schemaVersion: 'agentos.app.v1',
        version: '1.0.0',
        runtime: 'external-app',
        entrypoint: 'agentos://kernel/research-kit',
        primitives: [],
        skills: [],
        requiredSkills: [],
        bundledSkills: [],
        permissions: ['access_network'],
        requiredSecrets: [],
        commands: [{ name: 'run', description: 'Run' }],
        distribution: {
          webUrl: 'https://apps.example.com/research-kit',
          androidUrl: 'https://play.example.com/research-kit',
          iosUrl: 'https://apps.apple.com/research-kit',
        },
      },
      default_config: {},
      permissions_required: ['access_network'],
      required_secrets: [],
      screenshots: [],
      publish_state: 'published',
      source: 'external_sdk',
      visibility: 'public',
      runtime_type: 'external-app',
      kernel_product: 'research-kit',
      kernel_command_topic: 'kernel.research.commands',
      kernel_status_topic: 'kernel.research.status',
      last_heartbeat_at: '2026-06-01T00:00:00Z',
      health_status: 'online',
      endpoint_status: 'healthy',
      last_command_at: null,
      last_error: null,
      disabled: false,
      heartbeat_count: 1,
      open_count: 0,
      web_open_count: 0,
      android_download_count: 0,
      ios_download_count: 0,
      install_count: 0,
      verified: true,
      published: true,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
    });
  });

  it('requires permission approval, then installs, opens, updates, pins, and uninstalls an app', async () => {
    const blocked = await postInstall(agentRequest('http://localhost/api/apps/install', 'POST', token, {
      slug: 'research-kit',
    }));
    const blockedBody = await blocked.json();

    expect(blocked.status).toBe(400);
    expect(blockedBody.code).toBe('PERMISSION_REQUIRED');

    const installed = await postInstall(agentRequest('http://localhost/api/apps/install', 'POST', token, {
      slug: 'research-kit',
      permissionsApproved: ['access_network'],
    }));
    const installedBody = await installed.json();

    expect(installed.status).toBe(201);
    expect(installedBody.app.slug).toBe('research-kit');

    const installedList = await getInstalled(agentRequest('http://localhost/api/apps/installed', 'GET', token));
    const installedListBody = await installedList.json();

    expect(installedList.status).toBe(200);
    expect(installedListBody.installedApps).toHaveLength(1);
    expect(installedListBody.installedApps[0].installation.installedVersion).toBe('1.0.0');

    db.tables.agent_apps[0].manifest = {
      ...(db.tables.agent_apps[0].manifest as Record<string, unknown>),
      version: '2.0.0',
    };

    const updateList = await getInstalled(agentRequest('http://localhost/api/apps/installed', 'GET', token));
    const updateListBody = await updateList.json();

    expect(updateListBody.installedApps[0].installation.updateAvailable).toBe(true);

    const updated = await postInstall(agentRequest('http://localhost/api/apps/install', 'POST', token, {
      slug: 'research-kit',
      permissionsApproved: ['access_network'],
    }));
    const updatedBody = await updated.json();

    expect(updated.status).toBe(201);
    expect(updatedBody.installation.installedVersion).toBe('2.0.0');

    const opened = await postOpen(agentRequest('http://localhost/api/apps/research-kit/open', 'POST', token), {
      params: Promise.resolve({ slug: 'research-kit' }),
    });
    const openedBody = await opened.json();

    expect(opened.status).toBe(200);
    expect(openedBody.openUrl).toBe('https://apps.example.com/research-kit');

    const pinned = await patchInstallation(agentRequest('http://localhost/api/apps/research-kit/installation', 'PATCH', token, {
      favorite: true,
    }), {
      params: Promise.resolve({ slug: 'research-kit' }),
    });
    const pinnedBody = await pinned.json();

    expect(pinned.status).toBe(200);
    expect(pinnedBody.installation.favorite).toBe(true);

    const removed = await deleteInstallation(agentRequest('http://localhost/api/apps/research-kit/installation', 'DELETE', token), {
      params: Promise.resolve({ slug: 'research-kit' }),
    });
    const removedBody = await removed.json();

    expect(removed.status).toBe(200);
    expect(removedBody.removed).toBe(true);
  });
});
