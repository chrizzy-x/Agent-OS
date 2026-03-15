export type CatalogKind = 'platform_feature' | 'runtime_function';

type GroupKey =
  | 'core'
  | 'ffp'
  | 'mcp'
  | 'skills'
  | 'auth'
  | 'ui'
  | 'ops'
  | 'infra'
  | 'advanced'
  | 'mem'
  | 'fs'
  | 'db'
  | 'net'
  | 'events'
  | 'proc';

interface GroupDefinition {
  name: string;
  badge: string;
  description: string;
  competitor: string;
  standout: string;
  useCaseTemplates: [string, string];
}

interface CatalogSeed {
  id: number;
  slug: string;
  name: string;
  short: string;
  group: GroupKey;
  kind: CatalogKind;
}

export interface FeatureCatalogItem extends CatalogSeed {
  categoryName: string;
  categoryBadge: string;
  categoryDescription: string;
  competitor: string;
  standout: string;
  details: string;
  useCases: [string, string];
}

export interface FeatureShowcaseCategory {
  key: string;
  name: string;
  badge: string;
  description: string;
  features: FeatureCatalogItem[];
}

const GROUPS: Record<GroupKey, GroupDefinition> = {
  core: {
    name: 'Core Infrastructure',
    badge: 'CORE',
    description: 'The hosted primitives that replace hand-rolled agent infrastructure.',
    competitor: 'LangChain plus custom Redis, storage, and worker glue',
    standout: 'Agent OS ships the primitive as a managed, isolated service instead of making teams wire multiple vendors together first.',
    useCaseTemplates: [
      'A logistics agent uses {name} to keep shipment data and job state inside one hosted runtime instead of juggling separate infrastructure services.',
      'A customer support agent uses {name} to keep context, files, and automation steps available across every conversation handoff.',
    ],
  },
  ffp: {
    name: 'Multi-Agent Consensus (FFP)',
    badge: 'FFP',
    description: 'Consensus and coordination controls for critical multi-agent work.',
    competitor: 'CrewAI with app-level voting logic bolted on afterward',
    standout: 'Agent OS makes consensus a platform rule with logging, thresholds, and failover instead of an optional prompt pattern.',
    useCaseTemplates: [
      'A treasury operations crew uses {name} before releasing a payment so one weak agent cannot approve a high-risk action alone.',
      'A medical review workflow uses {name} to require multiple specialist agents to agree before a diagnosis summary is escalated.',
    ],
  },
  mcp: {
    name: 'MCP Integration',
    badge: 'MCP',
    description: 'A single access layer for Model Context Protocol servers and tools.',
    competitor: 'Direct MCP wiring in each client or Claude Desktop-only setups',
    standout: 'Agent OS adds shared routing, policy checks, and consensus-aware execution on top of standard MCP access.',
    useCaseTemplates: [
      'A sales operations agent uses {name} to reach Gmail, Slack, and Drive through one consistent API surface.',
      'A DevOps agent uses {name} to update GitHub, fetch run context, and notify Slack without building custom connectors for each tool.',
    ],
  },
  skills: {
    name: 'Skills Marketplace',
    badge: 'SKILL',
    description: 'Reusable third-party capabilities that can be installed, published, metered, and monetized.',
    competitor: 'Zapier AI actions or ad hoc private tool registries',
    standout: 'Agent OS treats extensions as installable runtime capabilities with analytics, reviews, and revenue sharing built in.',
    useCaseTemplates: [
      'A legal intake agent uses {name} to add document parsing or clause extraction without rebuilding those capabilities from scratch.',
      'A growth team agent uses {name} to install SEO, scraping, or enrichment skills as reusable production modules.',
    ],
  },
  auth: {
    name: 'Authentication & Security',
    badge: 'AUTH',
    description: 'Identity, isolation, and guardrails for running agents safely in production.',
    competitor: 'Homegrown API key checks plus patchwork network rules',
    standout: 'Agent OS enforces identity, isolation, rate controls, and outbound safety in the platform, not as optional middleware.',
    useCaseTemplates: [
      'A healthcare intake agent uses {name} to keep patient data isolated while automating record lookups and file processing.',
      'A finance operations agent uses {name} to block unsafe outbound calls and prevent cross-tenant data leaks.',
    ],
  },
  ui: {
    name: 'User Interface',
    badge: 'UI',
    description: 'The product surface that helps teams sign up, discover features, and manage agents quickly.',
    competitor: 'Internal admin panels or CLI-only developer tooling',
    standout: 'Agent OS gives teams a production-grade self-serve experience instead of forcing them to live in scripts and dashboards they built themselves.',
    useCaseTemplates: [
      'A startup founder uses {name} to onboard an internal agent in minutes without reading low-level infrastructure docs first.',
      'A platform engineer uses {name} to hand product teams a self-serve control surface instead of a collection of shell commands.',
    ],
  },
  ops: {
    name: 'Operations & Reliability',
    badge: 'OPS',
    description: 'Monitoring, failover, visibility, and control features for autonomous infrastructure.',
    competitor: 'Datadog plus custom cron scripts and spreadsheets',
    standout: 'Agent OS keeps operational coverage in the same product surface as agent execution, so the control plane and runtime stay aligned.',
    useCaseTemplates: [
      'A platform team uses {name} to spot degradation early and keep autonomous agent services online without manual babysitting.',
      'A B2B SaaS team uses {name} to track incidents, queue pressure, and failover events from one operations console.',
    ],
  },
  infra: {
    name: 'Infrastructure',
    badge: 'CLOUD',
    description: 'The hosted deployment and storage stack under Agent OS.',
    competitor: 'Self-managed Kubernetes, Redis, and Postgres stacks',
    standout: 'Agent OS uses modern managed infrastructure so teams get global scale and safer defaults without operating every moving part themselves.',
    useCaseTemplates: [
      'A research team uses {name} to launch globally reachable agents without hiring an infrastructure team first.',
      'A SaaS platform uses {name} to absorb traffic spikes during product launches without manual scaling work.',
    ],
  },
  advanced: {
    name: 'Advanced Features',
    badge: 'ADV',
    description: 'Higher-order orchestration, experimentation, and network behaviors for larger agent systems.',
    competitor: 'LangGraph workflows plus custom experimentation tooling',
    standout: 'Agent OS connects orchestration, versioning, scheduling, and rollback into one runtime instead of leaving teams to stitch them together.',
    useCaseTemplates: [
      'A fraud detection pipeline uses {name} to coordinate specialist agents and route high-risk cases through controlled review steps.',
      'A content operations team uses {name} to schedule, test, and roll back agent behavior safely as traffic changes.',
    ],
  },
  mem: {
    name: 'Memory Functions',
    badge: 'MEM',
    description: 'Redis-backed memory operations exposed as runtime functions.',
    competitor: 'Raw Redis SDK calls in custom app code',
    standout: 'Agent OS exposes memory operations behind agent-aware quotas, namespacing, and audit logging by default.',
    useCaseTemplates: [
      'A recommendation agent uses {name} to cache user context between requests without writing direct Redis code.',
      'A fraud scoring agent uses {name} to keep fast counters and temporary state during a live review window.',
    ],
  },
  fs: {
    name: 'Filesystem Functions',
    badge: 'FS',
    description: 'Cloud file operations exposed as agent-safe runtime functions.',
    competitor: 'Direct S3 or Blob storage SDK calls',
    standout: 'Agent OS wraps storage with path safety, isolation, and audit trails so teams do not rebuild file governance themselves.',
    useCaseTemplates: [
      'A compliance agent uses {name} to store policy exports and signed reports in an isolated tenant path.',
      'A document processing agent uses {name} to read uploaded PDFs and write normalized outputs without direct bucket management.',
    ],
  },
  db: {
    name: 'Database Functions',
    badge: 'DB',
    description: 'Agent-scoped relational data operations exposed through safe runtime functions.',
    competitor: 'Direct SQL clients and hand-built tenancy rules',
    standout: 'Agent OS gives each agent a scoped database surface with validation and audit logging instead of open-ended shared SQL access.',
    useCaseTemplates: [
      'A pricing agent uses {name} to store quote history and retrieve past decisions during renewals.',
      'A support analytics agent uses {name} to keep issue trends and resolution stats in a private schema.',
    ],
  },
  net: {
    name: 'Network Functions',
    badge: 'NET',
    description: 'Outbound network operations with policy controls and logging.',
    competitor: 'Native fetch plus custom SSRF protection',
    standout: 'Agent OS makes outbound calls policy-aware, rate-limited, and auditable instead of trusting raw network access.',
    useCaseTemplates: [
      'A market data agent uses {name} to poll exchange APIs without exposing the platform to unsafe internal addresses.',
      'A procurement agent uses {name} to call vendor APIs while staying inside approved outbound domains.',
    ],
  },
  events: {
    name: 'Event Functions',
    badge: 'EVT',
    description: 'Realtime publish-subscribe operations for agent coordination.',
    competitor: 'Custom Redis pub-sub wrappers or queue glue code',
    standout: 'Agent OS turns events into a first-class agent primitive with isolation and operational visibility already attached.',
    useCaseTemplates: [
      'A trading signal agent uses {name} to publish alerts that downstream execution agents can subscribe to in real time.',
      'A support workflow agent uses {name} to hand off escalations between intake, routing, and resolution workers.',
    ],
  },
  proc: {
    name: 'Process Functions',
    badge: 'PROC',
    description: 'Sandboxed execution, scheduling, and child-agent process controls.',
    competitor: 'Background workers plus ad hoc shell execution',
    standout: 'Agent OS wraps process execution in time limits, isolation, scheduling hooks, and audit logs instead of raw worker access.',
    useCaseTemplates: [
      'A research agent uses {name} to run Python analysis code inside a time-limited sandbox.',
      'A revenue operations agent uses {name} to schedule recurring reconciliation jobs and controlled child workflows.',
    ],
  },
};

