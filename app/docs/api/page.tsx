import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';
import { APP_URL as BASE } from '@/lib/config';

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  auth: 'None' | 'Bearer (Agent)' | 'Bearer (Admin)';
  desc: string;
  body?: { field: string; type: string; required: boolean; desc: string }[];
  response?: string;
}

const endpoints: Endpoint[] = [
  {
    method: 'GET', path: '/', auth: 'None',
    desc: 'Returns API info, version, and list of available endpoints.',
    response: '{ "name": "agent-os", "version": "1.0.0", "endpoints": [...] }',
  },
  {
    method: 'GET', path: '/health', auth: 'None',
    desc: 'Liveness check. Returns current status of all services.',
    response: '{ "status": "ok", "db": "ok", "redis": "ok", "timestamp": "..." }',
  },
  {
    method: 'GET', path: '/tools', auth: 'None',
    desc: 'Returns the full list of available MCP tools with schemas.',
    response: '{ "tools": [{ "name": "mem_set", "description": "...", "inputSchema": {...} }] }',
  },
  {
    method: 'POST', path: '/api/signup', auth: 'None',
    desc: 'Register a new agent. Returns agentId and API key (shown once).',
    body: [
      { field: 'email', type: 'string', required: true, desc: 'Valid email address' },
      { field: 'agentName', type: 'string', required: false, desc: 'Display name for the agent' },
    ],
    response: '{ "success": true, "credentials": { "agentId": "agent_...", "apiKey": "eyJ...", "expiresIn": "90 days" } }',
  },
  {
    method: 'POST', path: '/mcp', auth: 'Bearer (Agent)',
    desc: 'Execute any MCP tool. This is the primary execution endpoint.',
    body: [
      { field: 'tool', type: 'string', required: true, desc: 'Tool name e.g. mem_set, fs_write, db_query' },
      { field: 'input', type: 'object', required: true, desc: 'Tool-specific input parameters' },
    ],
    response: '{ "result": <tool-specific-result> }',
  },
  {
    method: 'GET', path: '/api/skills', auth: 'None',
    desc: 'List published skills. Supports category, search, sort, page, limit query params.',
    response: '{ "skills": [...], "pagination": { "page": 1, "total": 42, "pages": 3 } }',
  },
  {
    method: 'POST', path: '/api/skills', auth: 'Bearer (Agent)',
    desc: 'Publish a new skill to the marketplace.',
    body: [
      { field: 'name', type: 'string', required: true, desc: 'Display name' },
      { field: 'slug', type: 'string', required: true, desc: 'URL slug (lowercase, hyphens)' },
      { field: 'category', type: 'string', required: true, desc: 'Category name' },
      { field: 'description', type: 'string', required: true, desc: 'Short description (1-2 sentences)' },
      { field: 'capabilities', type: 'array', required: true, desc: 'Array of capability objects' },
      { field: 'source_code', type: 'string', required: true, desc: 'JavaScript class Skill { ... }' },
      { field: 'pricing_model', type: 'string', required: false, desc: '"free" or "usage"' },
    ],
    response: '{ "skill": { "id": "...", "slug": "...", ... } }',
  },
  {
    method: 'GET', path: '/api/skills/:id', auth: 'None',
    desc: 'Get full skill details by UUID or slug. Includes reviews.',
    response: '{ "skill": { "id": "...", "capabilities": [...], "reviews": [...] } }',
  },
  {
    method: 'POST', path: '/api/skills/install', auth: 'Bearer (Agent)',
    desc: 'Install a skill for the authenticated agent.',
    body: [{ field: 'skill_id', type: 'string (UUID)', required: true, desc: 'Skill UUID from listing' }],
    response: '{ "success": true, "installation": { "id": "...", "installed_at": "..." } }',
  },
  {
    method: 'DELETE', path: '/api/skills/uninstall', auth: 'Bearer (Agent)',
    desc: 'Uninstall a previously installed skill.',
    body: [{ field: 'skill_id', type: 'string (UUID)', required: true, desc: 'Skill UUID to uninstall' }],
    response: '{ "success": true }',
  },
  {
    method: 'GET', path: '/api/skills/installed', auth: 'Bearer (Agent)',
    desc: 'List all skills installed by the authenticated agent.',
    response: '{ "installed_skills": [{ "skill": {...}, "installed_at": "..." }] }',
  },
  {
    method: 'POST', path: '/api/skills/use', auth: 'Bearer (Agent)',
    desc: 'Execute a capability of an installed skill.',
    body: [
      { field: 'skill_slug', type: 'string', required: true, desc: 'The skill slug' },
      { field: 'capability', type: 'string', required: true, desc: 'Capability method name' },
      { field: 'params', type: 'object', required: false, desc: 'Parameters passed to the capability' },
    ],
    response: '{ "success": true, "result": <any>, "execution_time_ms": 12 }',
  },
  {
    method: 'POST', path: '/api/skills/:id/review', auth: 'Bearer (Agent)',
    desc: 'Submit or update a rating and review for a skill.',
    body: [
      { field: 'rating', type: 'integer (1–5)', required: true, desc: 'Star rating' },
      { field: 'review_title', type: 'string', required: false, desc: 'Short review title' },
      { field: 'review_text', type: 'string', required: false, desc: 'Detailed review text' },
    ],
    response: '{ "success": true, "review": { "rating": 5, ... } }',
  },
  {
    method: 'GET', path: '/api/developer/earnings', auth: 'Bearer (Agent)',
    desc: 'Get revenue earnings summary for the authenticated developer (70% of usage revenue).',
    response: '{ "this_month": "12.34", "last_month": "9.01", "all_time": "45.00", "per_skill": [...] }',
  },
  {
    method: 'GET', path: '/api/developer/analytics', auth: 'Bearer (Agent)',
    desc: 'Get usage analytics for your skills. Query params: skill_id, days (1–90).',
    response: '{ "usage_by_day": [...], "totals": { "calls": 1200, "errors": 3, "avg_ms": 18 } }',
  },
  {
    method: 'POST', path: '/admin/agents', auth: 'Bearer (Admin)',
    desc: 'Create a new agent token (admin-only). Requires ADMIN_TOKEN environment variable.',
    body: [
      { field: 'agentId', type: 'string', required: true, desc: 'Agent ID to issue token for' },
      { field: 'expiresIn', type: 'string', required: false, desc: 'Token lifetime e.g. "90d"' },
    ],
    response: '{ "token": "eyJ..." }',
  },
  {
    method: 'GET', path: '/ffp/status', auth: 'None',
    desc: 'Returns FFP (Furge Fabric Protocol) mode and configuration.',
    response: '{ "mode": "disabled", "chainId": null, "requiresConsensus": false }',
  },
  {
    method: 'GET', path: '/ffp/audit/:agentId', auth: 'Bearer (Admin)',
    desc: 'Query the FFP audit log for a specific agent.',
    response: '{ "logs": [...] }',
  },
];

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-800',
  POST: 'bg-blue-100 text-blue-800',
  PUT: 'bg-amber-100 text-amber-800',
  DELETE: 'bg-red-100 text-red-800',
};

