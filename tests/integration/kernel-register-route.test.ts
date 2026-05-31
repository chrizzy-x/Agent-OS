import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mockSupabase } from '../setup.js';

vi.mock('../../src/mcp/registry.js', () => ({
  executeUniversalToolCall: vi.fn().mockResolvedValue({ published: true }),
}));

import { POST as postKernelRegister } from '../../app/api/kernel/register/route.js';
import { GET as getKernelRegistry } from '../../app/api/kernel/registry/route.js';
import { GET as getKernelStatus } from '../../app/api/kernel/status/[product]/route.js';
import { POST as postKernelCommand } from '../../app/api/kernel/command/route.js';
import { POST as postKernelBackfill } from '../../app/api/kernel/backfill-apps/route.js';
import { GET as getApps } from '../../app/api/apps/route.js';
import { executeUniversalToolCall } from '../../src/mcp/registry.js';

type TableRow = Record<string, unknown>;

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createStatefulSupabase() {
  const tables: Record<string, TableRow[]> = {
    sdk_credentials: [],
    agents: [],
    kernel_registry: [],
    agent_apps: [],
  };

  function applyFilters(rows: TableRow[], filters: Array<{ field: string; value: unknown }>) {
    return rows.filter(row => filters.every(filter => row[filter.field] === filter.value));
  }

  function sortRows(rows: TableRow[], orderField: string | null, ascending: boolean) {
    if (!orderField) return rows;
    return [...rows].sort((left, right) => {
      const a = String(left[orderField] ?? '');
      const b = String(right[orderField] ?? '');
      return ascending ? a.localeCompare(b) : b.localeCompare(a);
    });
  }

  function builder(table: string) {
    const filters: Array<{ field: string; value: unknown }> = [];
    let orderField: string | null = null;
    let ascending = true;

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
        const rows = sortRows(applyFilters(tables[table] ?? [], filters), orderField, ascending);
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      single() {
        const rows = sortRows(applyFilters(tables[table] ?? [], filters), orderField, ascending);
        return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } });
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
        const rows = sortRows(applyFilters(tables[table] ?? [], filters), orderField, ascending);
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