const PLATFORM_FEATURES: CatalogSeed[] = [
  { id: 1, slug: 'filesystem', name: 'Filesystem (fs)', short: 'Read and write files in isolated cloud storage for each agent.', group: 'core', kind: 'platform_feature' },
  { id: 2, slug: 'network', name: 'Network (net)', short: 'Make outbound HTTP requests with SSRF protection, limits, and timeouts.', group: 'core', kind: 'platform_feature' },
  { id: 3, slug: 'process-execution', name: 'Process Execution (proc)', short: 'Run Python, JavaScript, or Bash in a sandboxed execution environment.', group: 'core', kind: 'platform_feature' },
  { id: 4, slug: 'memory-cache', name: 'Memory Cache (mem)', short: 'Use Redis-backed key-value memory with fast reads and TTL support.', group: 'core', kind: 'platform_feature' },
  { id: 5, slug: 'database', name: 'Database (db)', short: 'Use PostgreSQL-backed relational storage with private agent scoping.', group: 'core', kind: 'platform_feature' },
  { id: 6, slug: 'events', name: 'Events (events)', short: 'Publish and subscribe to realtime messages across agents.', group: 'core', kind: 'platform_feature' },
  { id: 7, slug: 'consensus-system', name: 'Consensus System', short: 'Use Byzantine-style voting for critical multi-agent decisions.', group: 'ffp', kind: 'platform_feature' },
  { id: 8, slug: 'reputation-tracking', name: 'Reputation Tracking', short: 'Track agent quality over time and feed that into multi-agent decisions.', group: 'ffp', kind: 'platform_feature' },
  { id: 9, slug: 'chain-logging', name: 'Chain Logging', short: 'Store immutable action trails and proofs for critical operations.', group: 'ffp', kind: 'platform_feature' },
  { id: 10, slug: 'coordination', name: 'Coordination', short: 'Coordinate handoffs and staged work between multiple agents.', group: 'ffp', kind: 'platform_feature' },
  { id: 11, slug: 'validation', name: 'Validation', short: 'Validate agents before they participate in consensus or high-risk work.', group: 'ffp', kind: 'platform_feature' },
  { id: 12, slug: 'diversity-enforcement', name: 'Diversity Enforcement', short: 'Reduce single points of failure by spreading agent decision sources.', group: 'ffp', kind: 'platform_feature' },
  { id: 13, slug: 'browse-skills', name: 'Browse Skills', short: 'Search and filter marketplace skills by keyword, category, and popularity.', group: 'skills', kind: 'platform_feature' },
  { id: 14, slug: 'install-skills', name: 'Install Skills', short: 'Install marketplace skills into an agent with one API call.', group: 'skills', kind: 'platform_feature' },
  { id: 15, slug: 'use-skills', name: 'Use Skills', short: 'Execute installed skill capabilities through the Agent OS API.', group: 'skills', kind: 'platform_feature' },
  { id: 16, slug: 'skill-execution-engine', name: 'Skill Execution Engine', short: 'Run skill code in an isolated runtime with limits and result controls.', group: 'skills', kind: 'platform_feature' },
  { id: 17, slug: 'publish-skills', name: 'Publish Skills', short: 'Publish new skills with code, pricing, capabilities, and metadata.', group: 'skills', kind: 'platform_feature' },
  { id: 18, slug: 'reviews-ratings', name: 'Reviews & Ratings', short: 'Collect ratings and written feedback for marketplace skills.', group: 'skills', kind: 'platform_feature' },
  { id: 19, slug: 'developer-dashboard', name: 'Developer Dashboard', short: 'Track installs, calls, and earnings for skills you publish.', group: 'skills', kind: 'platform_feature' },
  { id: 20, slug: 'revenue-sharing', name: 'Revenue Sharing', short: 'Split paid skill revenue between developers and the platform.', group: 'skills', kind: 'platform_feature' },
  { id: 21, slug: 'skill-analytics', name: 'Skill Analytics', short: 'Measure installs, calls, latency, failures, and revenue per skill.', group: 'skills', kind: 'platform_feature' },
  { id: 22, slug: 'landing-page', name: 'Landing Page', short: 'Present the product story, primitives, and feature coverage clearly.', group: 'ui', kind: 'platform_feature' },
  { id: 23, slug: 'signup-flow', name: 'Signup Flow', short: 'Create a new agent account and issue credentials quickly.', group: 'ui', kind: 'platform_feature' },
  { id: 24, slug: 'marketplace-ui', name: 'Marketplace UI', short: 'Browse and discover skills through a product-grade catalog interface.', group: 'ui', kind: 'platform_feature' },
  { id: 25, slug: 'skill-detail-pages', name: 'Skill Detail Pages', short: 'Inspect a skill before installation with reviews, capability info, and examples.', group: 'ui', kind: 'platform_feature' },
  { id: 26, slug: 'developer-publishing-ui', name: 'Developer Publishing UI', short: 'Use a form-driven interface to publish and manage skills.', group: 'ui', kind: 'platform_feature' },
  { id: 27, slug: 'agent-dashboard', name: 'Agent Dashboard', short: 'View credentials, installed skills, and activity for each agent.', group: 'ui', kind: 'platform_feature' },
  { id: 28, slug: 'jwt-auth', name: 'JWT-Based Auth', short: 'Issue and verify signed bearer tokens for agent access.', group: 'auth', kind: 'platform_feature' },
  { id: 29, slug: 'api-key-management', name: 'API Key Management', short: 'Generate and manage agent access credentials securely.', group: 'auth', kind: 'platform_feature' },
  { id: 30, slug: 'agent-isolation', name: 'Agent Isolation', short: 'Keep each agent data path, file space, and runtime separate.', group: 'auth', kind: 'platform_feature' },
  { id: 31, slug: 'rate-limiting', name: 'Rate Limiting', short: 'Throttle abusive or accidental traffic spikes per agent.', group: 'auth', kind: 'platform_feature' },
  { id: 32, slug: 'ssrf-protection', name: 'SSRF Protection', short: 'Block unsafe outbound destinations and internal network access.', group: 'auth', kind: 'platform_feature' },
  { id: 33, slug: 'sandbox-security', name: 'Sandbox Security', short: 'Apply runtime limits and isolation to code execution workloads.', group: 'auth', kind: 'platform_feature' },
  { id: 34, slug: 'mcp-server', name: 'MCP Server', short: 'Expose Agent OS primitives and capabilities as MCP tools.', group: 'mcp', kind: 'platform_feature' },
  { id: 35, slug: 'mcp-tool-listing', name: 'MCP Tool Listing', short: 'List available MCP tools dynamically from active sources.', group: 'mcp', kind: 'platform_feature' },
  { id: 36, slug: 'mcp-tool-execution', name: 'MCP Tool Execution', short: 'Execute MCP tools through a routed, logged control plane.', group: 'mcp', kind: 'platform_feature' },
  { id: 37, slug: 'mcp-client', name: 'MCP Client', short: 'Call external MCP servers such as Gmail, Slack, Drive, or GitHub.', group: 'mcp', kind: 'platform_feature' },
  { id: 38, slug: 'health-monitoring', name: 'Health Monitoring', short: 'Track platform and crew health with regular snapshots and coverage checks.', group: 'ops', kind: 'platform_feature' },
  { id: 39, slug: 'alerting', name: 'Alerting', short: 'Raise operational alerts when health, coverage, or task state degrades.', group: 'ops', kind: 'platform_feature' },
  { id: 40, slug: 'queue-management', name: 'Queue Management', short: 'Track queued crew work and task backlog from a single control surface.', group: 'ops', kind: 'platform_feature' },
  { id: 41, slug: 'task-scheduling', name: 'Task Scheduling', short: 'Schedule recurring orchestration and maintenance work for the platform crew.', group: 'ops', kind: 'platform_feature' },
  { id: 42, slug: 'incident-timeline', name: 'Incident Timeline', short: 'Show an ordered timeline of failovers, health drops, and task outcomes.', group: 'ops', kind: 'platform_feature' },
  { id: 43, slug: 'failover-automation', name: 'Failover Automation', short: 'Promote standby agents automatically when an active agent degrades.', group: 'ops', kind: 'platform_feature' },
  { id: 44, slug: 'standby-capacity', name: 'Standby Capacity', short: 'Maintain a ready standby agent for every cataloged feature or function.', group: 'ops', kind: 'platform_feature' },
  { id: 45, slug: 'agent-heartbeats', name: 'Agent Heartbeats', short: 'Track recent contact and liveness for every infrastructure agent.', group: 'ops', kind: 'platform_feature' },
  { id: 46, slug: 'metrics-dashboard', name: 'Metrics Dashboard', short: 'Aggregate reliability, failover, queue, and coverage metrics for the crew.', group: 'ops', kind: 'platform_feature' },
  { id: 47, slug: 'usage-analytics', name: 'Usage Analytics', short: 'Measure operational load, task volume, and system coverage trends over time.', group: 'ops', kind: 'platform_feature' },
  { id: 48, slug: 'error-triage', name: 'Error Triage', short: 'Generate issue summaries and remediation suggestions when incidents happen.', group: 'ops', kind: 'platform_feature' },
  { id: 49, slug: 'audit-explorer', name: 'Audit Explorer', short: 'Inspect logged actions, votes, failovers, and automation events in one place.', group: 'ops', kind: 'platform_feature' },
  { id: 50, slug: 'config-registry', name: 'Config Registry', short: 'Keep platform feature metadata and operational settings in a canonical catalog.', group: 'ops', kind: 'platform_feature' },
  { id: 51, slug: 'release-gates', name: 'Release Gates', short: 'Gate production deploys through checks and health verification on main only.', group: 'ops', kind: 'platform_feature' },
  { id: 52, slug: 'secret-rotation', name: 'Secret Rotation', short: 'Support safer secret updates and operational token handling across the platform.', group: 'ops', kind: 'platform_feature' },
  { id: 53, slug: 'feature-catalog', name: 'Feature Catalog', short: 'Use one shared feature source for docs, UI, and crew assignment coverage.', group: 'ops', kind: 'platform_feature' },
  { id: 54, slug: 'crew-orchestrator', name: 'Crew Orchestrator', short: 'Dispatch, monitor, and rebalance autonomous infrastructure work from one service layer.', group: 'ops', kind: 'platform_feature' },
  { id: 55, slug: 'vercel-deployment', name: 'Vercel Deployment', short: 'Deploy the product globally through Vercel production infrastructure.', group: 'infra', kind: 'platform_feature' },
  { id: 56, slug: 'supabase-backend', name: 'Supabase Backend', short: 'Use Supabase for relational storage, file storage, and backend services.', group: 'infra', kind: 'platform_feature' },
  { id: 57, slug: 'redis-caching', name: 'Redis Caching', short: 'Use Redis for low-latency memory, counters, and event transport.', group: 'infra', kind: 'platform_feature' },
  { id: 58, slug: 'docker-sandboxing', name: 'Docker Sandboxing', short: 'Support stronger execution isolation patterns when container runtimes are available.', group: 'infra', kind: 'platform_feature' },
  { id: 59, slug: 'mcp-router', name: 'MCP Router', short: 'Route MCP calls through one policy-aware entry point.', group: 'mcp', kind: 'platform_feature' },
  { id: 60, slug: 'universal-mcp-access', name: 'Universal MCP Access', short: 'Reach many MCP servers through one consistent integration surface.', group: 'mcp', kind: 'platform_feature' },
  { id: 61, slug: 'multi-stage-workflows', name: 'Multi-Stage Workflows', short: 'Chain multiple agent stages into a governed workflow.', group: 'advanced', kind: 'platform_feature' },
  { id: 62, slug: 'reputation-weighting', name: 'Reputation Weighting', short: 'Weight multi-agent decisions based on observed quality and history.', group: 'advanced', kind: 'platform_feature' },
  { id: 63, slug: 'cryptographic-proofs', name: 'Cryptographic Proofs', short: 'Generate verifiable proof trails for sensitive actions.', group: 'advanced', kind: 'platform_feature' },
  { id: 64, slug: 'agent-networks', name: 'Agent Networks', short: 'Group agents into reusable networks for a shared operating domain.', group: 'advanced', kind: 'platform_feature' },
  { id: 65, slug: 'skill-dependencies', name: 'Skill Dependencies', short: 'Support skills that depend on other installed capabilities.', group: 'advanced', kind: 'platform_feature' },
  { id: 66, slug: 'skill-versioning', name: 'Skill Versioning', short: 'Track versions and compatibility for skill releases over time.', group: 'advanced', kind: 'platform_feature' },
  { id: 67, slug: 'skill-permissions', name: 'Skill Permissions', short: 'Declare and review what primitives a skill needs before it runs.', group: 'advanced', kind: 'platform_feature' },
  { id: 68, slug: 'webhook-support', name: 'Webhook Support', short: 'Receive external triggers and events through webhook-based integrations.', group: 'advanced', kind: 'platform_feature' },
  { id: 69, slug: 'scheduled-tasks', name: 'Scheduled Tasks', short: 'Run recurring or one-off background jobs on a managed schedule.', group: 'advanced', kind: 'platform_feature' },
  { id: 70, slug: 'ab-testing', name: 'A/B Testing', short: 'Compare versions of agent behavior and roll back weaker variants.', group: 'advanced', kind: 'platform_feature' },
];

