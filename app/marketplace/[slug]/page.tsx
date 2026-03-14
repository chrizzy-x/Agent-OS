'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { APP_URL } from '@/lib/config';

interface Capability {
  name: string;
  description: string;
  params: Record<string, string>;
  returns?: string;
}

interface Review {
  rating: number;
  review_title?: string;
  review_text?: string;
  created_at: string;
  agent_id: string;
}

interface Skill {
  id: string;
  name: string;
  slug: string;
  version: string;
  author_id: string;
  author_name: string;
  category: string;
  description: string;
  long_description?: string;
  icon: string;
  pricing_model: string;
  price_per_call: number;
  free_tier_calls: number;
  total_installs: number;
  total_calls: number;
  rating: number;
  review_count: number;
  primitives_required: string[];
  capabilities: Capability[];
  tags: string[];
  homepage_url?: string;
  repository_url?: string;
  verified: boolean;
  reviews?: Review[];
}

export default function SkillDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installError, setInstallError] = useState('');

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/skills/${slug}`)
      .then(r => r.json())
      .then(d => setSkill(d.skill ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const handleInstall = async () => {
    setInstalling(true);
    setInstallError('');
    const apiKey = typeof window !== 'undefined' ? localStorage.getItem('apiKey') : '';
    if (!apiKey) {
      setInstallError('You need to sign up first to install skills.');
      setInstalling(false);
      return;
    }
    try {
      const res = await fetch('/api/skills/install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ skill_id: skill!.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInstallError(data.error || 'Installation failed');
      } else {
        setInstalled(true);
      }
    } catch {
      setInstallError('Network error. Please try again.');
    } finally {
      setInstalling(false);
    }
  };

  const exampleCode = (s: Skill) => {
    const cap = s.capabilities[0];
    const paramExample = cap?.params
      ? Object.entries(cap.params).map(([k]) => `  ${k}: 'your-${k}'`).join(',\n')
      : '';
    return `const AGENT_OS_URL = '${APP_URL}';
const API_KEY = 'your-api-key';

