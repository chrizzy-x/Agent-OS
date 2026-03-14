'use client';

import { useState } from 'react';
import Link from 'next/link';

const FEATURE_CATEGORIES = [
  {
    name: 'Core Infrastructure',
    icon: '⚙️',
    features: [
      { id: 1, name: 'Filesystem (fs)', short: 'Read/write files to cloud storage, S3-compatible, isolated per agent' },
      { id: 2, name: 'Network (net)', short: 'HTTP requests, SSRF protection, rate limiting, timeout handling' },
      { id: 3, name: 'Process Execution (proc)', short: 'Execute Python/JavaScript/Bash in isolated sandbox, 30s timeout' },
      { id: 4, name: 'Memory Cache (mem)', short: 'Redis-backed key-value store, sub-millisecond access, TTL support' },
      { id: 5, name: 'Database (db)', short: 'PostgreSQL with full SQL support, RLS, automatic backups' },
      { id: 6, name: 'Events (events)', short: 'Pub/sub messaging, cross-agent communication, real-time' },
    ],
  },
  {
    name: 'Multi-Agent Consensus (FFP)',
    icon: '🗳️',
    features: [
      { id: 7, name: 'Consensus System', short: 'Byzantine fault-tolerant voting, configurable thresholds, reputation-weighted' },
      { id: 8, name: 'Reputation Tracking', short: 'Track agent accuracy over time, dynamic voting weights' },
      { id: 9, name: 'Chain Logging', short: 'Immutable blockchain audit trail, cryptographic proofs' },
      { id: 10, name: 'Coordination', short: 'Multi-stage workflows, agent-to-agent handoffs' },
      { id: 11, name: 'Validation', short: 'Test agents before consensus participation, ongoing quality control' },
      { id: 12, name: 'Diversity Enforcement', short: 'Prevent single points of failure, geographic distribution' },
    ],
  },
  {
    name: 'MCP Integration',
    icon: '🔌',
    features: [
      { id: 34, name: 'MCP Server', short: 'Expose all primitives as MCP tools, JSON-RPC 2.0 protocol' },
      { id: 35, name: 'MCP Tool Listing', short: 'Dynamically list available tools including installed skills' },
      { id: 36, name: 'MCP Tool Execution', short: 'Execute tools with consensus routing and chain logging' },
      { id: 37, name: 'MCP Client', short: 'Call external MCP servers (Gmail, Slack, Drive, GitHub, etc.)' },
      { id: 59, name: 'MCP Router', short: 'Route MCP calls through consensus, add accountability layer' },
      { id: 60, name: 'Universal MCP Access', short: 'Access 100+ MCP servers through one unified API' },
    ],
  },
  {
    name: 'Skills Marketplace',
    icon: '🛒',
    features: [
      { id: 13, name: 'Browse Skills', short: 'Search by keyword, filter by category, sort by popularity/rating' },
      { id: 14, name: 'Install Skills', short: 'One-click install from marketplace, automatic registration' },
      { id: 15, name: 'Use Skills', short: 'Execute skill capabilities via API, usage metering, error handling' },
      { id: 16, name: 'Skill Execution Engine', short: 'Sandboxed JavaScript execution, 30s timeout, memory limits' },
      { id: 17, name: 'Publish Skills', short: 'Developers upload code, define capabilities, set pricing' },
      { id: 18, name: 'Reviews & Ratings', short: '1-5 star ratings, text reviews, helpful votes' },
      { id: 19, name: 'Developer Dashboard', short: 'View installs, calls, earnings, analytics per skill' },
      { id: 20, name: 'Revenue Sharing', short: '70% to developer, 30% to platform, monthly payouts via Stripe' },
      { id: 21, name: 'Skill Analytics', short: 'Total installs, API calls, execution time, error rate, revenue' },
    ],
  },
  {
    name: 'Authentication & Security',
    icon: '🔒',
    features: [
      { id: 28, name: 'JWT-Based Auth', short: 'API key + Agent ID validation, token expiration, secure hashing' },
      { id: 29, name: 'API Key Management', short: 'Crypto-random generation, SHA-256 hashing, one-time display' },
      { id: 30, name: 'Agent Isolation', short: 'Separate namespaces, row-level security, cannot access other agents data' },
      { id: 31, name: 'Rate Limiting', short: '100 req/min default, configurable per agent, prevents abuse' },
      { id: 32, name: 'SSRF Protection', short: 'Block localhost/internal IPs, whitelist external domains only' },
      { id: 33, name: 'Sandbox Security', short: 'Container isolation, memory limits, timeout enforcement' },
    ],
  },
  {
    name: 'User Interface',
    icon: '🖥️',
    features: [
      { id: 22, name: 'Landing Page', short: 'Beautiful gradient design, feature showcase, code examples' },
      { id: 23, name: 'Signup Flow', short: 'Email + agent name, generates credentials, one-time display' },
      { id: 24, name: 'Marketplace UI', short: 'Grid layout, category filters, search, sort options' },
      { id: 25, name: 'Skill Detail Pages', short: 'Full description, capabilities, examples, reviews, one-click install' },
      { id: 26, name: 'Developer Publishing UI', short: 'Form, code editor, capability builder, pricing selector' },
      { id: 27, name: 'Agent Dashboard', short: 'View usage, installed skills, credentials, billing' },
    ],
  },
  {
    name: 'Infrastructure',
    icon: '🏗️',
    features: [
      { id: 55, name: 'Vercel Deployment', short: 'Auto-scaling, global CDN, zero-config deploys' },
      { id: 56, name: 'Supabase Backend', short: 'PostgreSQL database, S3 storage, RLS, automatic backups' },
      { id: 57, name: 'Redis Caching', short: 'Sub-millisecond reads, pub/sub messaging, rate limit counters' },
      { id: 58, name: 'Docker Sandboxing', short: 'Isolated execution, resource limits, automatic cleanup' },
    ],
  },
  {
    name: 'Advanced Features',
    icon: '🚀',
    features: [
      { id: 61, name: 'Multi-Stage Workflows', short: 'Chain multiple agents, each stage requires consensus' },
      { id: 62, name: 'Reputation Weighting', short: 'Better agents have more voting influence, dynamic adjustment' },
      { id: 63, name: 'Cryptographic Proofs', short: 'Prove actions happened, verify chain integrity, timestamp proofs' },
      { id: 64, name: 'Agent Networks', short: 'Medical diagnosis network, trading network, research network' },
      { id: 65, name: 'Skill Dependencies', short: 'Skills can require other skills, automatic installation' },
      { id: 66, name: 'Skill Versioning', short: 'Semantic versioning, pin to versions, breaking change warnings' },
      { id: 67, name: 'Skill Permissions', short: 'Declare required primitives, user approval, audit log' },
      { id: 68, name: 'Webhook Support', short: 'Skills register webhooks, receive external events' },
      { id: 69, name: 'Scheduled Tasks', short: 'Cron-like scheduling, one-time/recurring jobs' },
      { id: 70, name: 'A/B Testing', short: 'Test skill versions, compare performance, automatic rollback' },
    ],
  },
];