const RUNTIME_FUNCTIONS: CatalogSeed[] = [
  { id: 101, slug: 'mem_set', name: 'mem_set', short: 'Store a JSON value in agent memory with an optional TTL.', group: 'mem', kind: 'runtime_function' },
  { id: 102, slug: 'mem_get', name: 'mem_get', short: 'Read a value from agent memory by key.', group: 'mem', kind: 'runtime_function' },
  { id: 103, slug: 'mem_delete', name: 'mem_delete', short: 'Delete a value from agent memory.', group: 'mem', kind: 'runtime_function' },
  { id: 104, slug: 'mem_list', name: 'mem_list', short: 'List agent memory keys by prefix.', group: 'mem', kind: 'runtime_function' },
  { id: 105, slug: 'mem_incr', name: 'mem_incr', short: 'Increment a numeric memory value safely.', group: 'mem', kind: 'runtime_function' },
  { id: 106, slug: 'mem_expire', name: 'mem_expire', short: 'Update the TTL on a stored memory key.', group: 'mem', kind: 'runtime_function' },
  { id: 107, slug: 'fs_write', name: 'fs_write', short: 'Write a file into isolated agent storage.', group: 'fs', kind: 'runtime_function' },
  { id: 108, slug: 'fs_read', name: 'fs_read', short: 'Read a file from isolated agent storage.', group: 'fs', kind: 'runtime_function' },
  { id: 109, slug: 'fs_list', name: 'fs_list', short: 'List files and directories for an agent path.', group: 'fs', kind: 'runtime_function' },
  { id: 110, slug: 'fs_delete', name: 'fs_delete', short: 'Delete a file from isolated agent storage.', group: 'fs', kind: 'runtime_function' },
  { id: 111, slug: 'fs_mkdir', name: 'fs_mkdir', short: 'Create a directory path in isolated agent storage.', group: 'fs', kind: 'runtime_function' },
  { id: 112, slug: 'fs_stat', name: 'fs_stat', short: 'Inspect metadata for a stored file or path.', group: 'fs', kind: 'runtime_function' },
  { id: 113, slug: 'db_query', name: 'db_query', short: 'Run a scoped SQL query against an agent database.', group: 'db', kind: 'runtime_function' },
  { id: 114, slug: 'db_transaction', name: 'db_transaction', short: 'Run multiple scoped SQL statements atomically.', group: 'db', kind: 'runtime_function' },
  { id: 115, slug: 'db_create_table', name: 'db_create_table', short: 'Create a table inside the agent database scope.', group: 'db', kind: 'runtime_function' },
  { id: 116, slug: 'db_insert', name: 'db_insert', short: 'Insert a row into an agent-scoped table.', group: 'db', kind: 'runtime_function' },
  { id: 117, slug: 'db_update', name: 'db_update', short: 'Update rows in an agent-scoped table.', group: 'db', kind: 'runtime_function' },
  { id: 118, slug: 'db_delete', name: 'db_delete', short: 'Delete rows from an agent-scoped table safely.', group: 'db', kind: 'runtime_function' },
  { id: 119, slug: 'net_http_get', name: 'net_http_get', short: 'Make a guarded outbound HTTP GET request.', group: 'net', kind: 'runtime_function' },
  { id: 120, slug: 'net_http_post', name: 'net_http_post', short: 'Make a guarded outbound HTTP POST request.', group: 'net', kind: 'runtime_function' },
  { id: 121, slug: 'net_http_put', name: 'net_http_put', short: 'Make a guarded outbound HTTP PUT request.', group: 'net', kind: 'runtime_function' },
  { id: 122, slug: 'net_http_delete', name: 'net_http_delete', short: 'Make a guarded outbound HTTP DELETE request.', group: 'net', kind: 'runtime_function' },
  { id: 123, slug: 'net_dns_resolve', name: 'net_dns_resolve', short: 'Resolve a hostname before calling external infrastructure.', group: 'net', kind: 'runtime_function' },
  { id: 124, slug: 'events_publish', name: 'events_publish', short: 'Publish an event to an agent topic.', group: 'events', kind: 'runtime_function' },
  { id: 125, slug: 'events_subscribe', name: 'events_subscribe', short: 'Subscribe to recent messages on an agent topic.', group: 'events', kind: 'runtime_function' },
  { id: 126, slug: 'events_unsubscribe', name: 'events_unsubscribe', short: 'Remove a topic subscription for an agent.', group: 'events', kind: 'runtime_function' },
  { id: 127, slug: 'events_list_topics', name: 'events_list_topics', short: 'List event topics with recent traffic.', group: 'events', kind: 'runtime_function' },
  { id: 128, slug: 'proc_execute', name: 'proc_execute', short: 'Run a code snippet in a sandboxed process.', group: 'proc', kind: 'runtime_function' },
  { id: 129, slug: 'proc_schedule', name: 'proc_schedule', short: 'Schedule a recurring or delayed code execution task.', group: 'proc', kind: 'runtime_function' },
  { id: 130, slug: 'proc_spawn', name: 'proc_spawn', short: 'Spawn a child agent or child execution context.', group: 'proc', kind: 'runtime_function' },
  { id: 131, slug: 'proc_kill', name: 'proc_kill', short: 'Stop a running or scheduled process.', group: 'proc', kind: 'runtime_function' },
  { id: 132, slug: 'proc_list', name: 'proc_list', short: 'List running and scheduled process work for an agent.', group: 'proc', kind: 'runtime_function' },
];

