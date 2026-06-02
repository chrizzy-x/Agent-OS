import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAgentToken } from '../../src/auth/agent-identity.js';
import { encryptVaultSecret } from '../../src/vault/service.js';
import { mockSupabase } from '../setup.js';
import { POST as postVaultAccess } from '../../app/api/vault/access/route.js';
import { POST as postConsumeGrant } from '../../app/api/vault/runtime-grants/consume/route.js';

type TableRow = Record<string, unknown>;

process.env.VAULT_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

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

function createVaultSupabase() {
  const tables: Record<string, TableRow[]> = {
    agents: [],
    workspace_members: [],
    vaults: [],
    vault_secrets: [],
    vault_assignments: [],
    vault_runtime_grants: [],
    vault_access_logs: [],
    sdk_credentials: [],
    agent_apps: [],
    app_installations: [],
    agent_app_versions: [],
  };

  function applyFilters(rows: TableRow[], filters: Array<{ field: string; value: unknown }>) {
    return rows.filter(row => filters.every(filter => row[filter.field] === filter.value));
  }

  function builder(table: string) {
    const filters: Array<{ field: string; value: unknown }> = [];
    let orderField: string | null = null;
    let ascending = true;
    let limitCount: number | null = null;
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
      limit(value: number) {
        limitCount = value;
        return query;
      },
      maybeSingle() {
        let rows = applyFilters(tables[table] ?? [], filters);
        if (orderField) {
          rows = [...rows].sort((left, right) => {
            const a = String(left[orderField] ?? '');
            const b = String(right[orderField] ?? '');
            return ascending ? a.localeCompare(b) : b.localeCompare(a);
          });
        }
        if (typeof limitCount === 'number') rows = rows.slice(0, limitCount);
        if (updatePayload && rows[0]) Object.assign(rows[0], updatePayload);
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      single() {
        return query.maybeSingle().then(({ data }) => ({ data, error: data ? null : { message: 'not found' } }));
      },
      update(payload: TableRow) {
        updatePayload = payload;
        return query;
      },
      insert(payload: TableRow) {
        const row = { ...payload };
        tables[table] ??= [];
        tables[table].push(row);
        return {
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: row, error: null }),
        };
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
        if (typeof limitCount === 'number') rows = rows.slice(0, limitCount);
        if (updatePayload) {
          rows.forEach(row => Object.assign(row, updatePayload));
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

describe.sequential('vault runtime grant routes', () => {
  const agentToken = createAgentToken('agent-enterprise', { expiresIn: '1h' });
  const sdkToken = 'sdk_runtime_grant_token_1234567890';
  let db: ReturnType<typeof createVaultSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createVaultSupabase();
    mockSupabase.from.mockImplementation(db.client.from);
    mockSupabase.rpc.mockImplementation(db.client.rpc);

    db.tables.agents.push({
      id: 'agent-enterprise',
      name: 'Enterprise Owner',
      tier: 'enterprise_plus',
      metadata: { plan: 'enterprise_plus', email: 'owner@example.com' },
    });
    db.tables.workspace_members.push({
      workspace_id: 'workspace-1',
      user_id: 'agent-enterprise',
      role: 'owner',
      workspaces: {
        id: 'workspace-1',
        name: 'Workspace',
        slug: 'workspace',
        owner_id: 'agent-enterprise',
        plan: 'enterprise_plus',
        created_at: '2026-06-01T00:00:00Z',
      },
    });
    db.tables.vaults.push({
      id: 'vault-1',
      workspace_id: 'workspace-1',
      owner_agent_id: 'agent-enterprise',
      created_at: '2026-06-01T00:00:00Z',
    });
    db.tables.vault_secrets.push({
      id: 'secret-1',
      vault_id: 'vault-1',
      workspace_id: 'workspace-1',
      owner_agent_id: 'agent-enterprise',
      name: 'OPENAI_API_KEY',
      encrypted_value: encryptVaultSecret('sk-live-secret-value'),
      masked_value: '************alue',
      status: 'active',
      version: 1,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
      last_accessed_at: null,
    });
    db.tables.agent_apps.push({
      id: 'app-1',
      workspace_id: 'workspace-1',
      name: 'Research Kit',
      slug: 'research-kit',
      category: 'Research',
      description: 'Research app',
      long_description: 'Research app',
      publisher_id: 'agent-enterprise',
      publisher_name: 'Enterprise Owner',
      app_url: 'https://apps.example.com/research-kit',
      repository_url: null,
      device_targets: ['AgentOS Cloud'],
      manifest: {
        schemaVersion: 'agentos.app.v1',
        version: '1.0.0',
        runtime: 'external-app',
        entrypoint: 'agentos://kernel/research-kit',
        primitives: [],
        skills: [],
        requiredSkills: [],
        bundledSkills: [],
        permissions: ['vault'],
        requiredSecrets: ['OPENAI_API_KEY'],
        commands: [{ name: 'run', description: 'Run' }],
      },
      default_config: {},
      permissions_required: ['vault'],
      required_secrets: ['OPENAI_API_KEY'],
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
      install_count: 1,
      verified: true,
      published: true,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
    });
    db.tables.app_installations.push({
      id: 'install-1',
      app_id: 'app-1',
      agent_id: 'agent-enterprise',
      workspace_id: 'workspace-1',
      status: 'active',
      favorite: false,
      permissions_approved: ['vault'],
      open_count: 0,
      last_opened_at: null,
      installed_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
      installed_version: '1.0.0',
    });
    db.tables.vault_assignments.push({
      id: 'assign-1',
      secret_id: 'secret-1',
      vault_id: 'vault-1',
      workspace_id: 'workspace-1',
      owner_agent_id: 'agent-enterprise',
      subject_type: 'app',
      subject_id: 'app-1',
      status: 'active',
      created_at: '2026-06-01T00:00:00Z',
      revoked_at: null,
    });
    db.tables.sdk_credentials.push({
      id: 'cred-1',
      workspace_id: 'workspace-1',
      owner_agent_id: 'agent-enterprise',
      name: 'runtime',
      public_ref: sdkToken.slice(0, 16),
      token_hash: sha256(sdkToken),
      scopes: ['kernel.command'],
      status: 'active',
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
      expires_at: null,
      revoked_at: null,
    });
  });

  it('creates, consumes, and cleans runtime grants without leaking plaintext in grant metadata', async () => {
    const createResponse = await postVaultAccess(agentRequest('http://localhost/api/vault/access', 'POST', agentToken, {
      action: 'runtime',
      workspaceId: 'workspace-1',
      name: 'OPENAI_API_KEY',
      appSlug: 'research-kit',
    }));
    const createBody = await createResponse.json();

    expect(createResponse.status).toBe(200);
    expect(createBody.granted).toBe(true);
    expect(createBody.grant.name).toBe('OPENAI_API_KEY');
    expect(JSON.stringify(createBody)).not.toContain('sk-live-secret-value');

    const consumeResponse = await postConsumeGrant(agentRequest('http://localhost/api/vault/runtime-grants/consume', 'POST', sdkToken, {
      grantId: createBody.grant.id,
    }));
    const consumeBody = await consumeResponse.json();

    expect(consumeResponse.status).toBe(200);
    expect(consumeBody.secret.name).toBe('OPENAI_API_KEY');
    expect(consumeBody.secret.value).toBe('sk-live-secret-value');

    const repeatConsume = await postConsumeGrant(agentRequest('http://localhost/api/vault/runtime-grants/consume', 'POST', sdkToken, {
      grantId: createBody.grant.id,
    }));
    expect(repeatConsume.status).toBe(403);

    const cleanupResponse = await postConsumeGrant(agentRequest('http://localhost/api/vault/runtime-grants/consume', 'POST', sdkToken, {
      action: 'cleanup',
      grantId: createBody.grant.id,
    }));
    const cleanupBody = await cleanupResponse.json();

    expect(cleanupResponse.status).toBe(200);
    expect(cleanupBody.cleaned).toBe(true);
    expect(cleanupBody.grant.status).toBe('cleaned');
    expect(JSON.stringify(db.tables.vault_access_logs)).not.toContain('sk-live-secret-value');
  });

  it('expires runtime grants before consumption', async () => {
    const createResponse = await postVaultAccess(agentRequest('http://localhost/api/vault/access', 'POST', agentToken, {
      action: 'runtime',
      workspaceId: 'workspace-1',
      name: 'OPENAI_API_KEY',
      appSlug: 'research-kit',
    }));
    const createBody = await createResponse.json();

    db.tables.vault_runtime_grants[0].expires_at = '2020-01-01T00:00:00Z';

    const consumeResponse = await postConsumeGrant(agentRequest('http://localhost/api/vault/runtime-grants/consume', 'POST', sdkToken, {
      grantId: createBody.grant.id,
    }));
    const consumeBody = await consumeResponse.json();

    expect(consumeResponse.status).toBe(403);
    expect(consumeBody.code).toBe('PERMISSION_DENIED');
    expect(db.tables.vault_runtime_grants[0].status).toBe('expired');
  });
});
