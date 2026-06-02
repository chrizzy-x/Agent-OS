import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';
import { APP_URL } from '@/lib/config';

const endpoints = [
  {
    method: 'GET',
    path: '/ffp/status',
    auth: 'None',
    desc: 'Returns the deployment FFP runtime summary: enabled flag, chain id, node url, and whether consensus is required.',
  },
  {
    method: 'GET',
    path: '/api/ffp/chains',
    auth: 'None',
    desc: 'Public FFP chain discovery. Returns execution totals, success and failure counts, and last execution time per chain.',
  },
  {
    method: 'GET',
    path: '/api/agent/ffp/audit',
    auth: 'Browser Session or Bearer',
    desc: 'Returns the authenticated agent audit history. Supports `chain_id`, `start_time`, and `end_time` query params.',
  },
  {
    method: 'GET',
    path: '/api/agent/ffp/consensus',
    auth: 'Browser Session or Bearer',
    desc: 'Returns the authenticated agent consensus proposal history.',
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
            FFP
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Fabric Flow Protocol</h1>
          <p className="text-lg text-gray-500">
            AgentOS V6.1 exposes FFP as a visible module at <code className="bg-gray-100 px-1 rounded text-sm">/ffp</code>. Retail users see a locked enterprise state. Enterprise users see real runtime status, chain activity, audit history, consensus history, related workflows, related apps, and logs.
          </p>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">What ships</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>Visible FFP navigation for signed-in users.</li>
            <li>Safe locked state for non-enterprise workspaces.</li>
            <li>Runtime summary from <code className="bg-gray-100 px-1 rounded text-sm">/ffp/status</code>.</li>
            <li>Public chain discovery from <code className="bg-gray-100 px-1 rounded text-sm">/api/ffp/chains</code>.</li>
            <li>Authenticated audit and consensus history from agent-scoped routes.</li>
            <li>Real related workflows and installed apps pulled from the current workspace.</li>
          </ul>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">Gating</h2>
          <div className="space-y-3 text-sm text-gray-600">
            <p>Retail users can see the module, but chain details, consensus history, SDK links, developer links, and sensitive FFP configuration stay enterprise-only.</p>
            <p>Enterprise users can inspect chain status, audit entries, proposal history, and related execution surfaces from the main FFP dashboard.</p>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">Environment</h2>
          <pre className="bg-gray-950 text-gray-200 rounded-lg p-4 text-xs overflow-x-auto">{`FFP_MODE=enabled
FFP_CHAIN_ID=your-chain-id
FFP_NODE_URL=https://your-ffp-node.example.com
FFP_REQUIRE_CONSENSUS=false`}</pre>
          <p className="text-sm text-gray-600 mt-4">
            If the deployment does not provide valid FFP configuration, AgentOS keeps the module visible but reports the runtime as disabled.
          </p>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">Routes</h2>
          <div className="space-y-4">
            {endpoints.map(endpoint => (
              <div key={endpoint.path} className="border border-gray-200 rounded-xl p-4">
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
          <pre className="bg-gray-950 text-gray-200 rounded-lg p-4 text-xs overflow-x-auto">{`curl -s ${APP_URL}/ffp/status

curl -s ${APP_URL}/api/ffp/chains

curl -s ${APP_URL}/api/agent/ffp/audit \\
  -H "Authorization: Bearer $TOKEN"

curl -s ${APP_URL}/api/agent/ffp/consensus \\
  -H "Authorization: Bearer $TOKEN"`}</pre>
        </section>
      </div>

      <DocsFooter />
    </div>
  );
}
