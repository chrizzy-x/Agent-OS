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
    lastHeartbeatAt: null,
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
});
