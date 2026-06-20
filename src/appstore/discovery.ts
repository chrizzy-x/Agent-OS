import { scoreSearchMatch } from '../search/scoring.js';
import type { AgentAppInstallation, AgentAppListing } from './catalog.js';
import { installAgentApp, listAgentApps, listInstalledAgentApps, updateAgentAppInstallation } from './service.js';

export const APP_STORE_CATEGORIES = [
  'Finance',
  'Trading',
  'Research',
  'AI',
  'Productivity',
  'Development',
  'Social',
  'Utilities',
  'Enterprise',
];

export type AppDiscoverySection = {
  id: string;
  title: string;
  reason?: string;
  apps: AgentAppListing[];
};

export type AppDiscoveryPayload = {
  apps: AgentAppListing[];
  installedSlugs: string[];
  categories: string[];
  sections: AppDiscoverySection[];
  hero: AgentAppListing[];
};

function activityScore(app: AgentAppListing): number {
  return app.installCount * 2
    + app.openCount
    + app.downloadCount
    + app.webOpenCount
    + app.androidDownloadCount
    + app.iosDownloadCount
    + app.heartbeatCount;
}

function developerReputationScore(app: AgentAppListing): number {
  return app.rating * 20 + app.reviewCount * 2 + Math.min(app.installCount, 1000) / 10;
}

export function rankAppStoreResults(params: {
  apps: AgentAppListing[];
  query?: string | null;
  installedSlugs?: string[];
  recommendedSlugs?: string[];
}): AgentAppListing[] {
  const query = params.query?.trim().toLowerCase() ?? '';
  const installed = new Set(params.installedSlugs ?? []);
  const recommended = new Set(params.recommendedSlugs ?? []);

  return [...params.apps].sort((left, right) => {
    const exactLeft = query && left.name.toLowerCase() === query ? 1 : 0;
    const exactRight = query && right.name.toLowerCase() === query ? 1 : 0;
    if (exactLeft !== exactRight) return exactRight - exactLeft;

    const installedLeft = installed.has(left.slug) ? 1 : 0;
    const installedRight = installed.has(right.slug) ? 1 : 0;
    if (installedLeft !== installedRight) return installedRight - installedLeft;

    const trendingDelta = activityScore(right) - activityScore(left);
    if (trendingDelta !== 0) return trendingDelta;

    const recommendedLeft = recommended.has(left.slug) ? 1 : 0;
    const recommendedRight = recommended.has(right.slug) ? 1 : 0;
    if (recommendedLeft !== recommendedRight) return recommendedRight - recommendedLeft;

    const reputationDelta = developerReputationScore(right) - developerReputationScore(left);
    if (reputationDelta !== 0) return reputationDelta;

    if (query) {
      const categoryDelta = scoreSearchMatch(query, right.category) - scoreSearchMatch(query, left.category);
      if (categoryDelta !== 0) return categoryDelta;
      const keywordDelta = scoreSearchMatch(query, right.keywords.join(' '), right.tags.join(' '), right.description)
        - scoreSearchMatch(query, left.keywords.join(' '), left.tags.join(' '), left.description);
      if (keywordDelta !== 0) return keywordDelta;
    }

    return left.name.localeCompare(right.name);
  });
}

function uniqueBySlug(apps: AgentAppListing[]): AgentAppListing[] {
  const seen = new Set<string>();
  return apps.filter(app => {
    if (seen.has(app.slug)) return false;
    seen.add(app.slug);
    return true;
  });
}

function top(apps: AgentAppListing[], count: number): AgentAppListing[] {
  return uniqueBySlug(apps).slice(0, count);
}

function recommendationReason(installedApps: Array<{ app: AgentAppListing }>): string {
  const first = installedApps[0]?.app;
  if (!first) return 'Based on AgentOS activity';
  if (first.category) return `Because you installed ${first.name}`;
  return 'Based on your installed apps';
}

