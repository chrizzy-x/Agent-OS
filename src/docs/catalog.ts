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
    subtitle: 'Home, Studio, apps, skills, workflows, and advanced docs.',
    keywords: ['overview', 'documentation', 'platform'],
  },
  {
    id: 'docs-guide',
    href: '/docs/guide',
    title: 'Guide',
    subtitle: 'Plain-English walkthrough from zero to running AgentOS.',
    keywords: ['guide', 'getting started', 'walkthrough'],
  },
  {
    id: 'docs-sdk',
    href: '/docs/sdk',
    title: 'SDK Guide',
    subtitle: 'Open AgentOS from code and connect external apps.',
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
    subtitle: 'Install skills, build your own, and publish them.',
    keywords: ['skills', 'marketplace', 'publish'],
  },
  {
    id: 'docs-ffp',
    href: '/docs/ffp',
    title: 'FFP',
    subtitle: 'Temporary routing toggle for future Fabric Furge Protocol.',
    keywords: ['ffp', 'temp', 'routing'],
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
    subtitle: 'Release notes for home, Studio, apps, skills, and workflows.',
    keywords: ['launch', 'release', 'v6', 'v6.6.7'],
  },
  {
    id: 'docs-features',
    href: '/docs/features',
    title: 'Feature Catalog',
    subtitle: 'Feature coverage and advanced operations inventory.',
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
    subtitle: 'Reference module for teams building social automation.',
    keywords: ['social', 'ops', 'module', 'reference'],
  },
];
