'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import SurfaceShell from '@/components/os/surface-shell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChips,
  LoadingState,
  SearchBar,
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
    <SurfaceShell
      activePath="/skills"
      title="Skills"
      subtitle="Install capabilities your Super AgentOS can use."
      actions={session?.capabilities?.includes('create_skill') ? <Button href="/developer" variant="secondary">Publish skill</Button> : undefined}
    >
      <Card style={{ marginBottom: 16 }}>
        <nav className="os-inline-actions" aria-label="Skills module">
          <Link href="/skills" className="btn-primary">Discovery</Link>
          <Link href="/skills/installed" className="btn-ghost">Installed Skills</Link>
          <a href="#skill-categories" className="btn-ghost">Categories</a>
          <Link href="/developer" className="btn-ghost">Management</Link>
        </nav>
      </Card>
      {session ? (
        <Card style={{ marginBottom: 16 }}>
          <div className="os-inline-actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div className="os-entity-copy">{installed.length} installed</div>
            <div className="os-inline-actions">
              {installed.slice(0, 4).map(entry => (
                <Button key={entry.skill.slug} href={`/skills/${entry.skill.slug}`} variant="secondary">
                  {entry.skill.name}
                </Button>
              ))}
              <Button href="/skills/installed" variant="secondary">Manage</Button>
            </div>
          </div>
        </Card>
      ) : null}

      <SearchBar value={search} onChange={event => setSearch(event.target.value)} placeholder="Search skills, categories, permissions..." />
      <div id="skill-categories">
        <FilterChips items={CATEGORIES} active={category} onChange={setCategory} />
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {[0, 1, 2].map(item => <LoadingState key={item} label="Loading skills" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={skills.length === 0 ? 'No published skills yet' : 'No skills found'}
          body={skills.length === 0 ? 'This store stays empty until a real skill is published.' : 'Try another search or category.'}
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
    </SurfaceShell>
  );
}
