import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';
import { APP_URL as BASE } from '@/lib/config';

interface Endpoint {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  auth: 'None' | 'Browser Session or Bearer (Agent)' | 'Browser Session or Bearer (Ops Admin)' | 'Bearer (Cron/Admin)';
  desc: string;
  body?: { field: string; type: string; required: boolean; desc: string }[];
  response?: string;
}

const endpoints: Endpoint[] = [
  {
    method: 'GET', path: '/health', auth: 'None',
    desc: 'Liveness check for the production app and tool registry.',
    response: '{ "status": "ok", "version": "1.0.0", "timestamp": "...", "tools": 32 }',
  },
  {
    method: 'GET', path: '/tools', auth: 'None',
    desc: 'List the universal MCP tool registry exposed by Agent OS.',
    response: '{ "tools": [{ "name": "agentos.mem_set", "description": "...", "inputSchema": {...} }] }',
  },
  {
    method: 'POST', path: '/register', auth: 'None',
    desc: 'Self-service external-agent registration. Creates a registry record and returns a 90-day bearer token for universal MCP access.',
    body: [
      { field: 'agentId', type: 'string', required: true, desc: 'Lowercase agent identifier using letters, numbers, and hyphens only' },
      { field: 'name', type: 'string', required: true, desc: 'Human-readable agent name' },
      { field: 'description', type: 'string', required: false, desc: 'Optional summary of what the agent does' },
      { field: 'ownerEmail', type: 'string', required: false, desc: 'Optional owner contact email' },
      { field: 'allowedDomains', type: 'string[]', required: false, desc: 'Optional outbound domain allowlist. Empty means all domains allowed.' },
      { field: 'allowedTools', type: 'string[]', required: false, desc: 'Optional tool permission list. Defaults to all built-in agentos.* primitives.' },
    ],
    response: '{ "agentId": "external-agent", "token": "eyJ...", "expiresIn": "90d", "allowedDomains": ["httpbin.org"], "allowedTools": ["agentos.net_http_get"], "mcpEndpoint": "https://agentos-app.vercel.app/mcp", "toolsEndpoint": "https://agentos-app.vercel.app/tools" }',
  },
  {
    method: 'GET', path: '/agent/me', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Return the current external-agent registration details without reissuing the token.',
    response: '{ "agentId": "external-agent", "name": "My Agent", "status": "active", "allowedDomains": ["httpbin.org"], "allowedTools": ["agentos.net_http_get"], "totalCalls": 1, "lastActiveAt": "...", "createdAt": "...", "mcpEndpoint": "https://agentos-app.vercel.app/mcp", "toolsEndpoint": "https://agentos-app.vercel.app/tools" }',
  },
  {
    method: 'POST', path: '/api/signup', auth: 'None',
    desc: 'Create an agent account, start a secure browser session, and return a 90-day bearer token for external use.',
    body: [
      { field: 'email', type: 'string', required: true, desc: 'Valid email address' },
      { field: 'password', type: 'string', required: true, desc: 'At least 8 characters' },
      { field: 'agentName', type: 'string', required: false, desc: 'Optional display name for the new agent' },
    ],
    response: '{ "success": true, "credentials": { "agentId": "agent_...", "bearerToken": "eyJ...", "apiKey": "eyJ...", "expiresIn": "90 days" } }',
  },
  {
    method: 'POST', path: '/api/signin', auth: 'None',
    desc: 'Authenticate an existing account, refresh the secure browser session, and return a fresh external bearer token.',
    body: [
      { field: 'email', type: 'string', required: true, desc: 'Account email address' },
      { field: 'password', type: 'string', required: true, desc: 'Existing account password' },
    ],
    response: '{ "success": true, "credentials": { "agentId": "agent_...", "bearerToken": "eyJ...", "apiKey": "eyJ...", "agentName": "My Agent", "expiresIn": "90 days" } }',
  },
  {
    method: 'GET', path: '/api/session', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Return the current authenticated browser session or bearer-backed session state.',
    response: '{ "authenticated": true, "session": { "agentId": "agent_...", "agentName": "My Agent", "expiresAt": "..." } }',
  },
  {
    method: 'DELETE', path: '/api/session', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Clear the current browser session cookie.',
    response: '{ "success": true }',
  },
  {
    method: 'POST', path: '/api/session/token', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Mint a fresh bearer token for external API, SDK, or CLI use while keeping the browser session active.',
    response: '{ "success": true, "credentials": { "agentId": "agent_...", "bearerToken": "eyJ...", "apiKey": "eyJ...", "expiresIn": "90 days" } }',
  },
  {
    method: 'GET', path: '/api/social/platforms', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Return the Social Ops platform catalog, including which networks are live, which credential families are configured, and how many X accounts are currently connected.',
    response: '{ "platforms": [{ "id": "x", "status": "live", "connectorReady": true, "connectedCount": 1 }, { "id": "facebook", "status": "scaffolded", "connectorReady": false, "connectedCount": 0 }] }',
  },
  {
    method: 'POST', path: '/api/x/connect', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Start the X OAuth authorization flow for the current operator session.',
    body: [
      { field: 'redirectTo', type: 'string', required: false, desc: 'Optional in-app path to return to after OAuth completes' },
    ],
    response: '{ "authorizationUrl": "https://x.com/i/oauth2/authorize?..." }',
  },
  {
    method: 'GET', path: '/api/x/accounts', auth: 'Browser Session or Bearer (Agent)',
    desc: 'List connected X accounts visible to the current operator, including owner and child-agent mapping.',
    response: '{ "accounts": [{ "id": "...", "username": "brand_handle", "child_agent_id": "x_brand_...", "status": "active" }] }',
  },
  {
    method: 'GET', path: '/api/x/drafts', auth: 'Browser Session or Bearer (Agent)',
    desc: 'List X drafts awaiting review, including guardrail status, reasons, and approval state.',
    response: '{ "drafts": [{ "id": "...", "kind": "post", "approval_status": "required", "guardrail_status": "review", "guardrail_reasons": ["..."], "similarity_score": 0.14 }] }',
  },
  {
    method: 'GET', path: '/api/x/queue', auth: 'Browser Session or Bearer (Agent)',
    desc: 'List queued, published, failed, or canceled X publish items for the authenticated operator.',
    response: '{ "queue": [{ "id": "...", "publish_status": "queued", "scheduled_for": "...", "account": { "username": "brand_handle" } }] }',
  },
  {
    method: 'POST', path: '/api/x/publish', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Publish an approved X draft immediately or force a queued publish item to run now.',
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
    desc: 'Browse published marketplace skills. Supports category, search, sort, page, limit, and author query params.',
    response: '{ "skills": [...], "pagination": { "page": 1, "limit": 50, "total": 54 } }',
  },
  {
    method: 'POST', path: '/api/skills/install', auth: 'Browser Session or Bearer (Agent)',
    desc: 'Install a published skill for the authenticated agent.',
    body: [
      { field: 'skill_id', type: 'string', required: true, desc: 'Skill UUID from the marketplace listing' },
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
  DELETE: 'bg-rose-100 text-rose-800',
};

const authColors: Record<string, string> = {
  'None': 'text-gray-400',
  'Browser Session or Bearer (Agent)': 'text-blue-600',
  'Browser Session or Bearer (Ops Admin)': 'text-red-600',
  'Bearer (Cron/Admin)': 'text-amber-600',
};

export default function ApiReferencePage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono font-bold text-lg text-gray-900">Agent OS</Link>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/docs" className="text-blue-600">Docs</Link>
            <Link href="/docs/social-ops" className="hover:text-gray-900">Social Ops</Link>
            <Link href="/docs/launch" className="hover:text-gray-900">Launch Notes</Link>
            <Link href="/docs/audit" className="hover:text-gray-900">Audit</Link>
            <Link href="/connect" className="hover:text-gray-900">Connect</Link>
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
          <strong>Authentication:</strong> the web app uses a secure browser session cookie after <code className="font-mono bg-amber-100 px-1 rounded">/api/signup</code> or <code className="font-mono bg-amber-100 px-1 rounded">/api/signin</code>. External callers should use the returned <code className="font-mono bg-amber-100 px-1 rounded">bearerToken</code>. The legacy <code className="font-mono bg-amber-100 px-1 rounded">apiKey</code> field remains as an alias for compatibility.
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-10 text-sm text-blue-800">
          <strong>Canonical production URL:</strong> <code className="font-mono bg-blue-100 px-1 rounded">{BASE}</code>.
          The custom domain <code className="font-mono bg-blue-100 px-1 rounded">https://agentos.service</code> is still activating until the apex DNS A record points to Vercel.
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