function sdkRequest(url: string, method: string, token: string, body?: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe.sequential('kernel register discoverability flow', () => {
  let sdkToken = '';
  let db: ReturnType<typeof createStatefulSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createStatefulSupabase();
    mockSupabase.from.mockImplementation(db.client.from);
    mockSupabase.rpc.mockImplementation(db.client.rpc);

    sdkToken = 'sdk_test_public_ref_1234567890';
    db.tables.sdk_credentials.push({
      id: 'cred-1',
      workspace_id: 'workspace-1',
      owner_agent_id: 'owner-agent',
      name: 'SDK',
      public_ref: sdkToken.slice(0, 16),
      token_hash: sha256(sdkToken),
      scopes: [],
      status: 'active',
      created_at: '2026-05-31T00:00:00Z',
      updated_at: '2026-05-31T00:00:00Z',
      expires_at: null,
      revoked_at: null,
    });
    db.tables.agents.push({
      id: 'owner-agent',
      name: 'SDK Owner',
      tier: 'enterprise_plus',
      metadata: { plan: 'enterprise_plus', email: 'owner@example.com' },
    });
  });

  it('register creates kernel_registry and agent_apps rows and exposes the app publicly', async () => {
    const request = sdkRequest('http://localhost/api/kernel/register', 'POST', sdkToken, {
      product: 'research-kit',
      commandTopic: 'kernel.research.commands',
      statusTopic: 'kernel.research.status',
      availableCommands: [{ name: 'run', description: 'Run the research workflow' }],
      app: {
        name: 'Research Kit',
        description: 'SDK research app',
        category: 'Research',
      },
    });

    const response = await postKernelRegister(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.registered).toBe(true);
    expect(db.tables.kernel_registry).toHaveLength(1);
    expect(db.tables.agent_apps).toHaveLength(1);
    expect(db.tables.agent_apps[0].source).toBe('external_sdk');
    expect(db.tables.agent_apps[0].visibility).toBe('public');

    const publicAppsResponse = await getApps(new NextRequest('http://localhost/api/apps'));
    const publicAppsBody = await publicAppsResponse.json();
    expect(publicAppsBody.apps.map((app: { slug: string }) => app.slug)).toContain('research-kit');
  });

  it('register updates the existing app instead of creating duplicates', async () => {
    const first = sdkRequest('http://localhost/api/kernel/register', 'POST', sdkToken, {
      product: 'research-kit',
      commandTopic: 'kernel.research.commands',
      statusTopic: 'kernel.research.status',
      availableCommands: [{ name: 'run' }],
      app: { name: 'Research Kit', description: 'first description' },
    });
    await postKernelRegister(first);

    const second = sdkRequest('http://localhost/api/kernel/register', 'POST', sdkToken, {
      product: 'research-kit',
      commandTopic: 'kernel.research.commands.v2',
      statusTopic: 'kernel.research.status',
      availableCommands: [{ name: 'sync', description: 'Sync state' }],
      app: { name: 'Research Kit', description: 'updated description' },
    });
    await postKernelRegister(second);

    expect(db.tables.kernel_registry).toHaveLength(1);
    expect(db.tables.agent_apps).toHaveLength(1);
    expect(db.tables.agent_apps[0].description).toBe('updated description');
    expect(db.tables.agent_apps[0].kernel_command_topic).toBe('kernel.research.commands.v2');
  });

  it('allows sdk credentials to access registry, status, and command routes', async () => {
    await postKernelRegister(sdkRequest('http://localhost/api/kernel/register', 'POST', sdkToken, {
      product: 'research-kit',
      commandTopic: 'kernel.research.commands',
      statusTopic: 'kernel.research.status',
      availableCommands: [{ name: 'run' }],
      app: { name: 'Research Kit', description: 'SDK app' },
    }));
    db.tables.kernel_registry[0].status = 'healthy';
    db.tables.kernel_registry[0].last_heartbeat_at = '2026-05-31T10:00:00Z';
    db.tables.kernel_registry[0].last_status_payload = { status: 'healthy' };

    const registryResponse = await getKernelRegistry(sdkRequest('http://localhost/api/kernel/registry', 'GET', sdkToken));
    expect(registryResponse.status).toBe(200);

    const statusResponse = await getKernelStatus(
      sdkRequest('http://localhost/api/kernel/status/research-kit', 'GET', sdkToken),
      { params: Promise.resolve({ product: 'research-kit' }) },
    );
    const statusBody = await statusResponse.json();
    expect(statusResponse.status).toBe(200);
    expect(statusBody.lastHeartbeatAt).toBe('2026-05-31T10:00:00Z');

    const commandResponse = await postKernelCommand(sdkRequest('http://localhost/api/kernel/command', 'POST', sdkToken, {
      product: 'research-kit',
      command: 'run',
      payload: { query: 'hello' },
    }));
    expect(commandResponse.status).toBe(200);
    expect(vi.mocked(executeUniversalToolCall)).toHaveBeenCalled();
  });

  it('backfills app rows from legacy kernel registrations', async () => {
    db.tables.kernel_registry.push({
      id: 'kernel-1',
      agent_id: 'owner-agent',
      workspace_id: 'workspace-1',
      product: 'legacy-sync',
      command_topic: 'kernel.legacy.commands',
      status_topic: 'kernel.legacy.status',
      available_commands: [{ name: 'sync', description: 'Sync' }],
      status: 'healthy',
      registered_at: '2026-05-31T00:00:00Z',
      last_heartbeat_at: '2026-05-31T01:00:00Z',
      last_status_payload: { status: 'healthy' },
    });

    const response = await postKernelBackfill(new NextRequest('http://localhost/api/kernel/backfill-apps', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.created).toBe(1);
    expect(db.tables.agent_apps).toHaveLength(1);
    expect(db.tables.agent_apps[0].slug).toBe('legacy-sync');
  });
});
