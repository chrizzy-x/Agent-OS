'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import SurfaceShell from '@/components/os/surface-shell';
import { Badge, Card, SearchBar } from '@/components/os/ui';

type ResourceLink = {
  title: string;
  href: string;
  group: string;
  description: string;
  external?: boolean;
};

const RESOURCE_LINKS: ResourceLink[] = [
  { title: 'Documentation', href: '/docs/guide', group: 'Start', description: 'Core AgentOS operating model and feature guide.' },
  { title: 'SDK Docs', href: '/docs/sdk', group: 'Build', description: 'Build and register AgentOS apps and external runtimes.' },
  { title: 'API Reference', href: '/docs/api', group: 'Build', description: 'Route contracts for Studio, apps, skills, workflows, MCP, and auth.' },
  { title: 'Tutorials', href: '/docs/templates', group: 'Learn', description: 'Runnable examples and setup walkthroughs.' },
  { title: 'Changelog', href: '/docs/launch', group: 'Release', description: 'Product changes by release.' },
  { title: 'Release Notes', href: '/docs/launch', group: 'Release', description: 'Current release notes and rollout notes.' },
  { title: 'Roadmap', href: '/ffp', group: 'Plan', description: 'Upcoming architecture and disabled future surfaces.' },
  { title: 'Status', href: '/mcp', group: 'Operate', description: 'Connectivity and runtime health checks.' },
  { title: 'Community', href: '/community', group: 'Explore', description: 'Builders, showcases, and public ecosystem activity.' },
  { title: 'GitHub', href: 'https://github.com/chrizzy-x/Agent-OS', group: 'Support', description: 'Source, issues, and contributions.', external: true },
  { title: 'Support', href: 'mailto:support@agentos.app', group: 'Support', description: 'Get help with AgentOS workspaces and deployments.', external: true },
  { title: 'Contact', href: 'mailto:hello@agentos.app', group: 'Support', description: 'Reach the AgentOS team.', external: true },
];

const GROUPS = ['Start', 'Build', 'Learn', 'Release', 'Operate', 'Explore', 'Plan', 'Support'];

export default function ResourcesPage() {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return RESOURCE_LINKS;
    return RESOURCE_LINKS.filter(item => `${item.title} ${item.group} ${item.description}`.toLowerCase().includes(value));
  }, [query]);

  return (
    <SurfaceShell activePath="/resources" title="Resources" subtitle="Find docs, references, release notes, support, and builder resources.">
      <div className="resources-layout">
        <aside className="resources-sidebar" aria-label="Resources navigation">
          {GROUPS.map(group => (
            <a key={group} href={`#${group.toLowerCase()}`}>{group}</a>
          ))}
        </aside>
        <main className="resources-main">
          <SearchBar value={query} onChange={event => setQuery(event.target.value)} placeholder="Search documentation, SDKs, APIs, releases, support" />
          {GROUPS.map(group => {
            const items = filtered.filter(item => item.group === group);
            if (items.length === 0) return null;
            return (
              <section key={group} id={group.toLowerCase()} className="resources-section">
                <div className="resources-section-head">
                  <h2>{group}</h2>
                  <Badge tone="default">{items.length}</Badge>
                </div>
                <div className="resources-link-list">
                  {items.map(item => (
                    <Card key={`${item.group}-${item.title}`} className="resources-link-card">
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.description}</p>
                      </div>
                      {item.external ? (
                        <a href={item.href} target="_blank" rel="noreferrer" className="btn-ghost">Open</a>
                      ) : (
                        <Link href={item.href} className="btn-ghost">Open</Link>
                      )}
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </main>
      </div>
    </SurfaceShell>
  );
}
