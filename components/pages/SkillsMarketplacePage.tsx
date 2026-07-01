'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import SurfaceShell from '@/components/os/surface-shell';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import type { SkillDiscoveryPayload, SkillMarketplaceRecord } from '@/src/skills/marketplace';
import {
  DeveloperSpotlight,
  formatMarketplaceCount,
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
      <div className="market-card-facts">
        <span>{skill.category}</span>
        <span>v{skill.version}</span>
        <span>{formatMarketplaceCount(skill.total_installs)} installs</span>
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
            <Link href={`/skills/${skill.slug}`} className="market-primary-action">Use</Link>
            <Link href="/skills" className="market-secondary-action">Manage</Link>
          </>
        ) : (
          <button
            type="button"
            className="market-primary-action"
            disabled={working}
            onClick={() => props.onInstall(skill)}
          >
            {working ? 'Installing' : 'Install'}
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
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('search', search.trim());
      if (category !== 'All') query.set('category', category);
      const [res, currentSession] = await Promise.all([
        fetch(`/api/skills/discovery?${query.toString()}`, { cache: 'no-store' }),
        fetchBrowserSession().catch(() => null),
      ]);
      const payload = res.ok ? await res.json() as SkillDiscoveryPayload : EMPTY_DISCOVERY;
      cache.current.set(key, payload);
      setDiscovery(payload);
      setSession(currentSession);
    } catch {
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
        setNotice(payload.error ?? payload.message ?? 'Install failed');
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
      subtitle="Discover installable capabilities for Super AgentOS, apps, workflows, and private agents."
      actions={session?.capabilities?.includes('create_skill') ? <Link href="/publish/skill" className="market-secondary-action">Publish Skill</Link> : undefined}
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

        {hero ? (
          <MarketplaceHero
            bannerUrl={hero.banner_url}
            logoUrl={hero.icon_url}
            eyebrow="Featured Skill"
            name={hero.name}
            description={hero.long_description || hero.description}
            developerHref={`/developer/${hero.developer_handle}`}
            developerName={hero.author_name}
            metadata={[hero.category, capabilityLabel(hero), `${formatMarketplaceCount(hero.total_installs)} installs`]}
            primaryLabel={workingSlug === hero.slug ? 'Installing' : installed.has(hero.slug) ? 'Use' : 'Install'}
            primaryDisabled={workingSlug === hero.slug}
            secondaryHref={`/skills/${hero.slug}`}
            secondaryLabel="Details"
            onPrimary={() => installed.has(hero.slug) ? window.location.assign(`/skills/${hero.slug}`) : void installSkill(hero)}
          />
        ) : null}

        {notice ? <div className="market-notice">{notice}</div> : null}

        {loading ? (
          <div className="market-skeleton-grid">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="market-skeleton" />)}
          </div>
        ) : discovery.skills.length === 0 ? (
          <div className="market-empty">
            <h2>No skills found</h2>
            <p>No accessible capabilities matched this search.</p>
          </div>
        ) : search.trim() ? (
          <SkillRow title="Search Results" skills={discovery.skills} installed={installed} workingSlug={workingSlug} onInstall={skill => void installSkill(skill)} />
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