// 1. Install the skill
await fetch(\`\${AGENT_OS_URL}/api/skills/install\`, {
  method: 'POST',
  headers: { 'Authorization': \`Bearer \${API_KEY}\`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ skill_id: '${s.id}' }),
});

// 2. Use the skill
const result = await fetch(\`\${AGENT_OS_URL}/api/skills/use\`, {
  method: 'POST',
  headers: { 'Authorization': \`Bearer \${API_KEY}\`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    skill_slug: '${s.slug}',
    capability: '${cap?.name ?? 'capability_name'}',
    params: {
${paramExample}
    },
  }),
}).then(r => r.json());

console.log(result.result);`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading skill...</div>
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <div className="text-4xl">🔍</div>
        <p className="text-gray-700 font-medium">Skill not found</p>
        <Link href="/marketplace" className="text-sm text-blue-600 hover:underline">
          ← Back to Marketplace
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono font-bold text-lg text-gray-900">Agent OS</Link>
          <Link href="/marketplace" className="text-sm text-gray-500 hover:text-gray-900">
            ← Marketplace
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Hero */}
        <div className="bg-white border border-gray-200 rounded-xl p-8 mb-6">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4 flex-1">
              <span className="text-5xl">{skill.icon || '📦'}</span>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl font-bold text-gray-900">{skill.name}</h1>
                  {skill.verified && (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                      ✓ Official
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
                  <span>by @{skill.author_name}</span>
                  <span>·</span>
                  <span>v{skill.version}</span>
                  <span>·</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">{skill.category}</span>
                  {skill.rating > 0 && (
                    <>
                      <span>·</span>
                      <span>⭐ {Number(skill.rating).toFixed(1)} ({skill.review_count})</span>
                    </>
                  )}
                </div>
                <p className="text-gray-600 leading-relaxed">{skill.description}</p>
              </div>
            </div>

            <div className="flex-shrink-0 text-right">
              <div className="text-2xl font-bold text-gray-900 mb-1">
                {skill.pricing_model === 'free'
                  ? <span className="text-green-600">Free</span>
                  : <span className="text-blue-600">${skill.price_per_call}<span className="text-sm font-normal text-gray-500">/call</span></span>
                }
              </div>
              {skill.pricing_model !== 'free' && skill.free_tier_calls > 0 && (
                <div className="text-xs text-gray-500 mb-3">First {skill.free_tier_calls} calls free</div>
              )}
              <button
                onClick={handleInstall}
                disabled={installing || installed}
                className="w-full px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {installed ? '✓ Installed' : installing ? 'Installing...' : 'Install Skill'}
              </button>
              {installError && (
                <p className="text-xs text-red-600 mt-2 max-w-[200px]">{installError}</p>
              )}
              {!localStorage?.getItem?.('apiKey') && !installed && (
                <p className="text-xs text-gray-500 mt-2">
                  <Link href="/signup" className="text-blue-600 hover:underline">Sign up</Link> to install
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Long description */}
            {skill.long_description && (
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">About</h2>
                <p className="text-gray-600 leading-relaxed">{skill.long_description}</p>
              </div>
            )}

            {/* Capabilities */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Capabilities</h2>
              <div className="space-y-3">
                {skill.capabilities.map((cap, i) => (
                  <div key={i} className="border border-gray-100 rounded-lg p-4">
                    <div className="font-mono text-blue-600 text-sm mb-1">
                      {cap.name}({Object.keys(cap.params || {}).join(', ')})
                      {cap.returns && <span className="text-gray-400"> → {cap.returns}</span>}
                    </div>
                    <div className="text-sm text-gray-600">{cap.description}</div>
                    {Object.keys(cap.params || {}).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(cap.params).map(([k, v]) => (
                          <span key={k} className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-0.5 font-mono text-gray-600">
                            {k}: <span className="text-gray-400">{v}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Example Usage */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Example Usage</h2>
              <div className="rounded-lg bg-gray-950 overflow-hidden">
                <div className="flex items-center px-4 py-2 border-b border-gray-800">
                  <span className="text-xs text-gray-500 font-mono">javascript</span>
                </div>
                <pre className="p-4 overflow-x-auto text-xs leading-relaxed">
                  <code className="font-mono text-gray-300 whitespace-pre">{exampleCode(skill)}</code>
                </pre>
              </div>
            </div>

            {/* Reviews */}
            {skill.reviews && skill.reviews.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Reviews ({skill.review_count})
                </h2>
                <div className="space-y-4">
                  {skill.reviews.slice(0, 5).map((review, i) => (
                    <div key={i} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span>{'⭐'.repeat(review.rating)}</span>
                        <span className="text-xs text-gray-400">
                          @{review.agent_id.slice(0, 14)}...
                        </span>
                      </div>
                      {review.review_title && (
                        <p className="text-sm font-medium text-gray-800 mb-0.5">{review.review_title}</p>
                      )}
                      {review.review_text && (
                        <p className="text-sm text-gray-600">{review.review_text}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            {/* Stats */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Installs</span>
                  <span className="font-medium text-gray-900">{skill.total_installs.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">API Calls</span>
                  <span className="font-medium text-gray-900">{skill.total_calls.toLocaleString()}</span>
                </div>
                {skill.rating > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Rating</span>
                    <span className="font-medium text-gray-900">
                      ⭐ {Number(skill.rating).toFixed(1)}/5
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Requirements */}
            {skill.primitives_required.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Required Primitives</h3>
                <div className="flex flex-wrap gap-1.5">
                  {skill.primitives_required.map(p => (
                    <span key={p} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-0.5 font-mono">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {skill.tags.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Tags</h3>
                <div className="flex flex-wrap gap-1.5">
                  {skill.tags.map(tag => (
                    <span key={tag} className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-0.5">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Links */}
            {(skill.homepage_url || skill.repository_url) && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Links</h3>
                <div className="space-y-2">
                  {skill.homepage_url && (
                    <a href={skill.homepage_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                      🌐 Homepage
                    </a>
                  )}
                  {skill.repository_url && (
                    <a href={skill.repository_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                      📦 Repository
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
