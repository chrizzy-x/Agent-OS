import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';
import { APP_URL as BASE } from '@/lib/config';

interface Endpoint {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  auth: 'None' | 'Browser Session or Bearer (Agent)' | 'Browser Session or Bearer (Ops Admin)' | 'Bearer (Cron/Admin)' | 'Bearer (SDK Kernel)';
  desc: string;
  body?: { field: string; type: string; required: boolean; desc: string }[];
  response?: string;
}

const endpoints: Endpoint[] = [
  {
    method: 'GET', path: '/health', auth: 'None',
    desc: 'Liveness check for the production app and tool registry.',
    response: '{ "status": "ok", "version": "6.2.0", "timestamp": "...", "tools": 32 }',
  },
  {
    method: 'GET', path: '/tools', auth: 'None',
    desc: 'List the universal MCP tool registry exposed by Agent OS.',
    response: '{ "tools": [{ "name": "agentos.mem_set", "description": "...", "inputSchema": {...} }] }',
  },
  {
    method: 'POST', path: '/register', auth: 'None',
    desc: 'Self-service external-agent registration. Creates a private internal identifier automatically and returns a 90-day bearer token for universal MCP access.',
    body: [
      { field: 'name', type: 'string', required: true, desc: 'Human-readable agent name' },
      { field: 'description', type: 'string', required: false, desc: 'Optional summary of what the agent does' },
      { field: 'ownerEmail', type: 'string', required: false, desc: 'Optional owner contact email' },
      { field: 'allowedDomains', type: 'string[]', required: false, desc: 'Optional outbound domain allowlist. Empty means all domains allowed.' },
      { field: 'allowedTools', type: 'string[]', required: false, desc: 'Optional tool permission list. Defaults to all built-in agentos.* primitives.' },
    ],
    response: '{ "token": "eyJ...", "expiresIn": "90d", "allowedDomains": ["httpbin.org"], "allowedTools": ["agentos.net_http_get"], "mcpEndpoint": "https://agentos-app.vercel.app/mcp", "toolsEndpoint": "https://agentos-app.vercel.app/tools" }',
  },
  {
    method: 'GET', path: '/agent/me', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Return the current external-agent registration details without reissuing the token.',
    response: '{ "name": "My Agent", "status": "active", "allowedDomains": ["httpbin.org"], "allowedTools": ["agentos.net_http_get"], "totalCalls": 1, "lastActiveAt": "...", "createdAt": "...", "mcpEndpoint": "https://agentos-app.vercel.app/mcp", "toolsEndpoint": "https://agentos-app.vercel.app/tools" }',
  },
  {
    method: 'GET', path: '/api/agents', auth: 'Browser Session or Bearer (Agent)',
    desc: 'List deployed agents and subagents for the current operator. Private agent IDs are never returned; use the returned public action reference only when calling agent action routes.',
    response: '{ "agents": [{ "agentRef": "agref-...", "name": "Research Agent", "isSubagent": false, "status": "active" }] }',
  },
  {
    method: 'POST', path: '/api/agents', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Deploy a named subagent. Pass parentAgentRef from /api/agents when nesting under another deployed agent.',
    body: [
      { field: 'name', type: 'string', required: true, desc: 'Unique subagent display name' },
      { field: 'description', type: 'string', required: false, desc: 'Optional purpose summary' },
      { field: 'parentAgentRef', type: 'string', required: false, desc: 'Public action reference from /api/agents; never a private agent ID' },
    ],
    response: '{ "agent": { "agentRef": "agref-...", "name": "Research Subagent", "isSubagent": true, "status": "active" }, "apiKey": "eyJ..." }',
  },
  {
    method: 'POST', path: '/api/signup', auth: 'None',
    desc: 'Create an AgentOS account, provision the default workspace surfaces, start a secure browser session, and return a 90-day bearer token only on plans with bearer access.',
    body: [
      { field: 'email', type: 'string', required: true, desc: 'Valid email address' },
      { field: 'password', type: 'string', required: true, desc: 'At least 8 characters' },
      { field: 'agentName', type: 'string', required: false, desc: 'Optional display name for the new agent' },
      { field: 'accountType', type: 'retail | enterprise', required: true, desc: 'Retail or enterprise signup surface' },
      { field: 'selectedPlan', type: 'retail_free | retail_pro | enterprise_plus | enterprise_max', required: true, desc: 'Beta plan selected during signup' },
      { field: 'planSelectionSkipped', type: 'boolean', required: false, desc: 'Internal onboarding fallback. Defaults to false.' },
    ],
    response: '{ "success": true, "redirectTo": "/studio", "credentials": { "bearerToken": "eyJ..." | null, "apiKey": "eyJ..." | null, "plan": "retail_pro", "planLabel": "Retail Pro", "capabilities": ["use_nl_studio", "use_bearer_token"], "expiresIn": "90 days" } }',
  },
  {
    method: 'POST', path: '/api/signin', auth: 'None',
    desc: 'Authenticate an existing account, refresh the secure browser session, and return a fresh external bearer token.',
    body: [
      { field: 'email', type: 'string', required: true, desc: 'Account email address' },
      { field: 'password', type: 'string', required: true, desc: 'Existing account password' },
    ],
    response: '{ "success": true, "credentials": { "bearerToken": "eyJ...", "apiKey": "eyJ...", "agentName": "My Agent", "expiresIn": "90 days" } }',
  },
  {
    method: 'GET', path: '/api/session', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Return the current authenticated browser session or bearer-backed session state. Internal identifiers are private and not displayed in public docs.',
    response: '{ "authenticated": true, "session": { "agentName": "My Agent", "expiresAt": "..." } }',
  },
  {
    method: 'DELETE', path: '/api/session', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Clear the current browser session cookie.',
    response: '{ "success": true }',
  },
  {
    method: 'POST', path: '/api/session/token', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Mint a fresh bearer token for external API, SDK, or CLI use while keeping the browser session active. Requires a plan with bearer-token capability.',
    response: '{ "success": true, "credentials": { "bearerToken": "eyJ...", "apiKey": "eyJ...", "expiresIn": "90 days" } }',
  },
  {
    method: 'POST', path: '/api/plans/transition', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Transition the authenticated account and its primary workspace to another public beta plan. Free beta mode records the transition and applies no charge.',
    body: [
      { field: 'newPlan', type: 'retail_free | retail_pro | enterprise_plus | enterprise_max', required: true, desc: 'Target beta plan' },
      { field: 'reason', type: 'string', required: false, desc: 'Optional audit reason. Defaults to beta_self_serve_upgrade.' },
    ],
    response: '{ "transitioned": true, "noChange": false, "transition": { "oldPlan": "retail_free", "newPlan": "retail_pro", "newCapabilities": ["use_bearer_token"] }, "billing": { "mode": "free_beta", "charged": false } }',
  },
  {
    method: 'GET', path: '/api/social/platforms', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Optional example integration route: return the social-platform catalog, including which connectors are live and how many X accounts are currently connected.',
    response: '{ "platforms": [{ "id": "x", "status": "live", "connectorReady": true, "connectedCount": 1 }, { "id": "facebook", "status": "scaffolded", "connectorReady": false, "connectedCount": 0 }] }',
  },
  {
    method: 'POST', path: '/api/x/connect', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Optional example integration route: start the X OAuth authorization flow for the current operator session.',
    body: [
      { field: 'redirectTo', type: 'string', required: false, desc: 'Optional in-app path to return to after OAuth completes' },
    ],
    response: '{ "authorizationUrl": "https://x.com/i/oauth2/authorize?..." }',
  },
  {
    method: 'GET', path: '/api/x/accounts', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Optional example integration route: list connected X accounts visible to the current operator without exposing private child-agent IDs.',
    response: '{ "accounts": [{ "id": "...", "username": "brand_handle", "status": "active" }] }',
  },
  {
    method: 'GET', path: '/api/x/drafts', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Optional example integration route: list X drafts awaiting review, including guardrail status, reasons, and approval state.',
    response: '{ "drafts": [{ "id": "...", "kind": "post", "approval_status": "required", "guardrail_status": "review", "guardrail_reasons": ["..."], "similarity_score": 0.14 }] }',
  },
  {
    method: 'GET', path: '/api/x/queue', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Optional example integration route: list queued, published, failed, or canceled X publish items for the authenticated operator.',
    response: '{ "queue": [{ "id": "...", "publish_status": "queued", "scheduled_for": "...", "account": { "username": "brand_handle" } }] }',
  },
  {
    method: 'POST', path: '/api/x/publish', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Optional example integration route: publish an approved X draft immediately or force a queued publish item to run now.',
    body: [
      { field: 'draftId', type: 'string', required: false, desc: 'Draft UUID to publish immediately' },
      { field: 'queueId', type: 'string', required: false, desc: 'Queue UUID to publish immediately' },
    ],
    response: '{ "draftId": "...", "queueId": "...", "postId": "...", "publishedAt": "..." }',
  },
  {
    method: 'POST', path: '/api/forgot-password', auth: 'None',
    desc: 'Request a password reset. Production returns a generic success response even when the account does not exist.',
    body: [
      { field: 'email', type: 'string', required: true, desc: 'Account email address' },
    ],
    response: '{ "success": true }',
  },
  {
    method: 'POST', path: '/api/forgot-password/confirm', auth: 'None',
    desc: 'Confirm a password reset with the emailed token and a new password.',
    body: [
      { field: 'email', type: 'string', required: true, desc: 'Account email address' },
      { field: 'token', type: 'string', required: true, desc: 'Reset token from the password reset link' },
      { field: 'newPassword', type: 'string', required: true, desc: 'At least 8 characters' },
    ],
    response: '{ "success": true }',
  },
  {
    method: 'POST', path: '/mcp', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Execute any Agent OS primitive, runtime function, installed skill capability, or external MCP tool through the universal MCP router.',
    body: [
      { field: 'tool', type: 'string', required: true, desc: 'Universal tool name such as agentos.mem_set or mcp.github.create_issue' },
      { field: 'input', type: 'object', required: false, desc: 'Normalized tool arguments' },
      { field: 'arguments', type: 'object', required: false, desc: 'Alias for input' },
      { field: 'server', type: 'string', required: false, desc: 'Optional MCP server hint for legacy clients' },
    ],
    response: '{ "success": true, "result": <tool-specific result> }',
  },
  {
    method: 'GET', path: '/api/connectors', auth: 'Browser Session or Bearer (Agent)',
    desc: 'List universal MCP connectors with real tool counts, health, permission scope, last audit outcome, and related apps, workflows, and skills.',
    response: '{ "connectors": [{ "slug": "github", "toolCount": 12, "healthStatus": "active", "permissionScope": { "apps": ["issue-triage"] }, "lastAuditOutcome": { "success": true, "tool": "mcp.github.create_issue" }, "usedBy": { "apps": [...], "workflows": [...], "skills": [...] } }] }',
  },
  {
    method: 'GET', path: '/api/ffp/routes', auth: 'Browser Session or Bearer (Agent)',
    desc: 'List recorded FFP runtime executions with route decisions, fallback lineage, invoker lineage, and related apps, workflows, and skills.',
    response: '{ "routes": [{ "tool": "mcp.github.create_issue", "primitive": "github", "fallbackUsed": false, "invokedByType": "workflow", "routeDecision": { "source": "external_mcp" }, "related": { "apps": [...], "workflows": [...], "skills": [...] } }], "primitives": [{ "primitive": "github", "executions": 4, "fallbackCount": 1 }] }',
  },
  {
    method: 'POST', path: '/api/studio/command', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Run a Studio command. Mutating commands return a preview first and require a confirmation token on the second request.',
    body: [
      { field: 'command', type: 'string', required: true, desc: 'Strict Studio command string' },
      { field: 'confirmToken', type: 'string', required: false, desc: 'Short-lived token returned by preview responses' },
      { field: 'advancedMode', type: 'boolean', required: false, desc: 'Must be true for advanced sandbox commands' },
    ],
    response: '{ "kind": "help|preview|result|error", "summary": "...", "result": {...}, "snippet": "..." }',
  },
  {
    method: 'GET', path: '/api/skills', auth: 'None',
    desc: 'Browse published Skill Store skills. Supports category, search, sort, page, limit, and author query params.',
    response: '{ "skills": [...], "pagination": { "page": 1, "limit": 50, "total": 54 } }',
  },
  {
    method: 'GET', path: '/api/apps', auth: 'None',
    desc: 'Browse published App Store listings. Supports category, search, and sort query params.',
    response: '{ "apps": [...], "categories": ["All", "Research", "..."], "pagination": { "total": 6 } }',
  },
  {
    method: 'GET', path: '/api/apps/{slug}', auth: 'None',
    desc: 'Load a single App Store listing by slug. Includes visibility filtering and an owner flag when the caller is authenticated.',
    response: '{ "app": {...}, "viewerOwnsApp": false }',
  },
  {
    method: 'GET', path: '/api/apps/{slug}/readiness', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Resolve app readiness for the current viewer: installation state, required permissions, missing permissions, missing secrets, missing skills, updateAvailable, and target URLs.',
    response: '{ "installation": {...}, "requiredPermissions": ["vault"], "missingPermissions": [], "missingSecrets": [], "missingSkills": [], "ready": true, "updateAvailable": false, "targets": [{ "target": "web", "url": "https://..." }] }',
  },
  {
    method: 'POST', path: '/api/apps', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Publish a full agentic app to the App Store automatically.',
    body: [
      { field: 'name', type: 'string', required: true, desc: 'Human-readable app name' },
      { field: 'category', type: 'string', required: true, desc: 'App Store category such as Research, Finance, Data, or Operations' },
      { field: 'description', type: 'string', required: true, desc: 'Short listing description' },
      { field: 'deviceTargets', type: 'string[]', required: false, desc: 'Targets such as AgentOS Desktop, AgentOS Cloud, or Enterprise Workspace' },
      { field: 'manifest', type: 'object', required: false, desc: 'Runtime, entrypoint, primitives, skills, permissions, required secrets, and commands' },
      { field: 'defaultConfig', type: 'object', required: false, desc: 'Default app configuration. Do not include secrets.' },
    ],
    response: '{ "success": true, "app": { "slug": "invoice-ops-agent", "published": true } }',
  },
  {
    method: 'POST', path: '/api/apps/install', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Install or update an app for the current agent after re-running readiness checks.',
    body: [
      { field: 'slug', type: 'string', required: true, desc: 'App slug' },
      { field: 'workspaceId', type: 'string', required: false, desc: 'Optional workspace override' },
      { field: 'permissionsApproved', type: 'string[]', required: false, desc: 'Permission approvals to apply during install' },
    ],
    response: '{ "app": {...}, "installation": {...}, "readiness": { "ready": true, "targets": [{ "target": "web", "url": "https://..." }] } }',
  },
  {
    method: 'GET', path: '/api/apps/installed', auth: 'Browser Session or Bearer (Agent)',
    desc: 'List installed apps and their readiness state for the current agent.',
    response: '{ "installedApps": [{ "slug": "research-kit", "installation": {...}, "readiness": { "ready": true, "updateAvailable": false } }] }',
  },
  {
    method: 'POST', path: '/api/apps/{slug}/open', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Open an installed app on a specific target. Re-runs readiness and returns typed failures when the app is stale.',
    body: [
      { field: 'target', type: 'string', required: false, desc: 'One of web, android, or ios. Defaults to web.' },
    ],
    response: '{ "app": {...}, "installation": {...}, "openUrl": "https://...", "target": "web" }',
  },
  {
    method: 'PATCH', path: '/api/apps/{slug}/installation', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Update installation state: favorite, permissionsApproved, active, or disabled.',
    body: [
      { field: 'favorite', type: 'boolean', required: false, desc: 'Pin or unpin the installed app' },
      { field: 'permissionsApproved', type: 'string[]', required: false, desc: 'Updated permission approval set' },
      { field: 'status', type: 'string', required: false, desc: 'active, disabled, or removed' },
    ],
    response: '{ "app": {...}, "installation": {...} }',
  },
  {
    method: 'DELETE', path: '/api/apps/{slug}/installation', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Uninstall an app for the current agent.',
    response: '{ "removed": true, "app": {...}, "installation": {...} }',
  },
  {
    method: 'GET', path: '/api/apps/{slug}/download', auth: 'None',
    desc: 'Download an AgentOS app package for device or workspace installation.',
    response: '{ "schema": "agentos.app.v1", "app": {...}, "manifest": {...}, "defaultConfig": {...} }',
  },
  {
    method: 'POST', path: '/api/vault/access', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Validate assignment and create a temporary runtime secret grant for a skill or app-backed runtime subject.',
    body: [
      { field: 'action', type: 'string', required: true, desc: 'Use runtime for runtime grants' },
      { field: 'workspaceId', type: 'string', required: true, desc: 'Workspace that owns the secret' },
      { field: 'secretName', type: 'string', required: true, desc: 'Vault secret name' },
      { field: 'subjectType', type: 'string', required: true, desc: 'skill or app' },
      { field: 'subjectId', type: 'string', required: true, desc: 'Runtime subject identifier' },
      { field: 'appSlug', type: 'string', required: false, desc: 'Required for app-scoped permission validation' },
    ],
    response: '{ "granted": true, "grant": { "id": "...", "name": "OPENAI_API_KEY", "status": "active", "expiresAt": "..." } }',
  },
  {
    method: 'POST', path: '/api/vault/runtime-grants/consume', auth: 'Bearer (SDK Kernel)',
    desc: 'Consume or clean up a runtime secret grant from an authenticated SDK kernel runtime.',
    body: [
      { field: 'grantId', type: 'string', required: true, desc: 'Runtime grant id from /api/vault/access' },
      { field: 'action', type: 'string', required: false, desc: 'Use cleanup to revoke without consuming again' },
    ],
    response: '{ "secret": { "name": "OPENAI_API_KEY", "value": "..." }, "grant": { "id": "...", "status": "consumed" } }',
  },
  {
    method: 'POST', path: '/api/skills/install', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Install a published skill for the authenticated agent.',
    body: [
      { field: 'skill_id', type: 'string', required: true, desc: 'Skill UUID from the Skill Store listing' },
    ],
    response: '{ "success": true, "installation": { "id": "...", "installed_at": "..." } }',
  },
  {
    method: 'GET', path: '/api/skills/installed', auth: 'Browser Session or Bearer (Agent)',
    desc: 'List installed skills for the authenticated agent.',
    response: '{ "installed_skills": [{ "id": "...", "installed_at": "...", "skill": {...} }] }',
  },
  {
    method: 'POST', path: '/api/skills/use', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Run a capability from an installed skill in the hardened skill runtime.',
    body: [
      { field: 'skill_slug', type: 'string', required: true, desc: 'Installed skill slug' },
      { field: 'capability', type: 'string', required: true, desc: 'Capability method name' },
      { field: 'params', type: 'object', required: false, desc: 'Capability input payload' },
    ],
    response: '{ "success": true, "result": <any>, "execution_time_ms": 12 }',
  },
  {
    method: 'GET', path: '/api/ops/metrics', auth: 'None',
    desc: 'Return public aggregate ops coverage and health metrics. Detailed internals are only returned to ops-admin callers.',
    response: '{ "summary": {...}, "settings": {...}, "metrics": {...}, "requiresAuthForDetails": true }',
  },
  {
    method: 'GET', path: '/api/ops/crew', auth: 'None',
    desc: 'Return the public crew coverage summary. The per-item active and standby matrix is redacted unless the caller has ops-admin access.',
    response: '{ "summary": {...}, "settings": {...}, "coverage": {...}, "requiresAuthForDetails": true }',
  },
  {
    method: 'POST', path: '/api/ops/crew/bootstrap', auth: 'Browser Session or Bearer (Ops Admin)',
    desc: 'Idempotently restore active and standby coverage across the canonical feature catalog.',
    response: '{ "success": true, "result": {...} }',
  },
  {
    method: 'POST', path: '/api/ops/crew/failover', auth: 'Browser Session or Bearer (Ops Admin)',
    desc: 'Force a failover for a specific feature or runtime-function slot.',
    body: [
      { field: 'featureSlug', type: 'string', required: true, desc: 'Catalog slug for the target feature or function' },
      { field: 'reason', type: 'string', required: false, desc: 'Optional operator-supplied failover reason' },
    ],
    response: '{ "success": true, "result": {...} }',
  },
  {
    method: 'POST', path: '/api/ops/crew/cron', auth: 'Bearer (Cron/Admin)',
    desc: 'Run the autonomous crew cron cycle manually using the cron secret or admin token.',
    response: '{ "success": true, "result": {...} }',
  },
];

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-800',
  POST: 'bg-blue-100 text-blue-800',
  PATCH: 'bg-amber-100 text-amber-800',
  DELETE: 'bg-rose-100 text-rose-800',
};

