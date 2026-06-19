import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';
import { APP_URL } from '@/lib/config';

const endpoints = [
  {
    method: 'GET',
    path: '/api/ffp/temp',
    auth: 'Browser Session or Bearer',
    desc: 'Returns the workspace FFP temp status, current route, affected execution types, and bypassed single-agent execution types.',
  },
  {
    method: 'PATCH',
    path: '/api/ffp/temp',
    auth: 'Browser Session or Bearer',
    desc: 'Returns 405 Method Not Allowed. FFP cannot be activated in v6.6.3.',
  },
];

export default function FFPPage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-100 sticky top-0 z-40 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono font-bold text-lg text-gray-900">Agent OS</Link>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/docs" className="text-blue-600">Docs</Link>
            <Link href="/docs/api" className="hover:text-gray-900">API</Link>
            <Link href="/ffp" className="hover:text-gray-900">FFP</Link>
            <Link href="/studio" className="hover:text-gray-900">Studio</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-12 space-y-10">
        <section>
          <div className="inline-block bg-purple-50 text-purple-700 text-sm font-medium px-3 py-1 rounded-full mb-4">
            Coming Soon
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-3">FFP is disabled</h1>
          <p className="text-lg text-gray-500">
            AgentOS v6.6.3 retains FFP compatibility data, but all runtime execution bypasses FFP. No activation control, consensus engine, validator voting, or proposal history is available.
          </p>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">Routing behavior</h2>
          <div className="space-y-3 text-sm text-gray-600">
            <p><strong>FFP Disabled:</strong> multi-agent activities route directly to the Unified Execution Engine.</p>
            <p><strong>FFP activation:</strong> unavailable. PATCH requests return Method Not Allowed.</p>
            <p>All execution types bypass FFP in v6.6.3.</p>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">Affected execution types</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>Multi-agent workflows</li>
            <li>Subagent collaboration</li>
            <li>Multi-agent task delegation</li>
          </ul>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">Routes</h2>
          <div className="space-y-4">
            {endpoints.map(endpoint => (
              <div key={endpoint.path + endpoint.method} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-mono font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">{endpoint.method}</span>
                  <code className="text-sm font-mono text-gray-800">{endpoint.path}</code>
                </div>
                <div className="text-xs text-gray-500 mb-2">Auth: {endpoint.auth}</div>
                <p className="text-sm text-gray-600">{endpoint.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">Example</h2>
          <pre className="bg-gray-950 text-gray-200 rounded-lg p-4 text-xs overflow-x-auto">{`curl -s ${APP_URL}/api/ffp/temp \\
  -H "Authorization: Bearer $TOKEN"

curl -s ${APP_URL}/api/ffp/temp \\
  -X PATCH \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"enabled":true}'
# HTTP 405 Method Not Allowed`}</pre>
        </section>
      </div>

      <DocsFooter />
    </div>
  );
}
