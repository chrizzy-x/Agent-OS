'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import SurfaceShell from '@/components/os/surface-shell';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import type { SkillMarketplaceRecord } from '@/src/skills/marketplace';

type SkillDiscovery = {
  skills: SkillMarketplaceRecord[];
  categories: string[];
  installedSlugs: string[];
  sections: Array<{ id: string; title: string; skills: SkillMarketplaceRecord[] }>;
};

const EMPTY_DISCOVERY: SkillDiscovery = {
  skills: [],
  categories: [],
  installedSlugs: [],
  sections: [],
};

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function SkillRegistryCard(props: {
  skill: SkillMarketplaceRecord;
  installed: boolean;
  working: boolean;
  onInstall: (skill: SkillMarketplaceRecord) => void;
}) {
  const { skill, installed, working } = props;
  return (
    <article className="market-skill-card">
      <Link href={`/skills/${skill.slug}`} className="market-skill-main">
        <div>
          <h3>{skill.name}</h3>
          <p>{skill.description}</p>
        </div>
        <span>{skill.category}</span>
      </Link>
      <div className="market-skill-meta">
        <span>{formatCount(skill.total_installs)} installs</span>
        <span>{skill.rating > 0 ? skill.rating.toFixed(1) : 'New'} rating</span>
        <span>{skill.capabilities.length} capabilities</span>
      </div>
      <div className="market-skill-tags">
        {[skill.category, ...skill.tags].slice(0, 4).map(tag => <span key={tag}>{tag}</span>)}
      </div>
      <button
        type="button"
        className={installed ? 'market-secondary-action' : 'market-primary-action'}
        disabled={working || installed}
        onClick={() => props.onInstall(skill)}
      >
        {working ? 'Installing' : installed ? 'Installed' : 'Install'}
      </button>
    </article>
  );
}

function SkillSection(props: {
  title: string;
  skills: SkillMarketplaceRecord[];
  installed: Set<string>;
  workingSlug: string;
  onInstall: (skill: SkillMarketplaceRecord) => void;
}) {
  if (props.skills.length === 0) return null;
  return (
    <section className="market-section">
      <div className="market-section-head"><h2>{props.title}</h2></div>
      <div className="market-skill-grid">
        {props.skills.map(skill => (
          <SkillRegistryCard
            key={skill.id}
            skill={skill}
            installed={props.installed.has(skill.slug)}
            working={props.workingSlug === skill.slug}
            onInstall={props.onInstall}
          />
        ))}
      </div>
    </section>
  );
}

export default function SkillsMarketplacePage() {
  const cache = useRef(new Map<string, SkillDiscovery>());
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [discovery, setDiscovery] = useState<SkillDiscovery>(EMPTY_DISCOVERY);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [workingSlug, setWorkingSlug] = useState('');
  const [notice, setNotice] = useState('');

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
      const payload = res.ok ? await res.json() as SkillDiscovery : EMPTY_DISCOVERY;
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

  const categories = useMemo(() => ['All', ...discovery.categories], [discovery.categories]);
  const installed = useMemo(() => new Set(discovery.installedSlugs), [discovery.installedSlugs]);

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
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(payload.error ?? payload.message ?? 'Install failed');
        return;
      }
      cache.current.clear();
      setNotice(`${skill.name} installed and available to Super AgentOS, workflows, subagents, and apps.`);
      await load();
    } finally {
      setWorkingSlug('');
    }
  }

  return (
    <SurfaceShell
      activePath="/skills"
      title="Skill Store"
      subtitle="Discover and install capabilities for agents, workflows, apps, and Super AgentOS."
      actions={session?.capabilities?.includes('create_skill') ? <Link href="/developer" className="market-secondary-action">Publish Skill</Link> : undefined}
    >
      <div className="market-shell" data-surface="skills">
        <div className="market-search-panel">
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search skills, tags, developers, capabilities, categories"
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
          <SkillSection title="Search Results" skills={discovery.skills} installed={installed} workingSlug={workingSlug} onInstall={skill => void installSkill(skill)} />
        ) : (
          discovery.sections.map(section => (
            <SkillSection key={section.id} title={section.title} skills={section.skills} installed={installed} workingSlug={workingSlug} onInstall={skill => void installSkill(skill)} />
          ))
        )}
      </div>
    </SurfaceShell>
  );
}
