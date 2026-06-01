import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentToken } from '../../src/auth/agent-identity.js';
import { updateLocalRuntimeState } from '../../src/storage/local-state.js';
import { mockSupabase } from '../setup.js';
import { GET as getApps } from '../../app/api/apps/route.js';
import { GET as getAppBySlug } from '../../app/api/apps/[slug]/route.js';

function appRecord(overrides: Partial<Record<string, unknown>>) {
  const slug = String(overrides.slug ?? 'sample-app');
  const visibility = String(overrides.visibility ?? 'public');
  return {
    id: String(overrides.id ?? `${slug}-id`),
    workspaceId: String(overrides.workspaceId ?? 'workspace-1'),
    name: String(overrides.name ?? slug),
    slug,
    category: String(overrides.category ?? 'Research'),
    description: String(overrides.description ?? `${slug} description`),
    longDescription: String(overrides.longDescription ?? `${slug} long description`),
    publisherId: String(overrides.publisherId ?? 'owner-agent'),
    publisherName: String(overrides.publisherName ?? 'Owner'),
    appUrl: null,
    repositoryUrl: null,
    deviceTargets: ['AgentOS Cloud'],
    manifest: {
      schemaVersion: 'agentos.app.v1',
      version: '1.0.0',
      runtime: 'agentos-app',
      entrypoint: `agentos://apps/${slug}`,
      primitives: [],
      skills: [],
      permissions: [],
      requiredSecrets: [],
      commands: [],
    },
    defaultConfig: {},
    permissionsRequired: [],
    requiredSecrets: [],
    screenshots: [],
    source: String(overrides.source ?? 'internal'),
    visibility,
    runtimeType: String(overrides.runtimeType ?? 'agentos-app'),
    kernelProduct: null,
    kernelCommandTopic: null,
    kernelStatusTopic: null,
    distribution: { webUrl: null, androidUrl: null, iosUrl: null },
    healthStatus: 'unknown',
    endpointStatus: 'unknown',
    lastHeartbeatAt: null,
    lastCommandAt: null,
    lastError: null,
    disabled: false,
    heartbeatCount: 0,
    openCount: 0,
    webOpenCount: 0,
    androidDownloadCount: 0,
    iosDownloadCount: 0,
    installCount: Number(overrides.installCount ?? 0),
    verified: false,
    published: visibility === 'public',
    createdAt: '2026-05-31T00:00:00Z',
    updatedAt: '2026-05-31T00:00:00Z',
  };
}