export async function getAppStoreDiscovery(params: {
  viewerAgentId?: string | null;
  viewerWorkspaceIds?: string[];
  query?: string | null;
  category?: string | null;
}): Promise<AppDiscoveryPayload> {
  const [apps, installed] = await Promise.all([
    listAgentApps({
      search: null,
      sort: 'popular',
      viewerAgentId: params.viewerAgentId ?? null,
      viewerWorkspaceIds: params.viewerWorkspaceIds ?? [],
    }),
    params.viewerAgentId ? listInstalledAgentApps(params.viewerAgentId).catch(() => []) : Promise.resolve([]),
  ]);

  const installedSlugs = installed.map(entry => entry.app.slug);
  const installedCategories = new Set(installed.map(entry => entry.app.category));
  const recommended = apps.filter(app => installedCategories.has(app.category) && !installedSlugs.includes(app.slug));
  const query = params.query?.trim() ?? '';
  const category = params.category?.trim();
  const searchable = apps.filter(app => {
    if (category && category !== 'All' && app.category.toLowerCase() !== category.toLowerCase()) return false;
    if (!query) return true;
    return scoreSearchMatch(query, app.name, app.publisherName, app.developerHandle, app.category, app.description, app.keywords.join(' '), app.tags.join(' ')) > 0;
  });
  const ranked = rankAppStoreResults({
    apps: searchable,
    query,
    installedSlugs,
    recommendedSlugs: recommended.map(app => app.slug),
  });
  const trending = [...apps].sort((left, right) => activityScore(right) - activityScore(left));
  const recentlyUpdated = [...apps].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const newReleases = [...apps].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const topInstalled = [...apps].sort((left, right) => right.installCount - left.installCount);

  const categorySections = APP_STORE_CATEGORIES.map(item => ({
    id: `category-${item.toLowerCase()}`,
    title: item,
    apps: top(apps.filter(app => app.category.toLowerCase() === item.toLowerCase()), 12),
  })).filter(section => section.apps.length > 0);

  const featured = top(apps.filter(app => app.verified || app.rating >= 4), 12);
  const sections: AppDiscoverySection[] = [
    { id: 'featured', title: 'Featured', apps: featured },
    { id: 'trending', title: 'Trending', apps: top(trending, 12) },
    { id: 'recommended', title: 'Recommended For You', reason: recommendationReason(installed), apps: top(recommended.length ? recommended : ranked, 12) },
    { id: 'new', title: 'New Releases', apps: top(newReleases, 12) },
    { id: 'updated', title: 'Recently Updated', apps: top(recentlyUpdated, 12) },
    { id: 'top-installed', title: 'Top Installed', apps: top(topInstalled, 12) },
    ...categorySections,
  ];

  return {
    apps: ranked,
    installedSlugs,
    categories: APP_STORE_CATEGORIES,
    sections,
    hero: top(featured.length ? featured : trending, 5),
  };
}

export async function listAppUpdates(agentId: string): Promise<Array<{
  app: AgentAppListing;
  installation: AgentAppInstallation;
  currentVersion: string;
  installedVersion: string | null;
  releaseNotes: string | null;
}>> {
  const installed = await listInstalledAgentApps(agentId);
  return installed
    .filter(entry => entry.installation.updateAvailable)
    .map(entry => {
      const currentVersion = entry.app.manifest.version;
      const notes = entry.app.versionHistory.find(item => item.version === currentVersion)?.changeSummary ?? null;
      return {
        app: entry.app,
        installation: entry.installation,
        currentVersion,
        installedVersion: entry.installation.installedVersion,
        releaseNotes: notes,
      };
    });
}

export async function updateAllApps(params: {
  agentId: string;
  workspaceId?: string | null;
  permissionsBySlug?: Record<string, string[]>;
}): Promise<Array<{ app: AgentAppListing; installation: AgentAppInstallation }>> {
  const updates = await listAppUpdates(params.agentId);
  const results: Array<{ app: AgentAppListing; installation: AgentAppInstallation }> = [];
  for (const item of updates) {
    results.push(await installAgentApp({
      agentId: params.agentId,
      slug: item.app.slug,
      workspaceId: params.workspaceId ?? item.installation.workspaceId,
      permissionsApproved: params.permissionsBySlug?.[item.app.slug] ?? item.installation.permissionsApproved,
    }));
  }
  return results;
}

export async function rollbackAppVersion(params: {
  agentId: string;
  slug: string;
  version?: string | null;
}): Promise<{ app: AgentAppListing; installation: AgentAppInstallation; rolledBackTo: string }> {
  const installed = (await listInstalledAgentApps(params.agentId)).find(entry => entry.app.slug === params.slug);
  if (!installed) throw new Error('App is not installed');
  const target = params.version?.trim()
    || installed.app.versionHistory.find(entry => entry.version !== installed.app.manifest.version)?.version
    || installed.installation.installedVersion
    || installed.app.manifest.version;
  const result = await updateAgentAppInstallation({
    agentId: params.agentId,
    slug: params.slug,
    status: 'active',
    permissionsApproved: installed.installation.permissionsApproved,
    installedVersion: target,
  });
  return { ...result, rolledBackTo: target };
}