const authColors: Record<string, string> = {
  'None': 'text-gray-400',
  'Browser Session or Bearer (Agent)': 'text-blue-600',
  'Browser Session or Bearer (Ops Admin)': 'text-red-600',
  'Bearer (Cron/Admin)': 'text-amber-600',
  'Bearer (SDK Kernel)': 'text-purple-600',
};

export default function ApiReferencePage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono font-bold text-lg text-gray-900">Agent OS</Link>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/docs" className="text-blue-600">Docs</Link>
            <Link href="/docs/launch" className="hover:text-gray-900">Launch Notes</Link>
            <Link href="/docs/audit" className="hover:text-gray-900">Audit</Link>
            <Link href="/connectors" className="hover:text-gray-900">Connectors</Link>
            <Link href="/studio" className="hover:text-gray-900">Studio</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">API Reference</h1>
        <p className="text-lg text-gray-500 mb-4">
          Production route contracts verified against the live Agent OS deployment.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-10 text-sm text-amber-800">
          <strong>Authentication:</strong> the web app uses a secure browser session cookie after <code className="font-mono bg-amber-100 px-1 rounded">/api/signup</code> or <code className="font-mono bg-amber-100 px-1 rounded">/api/signin</code>. External callers should use the returned <code className="font-mono bg-amber-100 px-1 rounded">bearerToken</code> when the active plan includes bearer access. The legacy <code className="font-mono bg-amber-100 px-1 rounded">apiKey</code> field remains as an alias for compatibility.
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-10 text-sm text-blue-800">
          <strong>Base URL:</strong> <code className="font-mono bg-blue-100 px-1 rounded">{BASE}</code>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-10 text-sm text-gray-700">
          <strong>Product direction:</strong> Agent OS is infrastructure first. Any social or X routes listed below are optional example integrations, not required parts of the core agent runtime.
        </div>

        <div className="bg-gray-950 text-green-400 font-mono text-sm px-5 py-3 rounded-lg mb-10">
          {BASE}
        </div>

        <div className="space-y-5">
          {endpoints.map((ep, index) => (
            <div key={`${ep.path}-${index}`} className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-start gap-3 bg-gray-50 px-5 py-4 border-b border-gray-200">
                <span className={`text-xs font-bold px-2 py-1 rounded font-mono flex-shrink-0 mt-0.5 ${methodColors[ep.method]}`}>
                  {ep.method}
                </span>
                <div className="flex-1">
                  <code className="font-mono text-sm font-semibold text-gray-900">{ep.path}</code>
                  <div className={`text-xs mt-0.5 ${authColors[ep.auth]}`}>Auth: {ep.auth}</div>
                </div>
              </div>

              <div className="px-5 py-4 space-y-4">
                <p className="text-sm text-gray-600">{ep.desc}</p>

                {ep.body && ep.body.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Request Body</div>
                    <div className="space-y-1.5">
                      {ep.body.map(field => (
                        <div key={field.field} className="flex items-start gap-3 text-sm">
                          <code className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-xs flex-shrink-0">
                            {field.field}
                          </code>
                          <span className="text-gray-400 text-xs flex-shrink-0">{field.type}</span>
                          {field.required && (
                            <span className="text-red-500 text-xs flex-shrink-0">required</span>
                          )}
                          <span className="text-gray-600 text-xs">{field.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {ep.response && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Response</div>
                    <code className="block text-xs font-mono bg-gray-900 text-gray-300 px-3 py-2 rounded overflow-x-auto">
                      {ep.response}
                    </code>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <DocsFooter />
    </div>
  );
}