export function FeatureShowcase() {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [featureDescriptions, setFeatureDescriptions] = useState<Record<number, string>>({});
  const [loadingFeature, setLoadingFeature] = useState<number | null>(null);

  const generateDescription = async (featureId: number, featureName: string, shortDesc: string) => {
    if (featureDescriptions[featureId]) return;
    setLoadingFeature(featureId);
    try {
      const response = await fetch('/api/generate-feature-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureName, shortDesc }),
      });
      const data = await response.json();
      setFeatureDescriptions(prev => ({ ...prev, [featureId]: data.description }));
    } catch {
      // silently fall back to shortDesc
    } finally {
      setLoadingFeature(null);
    }
  };

  const totalFeatures = FEATURE_CATEGORIES.reduce((acc, cat) => acc + cat.features.length, 0);

  return (
    <div className="mb-32">
      <div className="text-center mb-16">
        <h2 className="text-5xl font-bold text-white mb-4">
          {totalFeatures}+ Features Out of the Box
        </h2>
        <p className="text-xl text-white/70 max-w-3xl mx-auto">
          Everything you need to build, deploy, and run autonomous agents.
          No additional tools required.
        </p>
      </div>

      <div className="space-y-4">
        {FEATURE_CATEGORIES.map((category) => (
          <div
            key={category.name}
            className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-purple-500/30 transition"
          >
            <button
              onClick={() =>
                setExpandedCategory(expandedCategory === category.name ? null : category.name)
              }
              className="w-full p-8 flex items-center justify-between hover:bg-white/5 transition"
            >
              <div className="flex items-center gap-4">
                <span className="text-4xl">{category.icon}</span>
                <div className="text-left">
                  <h3 className="text-2xl font-bold text-white">{category.name}</h3>
                  <p className="text-white/50 text-sm">{category.features.length} features</p>
                </div>
              </div>
              <svg
                className={`w-6 h-6 text-white/60 transition-transform ${
                  expandedCategory === category.name ? 'rotate-180' : ''
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expandedCategory === category.name && (
              <div className="border-t border-white/10 p-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                {category.features.map((feature) => (
                  <div
                    key={feature.id}
                    className="p-6 bg-white/5 rounded-xl border border-white/10 hover:border-purple-500/30 transition"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-purple-400 font-mono">#{feature.id}</span>
                        <h4 className="text-base font-semibold text-white">{feature.name}</h4>
                      </div>
                      <button
                        onClick={() => generateDescription(feature.id, feature.name, feature.short)}
                        disabled={loadingFeature === feature.id || !!featureDescriptions[feature.id]}
                        className="ml-2 px-3 py-1 text-xs bg-purple-600/20 text-purple-300 rounded-lg hover:bg-purple-600/30 transition disabled:opacity-40 whitespace-nowrap flex-shrink-0"
                      >
                        {loadingFeature === feature.id
                          ? '...'
                          : featureDescriptions[feature.id]
                          ? 'AI'
                          : 'Learn More'}
                      </button>
                    </div>
                    <p className="text-white/70 text-sm leading-relaxed">
                      {featureDescriptions[feature.id] || feature.short}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-10 text-center">
        <p className="text-white/60 text-base mb-4">
          More features shipping every week based on developer feedback
        </p>
        <Link
          href="/docs"
          className="inline-block px-8 py-4 border border-white/20 text-white rounded-xl hover:bg-white/10 transition font-semibold"
        >
          View Full Documentation →
        </Link>
      </div>
    </div>
  );
}
