'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import SurfaceShell from '@/components/os/surface-shell';
import { Badge, Card, SearchBar } from '@/components/os/ui';

const COMMUNITY_SECTIONS = [
  { title: 'Trending Apps', category: 'Apps', href: '/appstore', items: ['Research OS', 'Trading Desk', 'Ops Console'] },
  { title: 'Trending Skills', category: 'Skills', href: '/skillstore', items: ['Browser research', 'Memory distiller', 'Workflow runner'] },
  { title: 'Trending Workflows', category: 'Workflows', href: '/workflows', items: ['Daily brief', 'Release check', 'Lead enrichment'] },
  { title: 'Top Builders', category: 'Builders', href: '/developer', items: ['AgentOS Publisher', 'SDK Builders', 'Automation Teams'] },
  { title: 'Projects', category: 'Projects', href: '/projects', items: ['Launch rooms', 'Research workspaces', 'Ops stacks'] },
  { title: 'Showcases', category: 'Showcases', href: '/resources', items: ['App launches', 'Skill demos', 'Workflow blueprints'] },
];

export default function CommunityPage() {
  const [query, setQuery] = useState('');
  const sections = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return COMMUNITY_SECTIONS;
    return COMMUNITY_SECTIONS.filter(section => `${section.title} ${section.category} ${section.items.join(' ')}`.toLowerCase().includes(value));
  }, [query]);

  return (
    <SurfaceShell activePath="/community" title="Community" subtitle="Discover what everyone is building across apps, skills, workflows, builders, projects, and showcases.">
      <div className="os-drawer-stack">
        <SearchBar value={query} onChange={event => setQuery(event.target.value)} placeholder="Search community categories and showcases" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {sections.map(section => (
            <Card key={section.title}>
              <div className="os-entity-head" style={{ marginBottom: 12 }}>
                <div className="os-entity-title">{section.title}</div>
                <Badge tone="accent">{section.category}</Badge>
              </div>
              <div className="os-drawer-stack">
                {section.items.map(item => <div key={item} className="os-entity-copy">{item}</div>)}
              </div>
              <div className="os-inline-actions" style={{ marginTop: 12 }}>
                <Link href={section.href} className="btn-ghost">Explore</Link>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </SurfaceShell>
  );
}
