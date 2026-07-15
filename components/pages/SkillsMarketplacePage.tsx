'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import SurfaceShell from '@/components/os/surface-shell';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import { formatCountLabel } from '@/src/data/discipline';
import type { SkillDiscoveryPayload, SkillMarketplaceRecord } from '@/src/skills/marketplace';
import {
  DeveloperSpotlight,
  LazyMarketplaceSection,
  ListingBanner,
  ListingMark,
  MarketplaceHero,
} from '@/components/marketplace/MarketplacePrimitives';

const EMPTY_DISCOVERY: SkillDiscoveryPayload = {
  skills: [],
  categories: [],
  installedSlugs: [],
  sections: [],
  hero: [],
  developerSpotlight: [],
};

const SKILL_FILTERS = ['All', 'Free', 'Paid', 'Needs permission', 'Vault required', 'Verified', 'Installed'] as const;
const SKILL_SORTS = ['Recommended', 'Recent', 'Name', 'Installs'] as const;

type SkillFilter = typeof SKILL_FILTERS[number];
type SkillSort = typeof SKILL_SORTS[number];

function capabilityLabel(skill: SkillMarketplaceRecord): string {
  const count = skill.capabilities.length;
  return `${count} ${count === 1 ? 'capability' : 'capabilities'}`;
}

function capabilityTags(skill: SkillMarketplaceRecord): string[] {
  const names = skill.capabilities
    .map(item => typeof item.name === 'string' ? item.name : '')
    .filter(Boolean);
  return (names.length ? names : skill.tags).slice(0, 3);
}

function pricingLabel(skill: SkillMarketplaceRecord): string {
  if (skill.pricing_model === 'free' || skill.price_per_call <= 0) return 'Free';
  if (skill.pricing_model === 'per_call') return `$${skill.price_per_call.toFixed(2)}/call`;
  return 'Usage priced';
}

function permissionLabel(skill: SkillMarketplaceRecord): string {
  if (skill.required_secrets.length > 0) return 'Vault required';
  if (skill.permissions_required.length > 0) return `${skill.permissions_required.length} permission${skill.permissions_required.length === 1 ? '' : 's'}`;
  return 'No permissions';
}

function SkillCard(props: {
  skill: SkillMarketplaceRecord;
  installed: boolean;
  working: boolean;
  onInstall: (skill: SkillMarketplaceRecord) => void;
}) {
  const { skill, installed, working } = props;
  return (
    <article className="market-store-card">
      <Link href={`/skills/${skill.slug}`} className="market-store-card-link">
        <ListingBanner name={skill.name} imageUrl={skill.banner_url} />
        <div className="market-store-card-main">
          <ListingMark name={skill.name} imageUrl={skill.icon_url} />
          <div>
            <h3>{skill.name}</h3>
            <p>{skill.description}</p>
          </div>
        </div>
      </Link>
      <Link href={`/developer/${skill.developer_handle}`} className="market-card-developer">{skill.author_name}</Link>
      <div className="market-card-badges" aria-label={`${skill.name} status`}>
        {installed ? <span>Installed</span> : null}
        {skill.verified ? <span>Verified</span> : null}
        <span>{pricingLabel(skill)}</span>
        <span>{permissionLabel(skill)}</span>
      </div>
      <div className="market-card-facts">
        <span>{skill.category}</span>
        <span>v{skill.version}</span>
        <span>{formatCountLabel(skill.total_installs, 'install', 'installs')}</span>
        <span>{capabilityLabel(skill)}</span>
      </div>
      <div className="market-card-facts" aria-label={`${skill.name} compatibility`}>
        {skill.compatibility.slice(0, 3).map(item => <span key={item}>{item}</span>)}
      </div>
      <div className="market-card-facts" aria-label={`${skill.name} capability tags`}>
        {capabilityTags(skill).map(tag => <span key={tag}>{tag}</span>)}
      </div>
      <div className="market-card-actions">
        {installed ? (
          <>
            <Link href={`/skills/${skill.slug}`} className="market-primary-action" data-action="open">Use skill</Link>
            <Link href="/skills" className="market-secondary-action" data-action="library">Library</Link>
          </>
        ) : (
          <button
            type="button"
            className="market-primary-action"
            data-action="add"
            disabled={working}
            onClick={() => props.onInstall(skill)}
          >
            {working ? 'Adding...' : 'Add skill'}
          </button>
        )}
      </div>
    </article>
  );
}

