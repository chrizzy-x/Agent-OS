import type { AgentAppListing } from '../appstore/catalog.js';
import { listAgentApps } from '../appstore/service.js';
import { listSkillDiscovery, type SkillMarketplaceRecord } from '../skills/marketplace.js';
import { getSupabaseAdmin } from '../storage/supabase.js';

export type PublicDeveloperProfile = {
  handle: string;
  name: string;
  bio: string | null;
  website: string | null;
  appsPublished: number;
  skillsPublished: number;
  followers: number;
  totalDownloads: number;
  totalActiveUsers: number;
  apps: AgentAppListing[];
  skills: SkillMarketplaceRecord[];
};

function handle(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function storedProfile(profileHandle: string): Promise<{ name?: string; bio?: string | null; website?: string | null; followers?: number; downloads?: number; activeUsers?: number } | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('developer_profiles')
      .select('handle,display_name,bio,website,followers_count,total_downloads,total_active_users')
      .eq('handle', profileHandle)
      .maybeSingle();
    if (!error && data) {
      const row = data as Record<string, unknown>;
      return {
        name: String(row.display_name ?? profileHandle),
        bio: typeof row.bio === 'string' ? row.bio : null,
        website: typeof row.website === 'string' ? row.website : null,
        followers: Number(row.followers_count ?? 0),
        downloads: Number(row.total_downloads ?? 0),
        activeUsers: Number(row.total_active_users ?? 0),
      };
    }
  } catch {
    // Derived profile below.
  }
  return null;
}

export async function getPublicDeveloperProfile(profileHandle: string): Promise<PublicDeveloperProfile | null> {
  const normalized = handle(profileHandle);
  if (!normalized) return null;
  const [profile, apps, skillDiscovery] = await Promise.all([
    storedProfile(normalized),
    listAgentApps({ sort: 'popular' }).catch(() => []),
    listSkillDiscovery().catch(() => ({ skills: [] as SkillMarketplaceRecord[], categories: [], installedSlugs: [], sections: [] })),
  ]);
  const developerApps = apps.filter(app => app.developerHandle === normalized || handle(app.publisherName) === normalized);
  const developerSkills = skillDiscovery.skills.filter(skill => skill.developer_handle === normalized || handle(skill.author_name) === normalized);
  if (!profile && developerApps.length === 0 && developerSkills.length === 0) return null;
  const name = profile?.name
    ?? developerApps[0]?.publisherName
    ?? developerSkills[0]?.author_name
    ?? normalized;
  return {
    handle: normalized,
    name,
    bio: profile?.bio ?? null,
    website: profile?.website ?? null,
    appsPublished: developerApps.length,
    skillsPublished: developerSkills.length,
    followers: profile?.followers ?? 0,
    totalDownloads: profile?.downloads ?? developerApps.reduce((sum, app) => sum + app.downloadCount, 0),
    totalActiveUsers: profile?.activeUsers ?? developerApps.reduce((sum, app) => sum + app.activeUserCount, 0),
    apps: developerApps,
    skills: developerSkills,
  };
}
