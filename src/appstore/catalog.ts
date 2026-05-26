export type AgentAppCommand = {
  name: string;
  description: string;
};

export type AgentAppManifest = {
  schemaVersion: 'agentos.app.v1';
  version: string;
  runtime: 'agentos-agent' | 'external-agent' | 'workspace-agent';
  entrypoint: string;
  primitives: string[];
  skills: string[];
  permissions: string[];
  requiredSecrets: string[];
  commands: AgentAppCommand[];
};

export type AgentAppListing = {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  longDescription: string;
  publisherId: string;
  publisherName: string;
  appUrl: string | null;
  repositoryUrl: string | null;
  deviceTargets: string[];
  manifest: AgentAppManifest;
  defaultConfig: Record<string, unknown>;
  installCount: number;
  verified: boolean;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

export const AGENT_APP_CATEGORIES = [
  'All',
  'Research',
  'Finance',
  'Growth',
  'Data',
  'Security',
  'Support',
  'Operations',
];

export const AGENT_APP_DEVICE_TARGETS = [
  'AgentOS Desktop',
  'AgentOS Cloud',
  'Enterprise Workspace',
  'Mobile Companion',
];

export const SEEDED_AGENT_APPS: AgentAppListing[] = [
  {
    id: 'agentos-app-research-agent',
    name: 'Research Agent',
    slug: 'research-agent',
    category: 'Research',
    description: 'A downloadable research assistant with web fetch, memory, database storage, and report export.',
    longDescription: 'Research Agent gives retail users and enterprise teams a ready-made autonomous research app. It can gather web context, summarize findings, store durable notes, and export reports through AgentOS primitives.',
    publisherId: 'agentos',
    publisherName: 'AgentOS',
    appUrl: null,
    repositoryUrl: 'https://github.com/chrizzy-x/Agent-OS',
    deviceTargets: ['AgentOS Desktop', 'AgentOS Cloud', 'Enterprise Workspace'],
    manifest: {
      schemaVersion: 'agentos.app.v1',
      version: '1.0.0',
      runtime: 'agentos-agent',
      entrypoint: 'agentos://templates/research-agent',
      primitives: ['net.fetch', 'mem.*', 'db.*', 'fs.write'],
      skills: [],
      permissions: ['network', 'memory', 'database', 'files'],
      requiredSecrets: [],
      commands: [
        { name: 'research', description: 'Run a structured research workflow.' },
        { name: 'export', description: 'Write a research report to AgentOS files.' },
      ],
    },
    defaultConfig: {
      templateId: 'research-agent',
      system_prompt: 'Research thoroughly, cite sources, and store durable findings.',
    },
    installCount: 1240,
    verified: true,
    published: true,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
  },
  {
    id: 'agentos-app-trading-monitor',
    name: 'Trading Monitor',
    slug: 'trading-monitor',
    category: 'Finance',
    description: 'A market monitor app for prices, alerts, memory-backed state, and event notifications.',
    longDescription: 'Trading Monitor watches market data feeds, stores recent state, detects anomalies, and emits alerts. It does not place trades by default.',
    publisherId: 'agentos',
    publisherName: 'AgentOS',
    appUrl: null,
    repositoryUrl: 'https://github.com/chrizzy-x/Agent-OS',
    deviceTargets: ['AgentOS Desktop', 'AgentOS Cloud'],
    manifest: {
      schemaVersion: 'agentos.app.v1',
      version: '1.0.0',
      runtime: 'agentos-agent',
      entrypoint: 'agentos://templates/trading-monitor',
      primitives: ['net.fetch', 'events.*', 'mem.*'],
      skills: [],
      permissions: ['network', 'events', 'memory'],
      requiredSecrets: [],
      commands: [
        { name: 'watch', description: 'Watch a market symbol and emit alerts.' },
        { name: 'snapshot', description: 'Return current market state.' },
      ],
    },
    defaultConfig: {
      templateId: 'trading-monitor',
      system_prompt: 'Monitor markets, detect anomalies, and raise alerts without placing trades.',
    },
    installCount: 940,
    verified: true,
    published: true,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
  },
  {
    id: 'agentos-app-social-manager',
    name: 'Social Manager',
    slug: 'social-manager',
    category: 'Growth',
    description: 'An approval-first app for scheduled posts, engagement tracking, and campaign memory.',
    longDescription: 'Social Manager helps creators, teams, and agencies draft posts, schedule approved content, track campaign context, and coordinate downstream workflows.',
    publisherId: 'agentos',
    publisherName: 'AgentOS',
    appUrl: null,
    repositoryUrl: 'https://github.com/chrizzy-x/Agent-OS',
    deviceTargets: ['AgentOS Desktop', 'AgentOS Cloud', 'Mobile Companion'],
    manifest: {
      schemaVersion: 'agentos.app.v1',
      version: '1.0.0',
      runtime: 'agentos-agent',
      entrypoint: 'agentos://templates/social-manager',
      primitives: ['net.post', 'mem.*', 'events.schedule', 'db.*'],
      skills: [],
      permissions: ['network', 'memory', 'events', 'database'],
      requiredSecrets: ['SOCIAL_API_TOKEN'],
      commands: [
        { name: 'draft', description: 'Draft campaign content.' },
        { name: 'schedule', description: 'Schedule approved content.' },
      ],
    },
    defaultConfig: {
      templateId: 'social-manager',
      system_prompt: 'Draft, schedule, and track social engagement with approval-first behavior.',
    },
    installCount: 780,
    verified: true,
    published: true,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
  },
  {
    id: 'agentos-app-data-pipeline',
    name: 'Data Pipeline',
    slug: 'data-pipeline',
    category: 'Data',
    description: 'A reusable ETL app for ingestion, validation, transforms, storage, and event handoff.',
    longDescription: 'Data Pipeline downloads datasets, writes raw files, runs transforms, validates output, stores structured rows, and notifies downstream agents.',
    publisherId: 'agentos',
    publisherName: 'AgentOS',
    appUrl: null,
    repositoryUrl: 'https://github.com/chrizzy-x/Agent-OS',
    deviceTargets: ['AgentOS Cloud', 'Enterprise Workspace'],
    manifest: {
      schemaVersion: 'agentos.app.v1',
      version: '1.0.0',
      runtime: 'agentos-agent',
      entrypoint: 'agentos://templates/data-pipeline',
      primitives: ['db.*', 'fs.*', 'proc.*', 'events.*'],
      skills: [],
      permissions: ['database', 'files', 'process', 'events'],
      requiredSecrets: [],
      commands: [
        { name: 'ingest', description: 'Ingest a dataset.' },
        { name: 'transform', description: 'Run a reproducible transform.' },
      ],
    },
    defaultConfig: {
      templateId: 'data-pipeline',
      system_prompt: 'Extract, transform, validate, and load data with reproducible runs.',
    },
    installCount: 710,
    verified: true,
    published: true,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
  },
  {
    id: 'agentos-app-security-sentinel',
    name: 'Security Sentinel',
    slug: 'security-sentinel',
    category: 'Security',
    description: 'A monitoring app for endpoint checks, anomaly detection, event alerts, and incident notes.',
    longDescription: 'Security Sentinel continuously inspects configured signals, flags suspicious behavior, preserves incident context, and emits events for escalation.',
    publisherId: 'agentos',
    publisherName: 'AgentOS',
    appUrl: null,
    repositoryUrl: 'https://github.com/chrizzy-x/Agent-OS',
    deviceTargets: ['AgentOS Cloud', 'Enterprise Workspace'],
    manifest: {
      schemaVersion: 'agentos.app.v1',
      version: '1.0.0',
      runtime: 'agentos-agent',
      entrypoint: 'agentos://templates/security-sentinel',
      primitives: ['net.*', 'events.*', 'proc.*', 'fs.*'],
      skills: [],
      permissions: ['network', 'events', 'process', 'files'],
      requiredSecrets: [],
      commands: [
        { name: 'scan', description: 'Run a configured security scan.' },
        { name: 'incident', description: 'Write incident context.' },
      ],
    },
    defaultConfig: {
      templateId: 'security-sentinel',
      system_prompt: 'Continuously inspect signals, flag suspicious behavior, and preserve incident context.',
    },
    installCount: 660,
    verified: true,
    published: true,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
  },
  {
    id: 'agentos-app-customer-support',
    name: 'Customer Support',
    slug: 'customer-support',
    category: 'Support',
    description: 'A support desk app with knowledge memory, ticket logging, and API handoffs.',
    longDescription: 'Customer Support answers from durable knowledge, logs tickets, stores customer context, and hands off unresolved cases through events.',
    publisherId: 'agentos',
    publisherName: 'AgentOS',
    appUrl: null,
    repositoryUrl: 'https://github.com/chrizzy-x/Agent-OS',
    deviceTargets: ['AgentOS Desktop', 'AgentOS Cloud', 'Enterprise Workspace'],
    manifest: {
      schemaVersion: 'agentos.app.v1',
      version: '1.0.0',
      runtime: 'agentos-agent',
      entrypoint: 'agentos://templates/customer-support',
      primitives: ['mem.*', 'db.*', 'net.fetch', 'events.*'],
      skills: [],
      permissions: ['memory', 'database', 'network', 'events'],
      requiredSecrets: [],
      commands: [
        { name: 'answer', description: 'Answer from knowledge context.' },
        { name: 'ticket', description: 'Log a support ticket outcome.' },
      ],
    },
    defaultConfig: {
      templateId: 'customer-support',
      system_prompt: 'Answer accurately from durable knowledge and log every ticket outcome.',
    },
    installCount: 600,
    verified: true,
    published: true,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
  },
];
