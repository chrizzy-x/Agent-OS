import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';
import { APP_URL } from '@/lib/config';

export default function FFPPage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-100 sticky top-0 z-40 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono font-bold text-lg text-gray-900">Agent OS</Link>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/docs" className="text-blue-600">← Docs</Link>
            <Link href="/docs/guide" className="hover:text-gray-900">Guide</Link>
            <Link href="/ops" className="hover:text-gray-900">Ops Console</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="inline-block bg-purple-50 text-purple-700 text-sm font-medium px-3 py-1 rounded-full mb-4">
          Advanced
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-2">FFP — Furge Fabric Protocol</h1>
        <p className="text-lg text-gray-500 mb-10">
          Decentralised consensus for critical operations. When enabled, financial API calls require network approval before they execute.
        </p>

        {/* What is FFP */}
        <Section title="What is FFP?">
          <p>
            FFP is an <strong>optional security layer</strong> that sits between your agents and high-stakes external services (payment processors, exchanges, etc.). When an agent tries to call a protected domain, FFP submits a consensus proposal to the network. The operation only proceeds if the network approves it within 30 seconds.
          </p>
          <p className="mt-3">
            This is useful when you want a <strong>second layer of verification</strong> beyond standard authentication — for example, in automated trading bots, multi-agent financial workflows, or anywhere you cannot afford a rogue or compromised agent to make real money moves unilaterally.
          </p>
          <Callout color="blue" emoji="ℹ️">
            <strong>For most users, FFP is not needed.</strong> Standard bearer token auth is sufficient for the vast majority of use cases. Enable FFP only if you are running high-stakes multi-agent workflows involving financial APIs.
          </Callout>
        </Section>

        {/* How it works */}
        <Section title="How it works">
          <div className="space-y-4">
            <Step n={1} label="Agent makes a net_http_* call to a protected domain">
              e.g. <code className="bg-gray-100 px-1 rounded text-sm">net_http_post</code> to <code className="bg-gray-100 px-1 rounded text-sm">https://api.binance.com/...</code>
            </Step>
            <Step n={2} label="FFP intercepts the request">
              Before the HTTP request fires, the FFP client submits a consensus proposal to the configured FFP node.
            </Step>
            <Step n={3} label="Network votes">
              The FFP network evaluates the operation against its policy rules and registered agent reputation. Approval or denial comes back within 30 seconds.
            </Step>
            <Step n={4} label="Operation proceeds or is blocked">
              If approved: the original HTTP request fires normally. If denied or timed out: the operation is blocked and the agent receives an error.
            </Step>
            <Step n={5} label="All outcomes are logged">
              Every FFP operation — approved, denied, or timed out — is written to the FFP audit trail. Query it at <code className="bg-gray-100 px-1 rounded text-sm">GET /api/ffp/audit/:agentId</code>.
            </Step>
          </div>

          <div className="mt-6 bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-100 border-b border-gray-200">Flow diagram</div>
            <div className="p-5 font-mono text-xs text-gray-600 leading-loose">
              <div>Agent → <span className="text-purple-600">net_http_post(binance.com, ...)</span></div>
              <div className="pl-4 text-gray-400">↓</div>
              <div className="pl-4">FFP client <span className="text-blue-600">ffpConsensus()</span> — submit proposal</div>
              <div className="pl-8 text-gray-400">↓ (30s timeout)</div>
              <div className="pl-8 flex gap-8">
                <span className="text-green-600">Approved → HTTP fires ✓</span>
                <span className="text-red-500">Denied → blocked ✗</span>
              </div>
              <div className="pl-4 text-gray-400 mt-1">↓ always</div>
              <div className="pl-4"><span className="text-amber-600">ffpLog()</span> — write to audit trail</div>
            </div>
          </div>
        </Section>

        {/* Protected domains */}
        <Section title="Protected domains">
          <p className="text-gray-600 mb-4">When <code className="bg-gray-100 px-1 rounded text-sm">FFP_REQUIRE_CONSENSUS=true</code>, the following domains require consensus approval before any HTTP call is allowed:</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              { domain: 'binance.com', category: 'Crypto exchange' },
              { domain: 'coinbase.com', category: 'Crypto exchange' },
              { domain: 'kraken.com', category: 'Crypto exchange' },
              { domain: 'stripe.com', category: 'Payment processor' },
              { domain: 'paypal.com', category: 'Payment processor' },
              { domain: 'braintreepayments.com', category: 'Payment processor' },
            ].map(d => (
              <div key={d.domain} className="flex items-center justify-between bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <code className="text-sm font-mono text-red-700">{d.domain}</code>
                <span className="text-xs text-red-400">{d.category}</span>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-500 mt-3">All other domains pass through without any FFP overhead.</p>
        </Section>

        {/* How to enable */}
        <Section title="How to enable FFP">
          <p className="text-gray-600 mb-4">FFP is controlled entirely through environment variables. Set these in your deployment environment (Vercel, Docker, .env, etc.):</p>

          <div className="bg-gray-950 rounded-lg overflow-hidden mb-4">
            <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-800">.env / environment variables</div>
            <pre className="p-4 text-xs font-mono text-gray-300 leading-relaxed">{`# Required to activate FFP
FFP_MODE=enabled

# The chain/network identifier for your FFP node
FFP_CHAIN_ID=mainnet

# URL of the FFP network node you are connecting to
FFP_NODE_URL=https://your-ffp-node.example.com

# This deployment's agent identity on the FFP network
FFP_AGENT_ID=agent_abc123...

# Set to true to actually block protected domains pending consensus
# Without this, FFP logs operations but doesn't block anything
FFP_REQUIRE_CONSENSUS=true`}</pre>
          </div>

          <Callout color="amber" emoji="⚠️">
            If any of <code className="text-xs bg-amber-50 px-1 rounded">FFP_MODE</code>, <code className="text-xs bg-amber-50 px-1 rounded">FFP_CHAIN_ID</code>, <code className="text-xs bg-amber-50 px-1 rounded">FFP_NODE_URL</code>, or <code className="text-xs bg-amber-50 px-1 rounded">FFP_AGENT_ID</code> are missing, FFP is automatically disabled and all calls are no-ops — existing deployments are completely unaffected.
          </Callout>

          <h3 className="text-base font-semibold text-gray-900 mt-6 mb-3">Enable in the Ops console:</h3>
          <ol className="list-decimal ml-6 space-y-2 text-gray-600">
            <li>Set the environment variables above and redeploy.</li>
            <li>Go to <Link href="/ops" className="text-blue-600 underline">/ops</Link> and switch to <strong>Multi-agent mode</strong>.</li>
            <li>The <strong>FFP / Consensus Mode</strong> button will become active. Click it to enable.</li>
            <li>The button now shows <strong>&quot;Consensus On&quot;</strong> — all protected domain calls will now require network approval.</li>
          </ol>
        </Section>

        {/* API reference */}
        <Section title="FFP API endpoints (admin only)">
          <div className="space-y-4">
            {[
              {
                method: 'GET',
                path: '/api/ffp/status',
                desc: 'Returns current FFP configuration: whether it is enabled, the chain ID, node URL, and whether consensus is required.',
                response: `{
  "enabled":          true,
  "chainId":          "mainnet",
  "nodeUrl":          "https://...",
  "requireConsensus": true
}`,
              },
              {
                method: 'GET',
                path: '/api/ffp/audit/:agentId',
                desc: 'Query all operations logged on the FFP chain for a given agent. Optional query params: chain_id, start_time, end_time.',
                response: `[
  {
    "primitive":  "net",
    "action":     "http_post",
    "params":     { "url": "https://api.binance.com/..." },
    "result":     { "approved": true },
    "timestamp":  1743500000,
    "agentId":    "agent_abc123..."
  }
]`,
              },
              {
                method: 'GET',
                path: '/api/ffp/consensus/:agentId',
                desc: 'Query the consensus proposal history for an agent — which proposals were submitted, approved, denied, or timed out.',
                response: `[
  {
    "proposalId": "prop_xyz...",
    "domain":     "binance.com",
    "status":     "approved",
    "createdAt":  "2026-03-31T..."
  }
]`,
              },
            ].map(ep => (
              <div key={ep.path} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <span className="text-xs font-mono font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">{ep.method}</span>
                  <code className="text-sm font-mono text-gray-800">{ep.path}</code>
                </div>
                <div className="px-4 py-3">
                  <p className="text-sm text-gray-600 mb-3">{ep.desc}</p>
                  <div className="bg-gray-950 rounded-lg overflow-hidden">
                    <div className="px-3 py-1 text-xs text-gray-500 border-b border-gray-800">Example response</div>
                    <pre className="p-3 text-xs font-mono text-green-400 overflow-x-auto leading-relaxed">{ep.response}</pre>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <h3 className="text-base font-semibold text-gray-900 mt-6 mb-2">Check FFP status via curl:</h3>
          <div className="bg-gray-950 rounded-lg overflow-hidden">
            <pre className="p-4 text-xs font-mono text-gray-300 leading-relaxed">{`curl -s ${APP_URL}/api/ffp/status \\
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq`}</pre>
          </div>
        </Section>

        {/* No-op guarantee */}
        <Section title="Zero-overhead when disabled">
          <p className="text-gray-600 mb-3">
            When FFP is not configured, every call to <code className="bg-gray-100 px-1 rounded text-sm">ffpLog()</code> and <code className="bg-gray-100 px-1 rounded text-sm">ffpConsensus()</code> is a synchronous no-op — it returns immediately without any network call or side effect.
          </p>
          <p className="text-gray-600">
            This means you can deploy AgentOS without FFP and it will never slow down a single request. FFP only adds latency (the consensus round trip) when it is explicitly enabled AND the target domain is in the protected list.
          </p>
        </Section>

        <div className="mt-10 flex gap-3 flex-wrap">
          <Link href="/ops" className="inline-block bg-gray-900 text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-gray-800 transition-colors">
            Open Ops Console →
          </Link>
          <Link href="/docs/guide" className="inline-block bg-white border border-gray-200 text-gray-700 font-semibold text-sm px-5 py-2.5 rounded-lg hover:border-blue-300 transition-colors">
            Back to full guide
          </Link>
        </div>
      </div>

      <DocsFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100">{title}</h2>
      <div className="space-y-3 text-gray-700 leading-relaxed">{children}</div>
    </section>
  );
}

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="w-7 h-7 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</div>
      <div>
        <div className="font-semibold text-gray-900 mb-1">{label}</div>
        <div className="text-sm text-gray-600">{children}</div>
      </div>
    </div>
  );
}

function Callout({ color, emoji, children }: { color: 'blue' | 'amber'; emoji: string; children: React.ReactNode }) {
  const styles = {
    blue: 'bg-blue-50 border-blue-100 text-gray-700',
    amber: 'bg-amber-50 border-amber-100 text-gray-700',
  };
  return (
    <div className={`flex gap-3 rounded-xl p-4 mt-4 border text-sm ${styles[color]}`}>
      <span className="text-base flex-shrink-0">{emoji}</span>
      <div>{children}</div>
    </div>
  );
}