function fillTemplate(template: string, item: CatalogSeed): string {
  return template.replace('{name}', item.name);
}

function toCatalogItem(item: CatalogSeed): FeatureCatalogItem {
  const group = GROUPS[item.group];
  const useCases: [string, string] = [
    fillTemplate(group.useCaseTemplates[0], item),
    fillTemplate(group.useCaseTemplates[1], item),
  ];

  return {
    ...item,
    categoryName: group.name,
    categoryBadge: group.badge,
    categoryDescription: group.description,
    competitor: group.competitor,
    standout: group.standout,
    details: `${item.short} ${group.standout}`,
    useCases,
  };
}

export const PROJECT_DETAILS = {
  name: 'Agent OS',
  summary: 'Agent OS is a production platform for building, deploying, and operating autonomous AI agents with hosted primitives, MCP routing, skills, and multi-agent control features.',
  audience: 'Platform engineers, AI product teams, startups shipping agent workflows, and operators who need governed automation.',
  productionPath: 'GitHub main -> GitHub Actions -> Vercel production',
  stack: [
    'Next.js App Router for product UI and APIs',
    'Supabase PostgreSQL and storage for durable state',
    'Redis for cache, rate controls, and event transport',
    'Anthropic for on-demand feature descriptions and incident triage support',
    'Vercel for hosted production deployment and cron execution',
  ],
  differentiators: [
    'Hosted primitives instead of do-it-yourself infra glue',
    'MCP routing with optional consensus and full logging',
    'A skills marketplace with installation, execution, and monetization',
    'An autonomous active-and-standby operations crew for every feature and runtime function',
  ],
};

