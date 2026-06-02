'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import {
  AppShell,
  Badge,
  Button,
  EmptyState,
  FilterChips,
  LoadingState,
  PageHeader,
  SearchBar,
  SidebarNav,
  SidebarSection,
  SkillCard,
} from '@/components/os/ui';

type Skill = {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  total_installs: number;
  rating: number;
  verified: boolean;
};

const CATEGORIES = ['All', 'AI Search', 'Data Analysis', 'Code Interpreter', 'File Analysis', 'Browser Automation', 'Database Query', 'Email Sender', 'Image Generator', 'Research', 'Dev Tools'];

export default function SkillsMarketplacePage() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [installed, setInstalled] = useState<Array<{ skill: Skill }>>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [skillsRes, currentSession] = await Promise.all([
        fetch('/api/skills?sort=popular&limit=50', { cache: 'no-store' }),
        fetchBrowserSession().catch(() => null),
      ]);
      const skillsData = await skillsRes.json();
      setSkills(skillsData.skills ?? []);
      setSession(currentSession);
      if (currentSession) {
        const installedRes = await fetch('/api/skills/installed', { cache: 'no-store' });
        const installedData = await installedRes.json();
        setInstalled(installedData.installed_skills ?? []);
      } else {
        setInstalled([]);
      }
    } catch {
      setSkills([]);
      setInstalled([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => skills.filter(skill => {
      const categoryMatch = category === 'All' || `${skill.category} ${skill.description}`.toLowerCase().includes(category.toLowerCase());
      const searchMatch = !search || `${skill.name} ${skill.description} ${skill.category}`.toLowerCase().includes(search.toLowerCase());
      return categoryMatch && searchMatch;
    }),
    [category, search, skills],
  );

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/skills" />
      <AppShell
        activePath="/skills"
        sidebar={(
          <>
            <SidebarSection title="Marketplace">
              <SidebarNav
                items={[
                  { href: '/studio', label: 'Studio' },
                  { href: '/skills', label: 'Skills', active: true },
                  { href: '/appstore', label: 'Appstore' },
                  ...(session?.capabilities?.includes('access_developer_console') ? [{ href: '/developer', label: 'Developer' }] : []),
                  { href: '/settings', label: 'Settings' },
                ]}
              />
            </SidebarSection>
            <SidebarSection title="Categories">
              <FilterChips items={CATEGORIES} active={category} onChange={setCategory} />
            </SidebarSection>
          </>
        )}
        aside={(
          <>
            <SidebarSection title="Installed skills">
              {installed.length === 0 ? (
                <div className="os-empty-body">No installed skills yet.</div>
              ) : (
                <SidebarNav items={installed.slice(0, 6).map(entry => ({
                  href: `/skills/${entry.skill.slug}`,
                  label: entry.skill.name,
                  subtitle: entry.skill.category,
                }))} />
              )}
            </SidebarSection>
            <SidebarSection title="Published now">
              {skills.length === 0 ? (
                <div className="os-empty-body">No published skills yet.</div>
              ) : (
                <SidebarNav items={skills.slice(0, 5).map(skill => ({
                  href: `/skills/${skill.slug}`,
                  label: skill.name,
                  subtitle: `${skill.total_installs.toLocaleString()} installs`,
                }))} />
              )}
            </SidebarSection>
          </>
        )}
      >
        <PageHeader
          eyebrow="Skill marketplace"
          title="Skill Marketplace"
          subtitle="Only real published skills appear here. Install focused capabilities for search, analysis, browser automation, code execution, and research."
          actions={session?.capabilities?.includes('create_skill') ? <Button href="/developer" variant="secondary">Publish skill</Button> : undefined}
        />

        <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search skills, categories, permissions..." />
        <FilterChips items={CATEGORIES} active={category} onChange={setCategory} />

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {[0, 1, 2].map(item => <LoadingState key={item} label="Loading skills" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={skills.length === 0 ? 'No published skills yet' : 'No skills found'}
            body={skills.length === 0 ? 'This marketplace stays empty until a real skill is published.' : 'Try another search or category.'}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {filtered.map(skill => {
              const installedMatch = installed.some(entry => entry.skill.slug === skill.slug);
              return (
                <SkillCard
                  key={skill.id}
                  href={`/skills/${skill.slug}`}
                  title={skill.name}
                  description={skill.description}
                  category={skill.category}
                  installs={skill.total_installs}
                  rating={skill.rating > 0 ? skill.rating : undefined}
                  footer={(
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {skill.verified ? <Badge tone="success">Verified</Badge> : null}
                        <Badge tone="default">{installedMatch ? 'Installed' : 'Available'}</Badge>
                      </div>
                      <Link href={`/skills/${skill.slug}`} className="btn-primary">{installedMatch ? 'Open' : 'Install'}</Link>
                    </div>
                  )}
                />
              );
            })}
          </div>
        )}
      </AppShell>
    </div>
  );
}