const authColors: Record<string, string> = {
  'None': 'text-gray-400',
  'Bearer (Agent)': 'text-blue-600',
  'Bearer (Admin)': 'text-red-600',
};

export default function ApiReferencePage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono font-bold text-lg text-gray-900">Agent OS</Link>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/docs" className="text-blue-600">← Docs</Link>
            <Link href="/docs/primitives" className="hover:text-gray-900">Primitives</Link>
            <Link href="/docs/skills" className="hover:text-gray-900">Skills</Link>
            <Link href="/docs/sdk" className="hover:text-gray-900">SDK</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">API Reference</h1>
        <p className="text-lg text-gray-500 mb-4">
          All Agent OS REST endpoints in one place.
        </p>

        {/* Auth note */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-10 text-sm text-amber-800">
          <strong>Authentication:</strong> Most endpoints require a Bearer token obtained from <code className="font-mono bg-amber-100 px-1 rounded">/api/signup</code>.
          Pass it as <code className="font-mono bg-amber-100 px-1 rounded">Authorization: Bearer &lt;token&gt;</code>.
          Admin endpoints require the <code className="font-mono bg-amber-100 px-1 rounded">ADMIN_TOKEN</code> environment variable value.
        </div>

        {/* Base URL */}
        <div className="bg-gray-950 text-green-400 font-mono text-sm px-5 py-3 rounded-lg mb-10">
          {BASE}
        </div>

        {/* Endpoints */}
        <div className="space-y-5">
          {endpoints.map((ep, i) => (
            <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="flex items-start gap-3 bg-gray-50 px-5 py-4 border-b border-gray-200">
                <span className={`text-xs font-bold px-2 py-1 rounded font-mono flex-shrink-0 mt-0.5 ${methodColors[ep.method]}`}>
                  {ep.method}
                </span>
                <div className="flex-1">
                  <code className="font-mono text-sm font-semibold text-gray-900">{ep.path}</code>
                  <div className={`text-xs mt-0.5 ${authColors[ep.auth]}`}>🔑 {ep.auth}</div>
                </div>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-4">
                <p className="text-sm text-gray-600">{ep.desc}</p>

                {ep.body && ep.body.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Request Body</div>
                    <div className="space-y-1.5">
                      {ep.body.map(f => (
                        <div key={f.field} className="flex items-start gap-3 text-sm">
                          <code className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-xs flex-shrink-0">
                            {f.field}
                          </code>
                          <span className="text-gray-400 text-xs flex-shrink-0">{f.type}</span>
                          {f.required && (
                            <span className="text-red-500 text-xs flex-shrink-0">required</span>
                          )}
                          <span className="text-gray-600 text-xs">{f.desc}</span>
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

        {/* Error codes */}
        <div className="mt-12 border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-5 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">HTTP Error Codes</h2>
          </div>
          <div className="px-5 py-4">
            <div className="space-y-2">
              {[
                { code: '400', msg: 'Bad Request — missing or invalid parameters' },
                { code: '401', msg: 'Unauthorized — missing or invalid Bearer token' },
                { code: '403', msg: 'Forbidden — valid token but insufficient permissions' },
                { code: '404', msg: 'Not Found — resource does not exist' },
                { code: '409', msg: 'Conflict — duplicate resource (e.g. skill slug already taken)' },
                { code: '429', msg: 'Too Many Requests — rate limit exceeded (100 req/min default)' },
                { code: '500', msg: 'Internal Server Error — check error message for details' },
              ].map(e => (
                <div key={e.code} className="flex items-center gap-3 text-sm">
                  <code className="font-mono font-bold text-gray-900 w-8">{e.code}</code>
                  <span className="text-gray-600">{e.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <DocsFooter />
    </div>
  );
}
