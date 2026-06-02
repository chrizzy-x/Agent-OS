export type DocsCatalogEntry = {
  id: string;
  href: string;
  title: string;
  subtitle: string;
  keywords?: string[];
};

export const DOCS_CATALOG: DocsCatalogEntry[] = [
  {
    id: 'docs-overview',
    href: '/docs',
    title: 'Documentation',
    subtitle: 'Platform docs, SDK routes, workflows, apps, and FFP.',
    keywords: ['overview', 'documentation', 'platform'],
  },
  {
    id: 'docs-guide',
    href: '/docs/guide',
    title: 'Platform Guide',
    subtitle: 'Plain-English walkthrough from zero to running AgentOS.',
    keywords: ['guide', 'getting started', 'walkthrough'],
  },
  {
    id: 'docs-sdk',
    href: '/docs/sdk',
    title: 'SDK Guide',
    subtitle: 'Register apps, manage heartbeats, and connect SDK products.',
    keywords: ['sdk', 'register', 'heartbeat', 'kernel'],
  },
  {
    id: 'docs-api',
    href: '/docs/api',
    title: 'API Reference',
    subtitle: 'Routes, payloads, and live route contracts.',
    keywords: ['api', 'routes', 'reference'],
  },
  {
    id: 'docs-primitives',
    href: '/docs/primitives',
    title: 'Primitives',
    subtitle: 'Deep dive into mem, fs, db, net, proc, and events.',
    keywords: ['primitives', 'memory', 'filesystem', 'database', 'network', 'events'],
  },
  {
    id: 'docs-skills',
    href: '/docs/skills',
    title: 'Skills',
    subtitle: 'Install, publish, and meter Skill Marketplace capabilities.',
    keywords: ['skills', 'marketplace', 'publish'],
  },
  {
    id: 'docs-ffp',
    href: '/docs/ffp',
    title: 'FFP',
    subtitle: 'Consensus, audit trail, and protected execution mode.',
    keywords: ['ffp', 'consensus', 'audit'],
  },
  {
    id: 'docs-audit',
    href: '/docs/audit',
    title: 'Audit Report',
    subtitle: 'Production audit notes and verification coverage.',
    keywords: ['audit', 'verification', 'production'],
  },
  {
    id: 'docs-launch',
    href: '/docs/launch',
    title: 'Launch Notes',
    subtitle: 'Public launch notes for Studio, App Store, Skill Store, and FFP.',
    keywords: ['launch', 'release', 'v6', 'v6.2'],
  },
  {
    id: 'docs-features',
    href: '/docs/features',
    title: 'Feature Catalog',
    subtitle: 'Platform feature coverage and operations inventory.',
    keywords: ['features', 'catalog', 'coverage'],
  },
  {
    id: 'docs-templates',
    href: '/docs/templates',
    title: 'Templates',
    subtitle: 'Production-oriented starter patterns built on AgentOS.',
    keywords: ['templates', 'examples', 'starter'],
  },
  {
    id: 'docs-social-ops',
    href: '/docs/social-ops',
    title: 'Social Ops Module',
    subtitle: 'Reference vertical module built on AgentOS primitives.',
    keywords: ['social', 'ops', 'module', 'reference'],
  },
];
