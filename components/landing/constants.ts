export const AGENTOS_ENTRY_ROUTE = '/studio?mode=nl';
export const AGENTOS_HOME_ROUTE = '/dashboard';
export const AGENTOS_APPSTORE_ROUTE = '/appstore';
export const AGENTOS_DEVELOPER_ROUTE = '/developer';
export const AGENTOS_WHITEPAPER_ROUTE = '/whitepaper';
export const AGENTOS_WHITEPAPER_PDF_GITHUB_URL = 'https://github.com/chrizzy-x/Agent-OS/raw/main/docs/AgentOS_Whitepaper_v1.0_July_2026.pdf';
export const AGENTOS_HERO_ASSET = '/agentos-landing-hero.webp';
export const AGENTOS_NAV_MARK_ASSET = '/agentos-landing-mark.webp';

export const COMMAND_DEMOS = [
  'Build and launch a complete product campaign.',
  'Research this market and prepare the full report.',
  'Turn my idea into a working product plan.',
] as const;

export const STATUS_DEMOS = [
  { lead: 'Understanding', detail: 'your command', label: 'Understanding your command', color: '#9868F5' },
  { lead: 'Planning', detail: 'the execution', label: 'Planning the execution', color: '#3D91F4' },
  { lead: 'Using', detail: 'workspace capabilities', label: 'Using workspace capabilities', color: '#33C8A4' },
  { lead: 'Delivering', detail: 'the completed result', label: 'Delivering the completed result', color: '#FF8354' },
] as const;

export const EXECUTION_NODES = [
  {
    title: 'Understand',
    body: 'Interprets your outcome.',
    tone: '#9868F5',
    position: 'understand',
    icon: 'target',
  },
  {
    title: 'Plan',
    body: 'Builds the execution path.',
    tone: '#3D91F4',
    position: 'plan',
    icon: 'path',
  },
  {
    title: 'Execute',
    body: 'Uses apps, skills and tools.',
    tone: '#33C8A4',
    position: 'execute',
    icon: 'bolt',
  },
  {
    title: 'Deliver',
    body: 'Returns the finished result.',
    tone: '#FF8354',
    position: 'deliver',
    icon: 'check',
  },
] as const;