function SkillRow(props: {
  title: string;
  reason?: string;
  skills: SkillMarketplaceRecord[];
  installed: Set<string>;
  workingSlug: string;
  onInstall: (skill: SkillMarketplaceRecord) => void;
}) {
  if (props.skills.length === 0) return null;
  return (
    <LazyMarketplaceSection title={props.title} reason={props.reason}>
      <div className="market-horizontal-row market-skill-row">
        {props.skills.map(skill => (
          <SkillCard
            key={skill.id}
            skill={skill}
            installed={props.installed.has(skill.slug)}
            working={props.workingSlug === skill.slug}
            onInstall={props.onInstall}
          />
        ))}
      </div>
    </LazyMarketplaceSection>
  );
}

export default function SkillsMarketplacePage() {
  const cache = useRef(new Map<string, SkillDiscoveryPayload>());
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [discovery, setDiscovery] = useState<SkillDiscoveryPayload>(EMPTY_DISCOVERY);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<SkillFilter>('All');
  const [sort, setSort] = useState<SkillSort>('Recommended');
  const [workingSlug, setWorkingSlug] = useState('');
  const [notice, setNotice] = useState('');
  const [heroIndex, setHeroIndex] = useState(0);

  const load = useCallback(async () => {
    const key = `${search.trim()}::${category}`;
    const cached = cache.current.get(key);
    if (cached) {
      setDiscovery(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('search', search.trim());
      if (category !== 'All') query.set('category', category);
      const [res, currentSession] = await Promise.all([
        fetch(`/api/skills/discovery?${query.toString()}`, { cache: 'no-store' }),
        fetchBrowserSession().catch(() => null),
      ]);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as { error?: string; message?: string };
        throw new Error(payload.error ?? payload.message ?? 'Skill discovery unavailable');
      }
      const payload = await res.json() as SkillDiscoveryPayload;
      cache.current.set(key, payload);
      setDiscovery(payload);
      setSession(currentSession);
    } catch {
      setError('Skill discovery is unavailable right now.');
      setDiscovery(EMPTY_DISCOVERY);
    } finally {
      setLoading(false);
    }
  }, [category, search]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 120);
    return () => window.clearTimeout(id);
  }, [load]);

  useEffect(() => {
    if (discovery.hero.length <= 1) return;
    const id = window.setInterval(() => setHeroIndex(index => (index + 1) % discovery.hero.length), 6500);
    return () => window.clearInterval(id);
  }, [discovery.hero.length]);

  const categories = useMemo(() => ['All', ...discovery.categories], [discovery.categories]);
  const installed = useMemo(() => new Set(discovery.installedSlugs), [discovery.installedSlugs]);
  const hero = discovery.hero[heroIndex % Math.max(discovery.hero.length, 1)] ?? discovery.skills[0] ?? null;
  const displayedSkills = useMemo(() => {
    const filtered = discovery.skills.filter(skill => {
      if (filter === 'Free') return skill.pricing_model === 'free' || skill.price_per_call <= 0;
      if (filter === 'Paid') return skill.pricing_model !== 'free' && skill.price_per_call > 0;
      if (filter === 'Needs permission') return skill.permissions_required.length > 0;
      if (filter === 'Vault required') return skill.required_secrets.length > 0;
      if (filter === 'Verified') return skill.verified;
      if (filter === 'Installed') return installed.has(skill.slug);
      return true;
    });
    return [...filtered].sort((left, right) => {
      if (sort === 'Recent') return right.updated_at.localeCompare(left.updated_at);
      if (sort === 'Name') return left.name.localeCompare(right.name);
      if (sort === 'Installs') return right.total_installs - left.total_installs;
      const installedDelta = (installed.has(right.slug) ? 1 : 0) - (installed.has(left.slug) ? 1 : 0);
      if (installedDelta !== 0) return installedDelta;
      return (right.verified ? 1 : 0) - (left.verified ? 1 : 0) || right.total_installs - left.total_installs;
    });
  }, [discovery.skills, filter, installed, sort]);
  const focusedDiscovery = search.trim() || filter !== 'All' || sort !== 'Recommended';

  async function installSkill(skill: SkillMarketplaceRecord) {
    setWorkingSlug(skill.slug);
    setNotice('');
    try {
      const response = await fetch('/api/skills/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: skill.slug,
          permissionsApproved: skill.permissions_required,
          installDependencies: true,
          dependencyPermissionsApproved: Object.fromEntries(skill.required_skills.map(ref => [ref, []])),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(payload.error ?? payload.message ?? 'Add skill failed');
        return;
      }
      cache.current.clear();
      setNotice(`${skill.name} installed and available to Super AgentOS.`);
      await load();
    } finally {
      setWorkingSlug('');
    }
  }

  return (
    <SurfaceShell
      activePath="/skillstore"
      title="Skill Store"
      subtitle="Discover installable capabilities for Super AgentOS, apps, workflows, and incognito subagents."
      actions={session?.capabilities?.includes('create_skill') ? <Link href="/publish/skill" className="market-secondary-action" data-action="publish">Publish Skill</Link> : undefined}
    >
      <div className="market-shell" data-surface="skills">
        <div className="market-search-panel">
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search skills, developers, capabilities, tags, categories"
            aria-label="Search skills"
          />
        </div>

        <div className="market-chip-row" aria-label="Skill categories">
          {categories.map(item => (
            <button key={item} type="button" className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>
              {item}
            </button>
          ))}
        </div>

        <div className="market-filter-row" aria-label="Skill filters and sorting">
          <label>
            <span>Filter</span>
            <select value={filter} onChange={event => setFilter(event.target.value as SkillFilter)}>
              {SKILL_FILTERS.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select value={sort} onChange={event => setSort(event.target.value as SkillSort)}>
              {SKILL_SORTS.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>

        {hero ? (
          <MarketplaceHero
            bannerUrl={hero.banner_url}
            logoUrl={hero.icon_url}
            eyebrow="Featured Skill"
            name={hero.name}
            description={hero.long_description || hero.description}
            developerHref={`/developer/${hero.developer_handle}`}
            developerName={hero.author_name}
            metadata={[hero.category, pricingLabel(hero), permissionLabel(hero), capabilityLabel(hero), formatCountLabel(hero.total_installs, 'install', 'installs')]}
            primaryLabel={workingSlug === hero.slug ? 'Adding...' : installed.has(hero.slug) ? 'Use skill' : 'Add skill'}
            primaryDisabled={workingSlug === hero.slug}
            secondaryHref={`/skills/${hero.slug}`}
            secondaryLabel="Details"
            onPrimary={() => installed.has(hero.slug) ? window.location.assign(`/skills/${hero.slug}`) : void installSkill(hero)}
          />
        ) : null}

        {notice ? <div className="market-notice">{notice}</div> : null}
        {error ? <div className="market-notice error" role="alert">{error}</div> : null}

        {loading ? (
          <div className="market-skeleton-grid">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="market-skeleton" />)}
          </div>
        ) : displayedSkills.length === 0 ? (
          <div className="market-empty">
            <h2>No skills found</h2>
            <p>{search.trim() || filter !== 'All' ? 'No accessible capabilities matched the current search and filters.' : 'No published skills are available from the backend yet.'}</p>
            <Link href="/studio" className="market-secondary-action" data-action="open">Open Super AgentOS</Link>
          </div>
        ) : focusedDiscovery ? (
          <SkillRow title="Skill Results" skills={displayedSkills} installed={installed} workingSlug={workingSlug} onInstall={skill => void installSkill(skill)} />
        ) : (
          <>
            {discovery.sections.map(section => (
              <SkillRow
                key={section.id}
                title={section.title}
                reason={section.reason}
                skills={section.skills}
                installed={installed}
                workingSlug={workingSlug}
                onInstall={skill => void installSkill(skill)}
              />
            ))}
            <DeveloperSpotlight developers={discovery.developerSpotlight} />
          </>
        )}
      </div>
    </SurfaceShell>
  );
}
