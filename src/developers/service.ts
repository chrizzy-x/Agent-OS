import type { AgentAppListing } from '../appstore/catalog.js';
import { listAgentApps } from '../appstore/service.js';
import { listSkillDiscovery, type SkillMarketplaceRecord } from '../skills/marketplace.js';
import { getSupabaseAdmin } from '../storage/supabase.js';

export type PublicDeveloperProfile = {
  handle: string;
  name: string;
  logoUrl: string | null;
  bio: string | null;
  website: string | null;
  socials: Record<string, string>;
  appsPublished: number;
  skillsPublished: number;
  followers: number;
  totalDownloads: number;
  totalActiveUsers: number;
  averageRating: number;
  ratingsCount: number;
  verificationStatus: 'unverified' | 'verified' | 'trusted' | 'partner';
  recentReleases: Array<{ type: 'app' | 'skill'; name: string; href: string; updatedAt: string }>;
  apps: AgentAppListing[];
  skills: SkillMarketplaceRecord[];
};

function handle(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function storedProfile(profileHandle: string): Promise<{
  name?: string;
  logoUrl?: string | null;
  bio?: string | null;
  website?: string | null;
  socials?: Record<string, string>;
  followers?: number;
  downloads?: number;
  activeUsers?: number;
  averageRating?: number;
  ratingsCount?: number;
  verificationStatus?: 'unverified' | 'verified' | 'trusted' | 'partner';
} | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('developer_profiles')
      .select('handle,display_name,logo_url,bio,website,socials,followers_count,total_downloads,total_active_users,average_rating,ratings_count,verification_status')
      .eq('handle', profileHandle)
      .maybeSingle();
    if (!error && data) {
      const row = data as Record<string, unknown>;
      return {
        name: String(row.display_name ?? profileHandle),
        logoUrl: typeof row.logo_url === 'string' ? row.logo_url : null,
        bio: typeof row.bio === 'string' ? row.bio : null,
        website: typeof row.website === 'string' ? row.website : null,
        socials: row.socials && typeof row.socials === 'object' && !Array.isArray(row.socials) ? row.socials as Record<string, string> : {},
        followers: Number(row.followers_count ?? 0),
        downloads: Number(row.total_downloads ?? 0),
        activeUsers: Number(row.total_active_users ?? 0),
        averageRating: Number(row.average_rating ?? 0),
        ratingsCount: Number(row.ratings_count ?? 0),
        verificationStatus: row.verification_status === 'verified' || row.verification_status === 'trusted' || row.verification_status === 'partner'
          ? row.verification_status
          : 'unverified',
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
    listSkillDiscovery().catch(() => ({ skills: [] as SkillMarketplaceRecord[], categories: [], installedSlugs: [], sections: [], hero: [], developerSpotlight: [] })),
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
    logoUrl: profile?.logoUrl ?? null,
    bio: profile?.bio ?? null,
    website: profile?.website ?? null,
    socials: profile?.socials ?? {},
    appsPublished: developerApps.length,
    skillsPublished: developerSkills.length,
    followers: profile?.followers ?? 0,
    totalDownloads: profile?.downloads ?? developerApps.reduce((sum, app) => sum + app.downloadCount, 0),
    totalActiveUsers: profile?.activeUsers ?? developerApps.reduce((sum, app) => sum + app.activeUserCount, 0),
    averageRating: profile?.averageRating ?? (() => {
      const ratings = [...developerApps.map(app => app.rating), ...developerSkills.map(skill => skill.rating)].filter(value => value > 0);
      return ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0;
    })(),
    ratingsCount: profile?.ratingsCount ?? developerApps.reduce((sum, app) => sum + app.reviewCount, 0) + developerSkills.reduce((sum, skill) => sum + skill.review_count, 0),
    verificationStatus: profile?.verificationStatus ?? (developerApps.some(app => app.verified) || developerSkills.some(skill => skill.verified) ? 'verified' : 'unverified'),
    recentReleases: [
      ...developerApps.map(app => ({ type: 'app' as const, name: app.name, href: `/appstore/${app.slug}`, updatedAt: app.updatedAt })),
      ...developerSkills.map(skill => ({ type: 'skill' as const, name: skill.name, href: `/skills/${skill.slug}`, updatedAt: skill.updated_at })),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 8),
    apps: developerApps,
    skills: developerSkills,
  };
}