describe.sequential('app visibility routes', () => {
  let stateFile = '';

  beforeEach(async () => {
    vi.clearAllMocks();
    stateFile = join(tmpdir(), `agentos-appstore-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    process.env.AGENTOS_STATE_FILE = stateFile;
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'agent_apps') {
        return {
          select: vi.fn().mockResolvedValue({ data: null, error: { message: 'offline' } }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    await updateLocalRuntimeState(state => {
      state.agentApps.catalog = [
        appRecord({ slug: 'public-app', visibility: 'public' }),
        appRecord({ slug: 'private-app', visibility: 'private' }),
        appRecord({ slug: 'unlisted-app', visibility: 'unlisted' }),
      ];
    });
  });

  afterEach(() => {
    rmSync(stateFile, { force: true });
  });

  it('shows only public apps in the public listing', async () => {
    const response = await getApps(new NextRequest('http://localhost/api/apps'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.apps.map((app: { slug: string }) => app.slug)).toEqual(['public-app']);
  });

  it('hides private internal apps from the public listing and search', async () => {
    const response = await getApps(new NextRequest('http://localhost/api/apps?search=private-app'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.apps).toHaveLength(0);
  });

  it('hides unlisted apps from the public listing and search', async () => {
    const response = await getApps(new NextRequest('http://localhost/api/apps?search=unlisted-app'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.apps).toHaveLength(0);
  });

  it('loads an unlisted app by slug', async () => {
    const response = await getAppBySlug(
      new NextRequest('http://localhost/api/apps/unlisted-app'),
      { params: Promise.resolve({ slug: 'unlisted-app' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.app.slug).toBe('unlisted-app');
  });

  it('only loads a private app for the owner or admin', async () => {
    const publicResponse = await getAppBySlug(
      new NextRequest('http://localhost/api/apps/private-app'),
      { params: Promise.resolve({ slug: 'private-app' }) },
    );
    expect(publicResponse.status).toBe(404);

    const ownerToken = createAgentToken('owner-agent', { expiresIn: '1h' });
    const ownerResponse = await getAppBySlug(
      new NextRequest('http://localhost/api/apps/private-app', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      }),
      { params: Promise.resolve({ slug: 'private-app' }) },
    );
    expect(ownerResponse.status).toBe(200);

    const adminResponse = await getAppBySlug(
      new NextRequest('http://localhost/api/apps/private-app', {
        headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
      }),
      { params: Promise.resolve({ slug: 'private-app' }) },
    );
    expect(adminResponse.status).toBe(200);
  });

  it('backfills older SDK registrations into the public App Store', async () => {
    let catalogRows: Record<string, unknown>[] = [];

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'agent_apps') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: catalogRows[0] ?? null, error: null }),
          upsert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
            catalogRows = [payload];
            return {
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: payload, error: null }),
            };
          }),
          data: catalogRows,
          error: null,
        };
      }

      if (table === 'kernel_registry') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          data: [{
            agent_id: 'enterprise-owner',
            workspace_id: 'workspace-1',
            product: 'legacy-sdk-app',
            command_topic: 'kernel.legacy.commands',
            status_topic: 'kernel.legacy.status',
            available_commands: [{ name: 'run', description: 'Run legacy app' }],
            status: 'online',
            health_status: 'online',
            endpoint_status: 'healthy',
            version: '1.4.0',
            registered_at: '2026-05-01T10:00:00Z',
            last_heartbeat_at: '2026-06-01T10:00:00Z',
            last_error: null,
            disabled: false,
            heartbeat_count: 4,
          }],
          error: null,
        };
      }

      if (table === 'agents') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [{
              id: 'enterprise-owner',
              name: 'Enterprise Owner',
              tier: 'enterprise_plus',
              metadata: { plan: 'enterprise_plus' },
            }],
            error: null,
          }),
        };
      }

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        order: vi.fn().mockReturnThis(),
        data: [],
        error: null,
      };
    });

    const response = await getApps(new NextRequest('http://localhost/api/apps'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.apps.map((app: { slug: string }) => app.slug)).toContain('legacy-sdk-app');
  });

  it('backfills SDK apps from pre-019 app schema and pre-workspace kernel rows', async () => {
    let catalogRows: Record<string, unknown>[] = [];
    const missingColumn = { message: 'column missing' };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'agent_apps') {
        return {
          select: vi.fn((columns?: string) => {
            if (typeof columns === 'string' && (columns.includes('workspace_id') || columns.includes('source'))) {
              return { data: null, error: missingColumn };
            }
            return { data: catalogRows, error: null };
          }),
          order: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: catalogRows[0] ?? null, error: null }),
          upsert: vi.fn().mockImplementation((payload: Record<string, unknown>) => ({
            select: vi.fn((columns?: string) => ({
              single: vi.fn().mockImplementation(async () => {
                if (typeof columns === 'string' && (columns.includes('workspace_id') || columns.includes('source'))) {
                  return { data: null, error: missingColumn };
                }
                catalogRows = [payload];
                return { data: payload, error: null };
              }),
            })),
          })),
        };
      }

      if (table === 'kernel_registry') {
        return {
          select: vi.fn((columns?: string) => ({
            order: vi.fn().mockResolvedValue(
              typeof columns === 'string' && columns.includes('workspace_id')
                ? { data: null, error: missingColumn }
                : {
                  data: [{
                    agent_id: 'enterprise-owner',
                    product: 'pre019-sdk-app',
                    command_topic: 'kernel.pre019.commands',
                    status_topic: 'kernel.pre019.status',
                    available_commands: [{ name: 'run', description: 'Run pre-019 app' }],
                    status: 'online',
                    registered_at: '2026-05-01T10:00:00Z',
                    last_heartbeat_at: '2026-06-01T10:00:00Z',
                    last_status_payload: {},
                  }],
                  error: null,
                },
            ),
          })),
        };
      }

      if (table === 'agents') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [{
              id: 'enterprise-owner',
              name: 'Enterprise Owner',
              tier: 'enterprise_plus',
              metadata: { plan: 'enterprise_plus' },
            }],
            error: null,
          }),
        };
      }

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        order: vi.fn().mockReturnThis(),
        data: [],
        error: null,
      };
    });

    const response = await getApps(new NextRequest('http://localhost/api/apps'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.apps.map((app: { slug: string }) => app.slug)).toContain('pre019-sdk-app');
  });
});
