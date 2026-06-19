import Link from 'next/link';
import SurfaceShell from '@/components/os/surface-shell';
import { Card } from '@/components/os/ui';

const RESOURCES = [
  {
    title: 'GitHub',
    description: 'Source, issues, contributions, and release history.',
    href: 'https://github.com/chrizzy-x/Agent-OS',
    external: true,
  },
  {
    title: 'Documentation',
    description: 'Architecture, product guides, API reference, and operational documentation.',
    href: '/docs',
  },
  {
    title: 'AgentOS SDK',
    description: 'Build discoverable Agentic Apps for AgentOS and external runtimes.',
    href: '/docs/sdk',
  },
  {
    title: 'Skills Guide',
    description: 'Build and publish reusable AgentOS skills.',
    href: '/docs/skills',
  },
];

export default function CommunityPage() {
  return (
    <SurfaceShell
      activePath="/community"
      title="Community"
      subtitle="Real AgentOS resources for builders, contributors, and operators."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {RESOURCES.map(resource => (
          <Card key={resource.href} style={{ padding: 20, display: 'grid', gap: 10 }}>
            <strong>{resource.title}</strong>
            <span className="os-entity-copy">{resource.description}</span>
            {resource.external ? (
              <a href={resource.href} target="_blank" rel="noreferrer" className="btn-primary">Open</a>
            ) : (
              <Link href={resource.href} className="btn-primary">Open</Link>
            )}
          </Card>
        ))}
      </div>
    </SurfaceShell>
  );
}
