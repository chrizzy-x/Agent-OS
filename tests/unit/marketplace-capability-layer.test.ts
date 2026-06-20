import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import type { AgentAppListing } from '../../src/appstore/catalog.js';
import { rankAppStoreResults } from '../../src/appstore/discovery.js';
import { buildSkillPreview, mapSkillMarketplaceRecord } from '../../src/skills/marketplace.js';

function app(overrides: Partial<AgentAppListing>): AgentAppListing {
  const now = '2026-06-20T00:00:00.000Z';
  return {
    id: overrides.slug ?? 'app',
    workspaceId: null,
    name: 'App',
    slug: 'app',
    category: 'Productivity',
    description: 'AgentOS app',
    longDescription: 'AgentOS app',
    logoUrl: null,
    publisherId: 'publisher-1',
    publisherName: 'AgentOS Developer',
    developerHandle: 'agentos-developer',
    appUrl: null,
    repositoryUrl: null,
    deviceTargets: ['AgentOS Cloud'],
    platforms: ['Web'],
    manifest: {
      schemaVersion: 'agentos.app.v1',
      version: '1.0.0',
      runtime: 'agentos-app',
      entrypoint: '/app',
      primitives: [],
      skills: [],
      requiredSkills: [],
      bundledSkills: [],
      permissions: [],
      requiredSecrets: [],
      commands: [],
    },
    defaultConfig: {},
    permissionsRequired: [],
    requiredSecrets: [],
    screenshots: [],
    keywords: [],
    tags: [],
    features: [],
    source: 'internal',
    visibility: 'public',
    runtimeType: 'agentos-app',
    kernelProduct: null,
    kernelCommandTopic: null,
    kernelStatusTopic: null,
    distribution: { webUrl: null, androidUrl: null, iosUrl: null },
    healthStatus: 'online',
    endpointStatus: 'healthy',
    lastHeartbeatAt: null,
    lastCommandAt: null,
    lastError: null,
    disabled: false,
    heartbeatCount: 0,
    openCount: 0,
    webOpenCount: 0,
    androidDownloadCount: 0,
    iosDownloadCount: 0,
    installCount: 0,
    downloadCount: 0,
    activeUserCount: 0,
    rating: 0,
    reviewCount: 0,
    verified: false,
    published: true,
    createdAt: now,
    updatedAt: now,
    versionHistory: [],
    ...overrides,
  };
}

describe('v6.6.4 marketplace capability layer', () => {
  it('ranks app search by exact match before ownership and activity', () => {
    const exact = app({ name: 'Derek', slug: 'derek', installCount: 1 });
    const installed = app({ name: 'Research Derek Tools', slug: 'research-tools', installCount: 500 });
    const trending = app({ name: 'Trading Desk', slug: 'trading-desk', installCount: 2_000, openCount: 3_000 });

    const ranked = rankAppStoreResults({
      apps: [trending, installed, exact],
      query: 'Derek',
      installedSlugs: ['research-tools'],
    });

    expect(ranked.map(item => item.slug)).toEqual(['derek', 'research-tools', 'trading-desk']);
  });

  it('normalizes skill dependencies, compatibility, and execution preview', () => {
    const skill = mapSkillMarketplaceRecord({
      id: 'skill-1',
      name: 'Research Skill',
      slug: 'research-skill',
      author_name: 'Research Labs',
      category: 'Research',
      description: 'Search and summarize sources.',
      published: true,
      permissions_required: ['Internet', 'Browser'],
      dependencies: { required: ['browser-skill'], optional: ['data-skill'] },
      capabilities: [{ name: 'search', description: 'Search sources', params: { query: 'string' }, returns: 'summary' }],
      examples: [{ input: { query: 'AgentOS' }, output: { summary: 'AgentOS result' } }],
    });

    expect(skill.developer_handle).toBe('research-labs');
    expect(skill.required_skills).toEqual(['browser-skill']);
    expect(skill.optional_skills).toEqual(['data-skill']);
    expect(skill.compatibility).toEqual(['Super AgentOS', 'Workflows', 'Subagents', 'Apps']);
    expect(buildSkillPreview(skill)).toMatchObject({
      inputExample: { query: 'AgentOS' },
      outputExample: { summary: 'AgentOS result' },
      executionExample: { skill: 'research-skill', capability: 'search' },
    });
  });

  it('ships migration tables for ownership and workspace asset sync', () => {
    const sql = readFileSync('src/storage/migrations/030_v664_marketplace_capability_layer.sql', 'utf8');
    expect(sql).toContain('marketplace_ownership');
    expect(sql).toContain('workspace_asset_registry');
    expect(sql).toContain('developer_profiles');
    expect(sql).toContain('skill_version_history');
    expect(sql).toContain('app_reviews');
  });
});