export const PLATFORM_CATALOG = PLATFORM_FEATURES.map(toCatalogItem);
export const RUNTIME_FUNCTION_CATALOG = RUNTIME_FUNCTIONS.map(toCatalogItem);
export const FULL_CATALOG = [...PLATFORM_CATALOG, ...RUNTIME_FUNCTION_CATALOG];

const SHOWCASE_GROUP_ORDER: GroupKey[] = ['core', 'ffp', 'mcp', 'skills', 'auth', 'ui', 'ops', 'infra', 'advanced'];

export const FEATURE_SHOWCASE_CATEGORIES: FeatureShowcaseCategory[] = SHOWCASE_GROUP_ORDER.map(groupKey => {
  const group = GROUPS[groupKey];
  return {
    key: groupKey,
    name: group.name,
    badge: group.badge,
    description: group.description,
    features: PLATFORM_CATALOG.filter(item => item.group === groupKey),
  };
});

export function getCatalogItem(slug: string): FeatureCatalogItem | undefined {
  return FULL_CATALOG.find(item => item.slug === slug);
}

export function getCatalogItemsByKind(kind: CatalogKind): FeatureCatalogItem[] {
  return FULL_CATALOG.filter(item => item.kind === kind);
}

export function getFeatureCoverageSummary() {
  return {
    platformFeatures: PLATFORM_CATALOG.length,
    runtimeFunctions: RUNTIME_FUNCTION_CATALOG.length,
    totalCatalogItems: FULL_CATALOG.length,
  };
}
