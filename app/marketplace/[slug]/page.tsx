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
      setInstallError('Sign up to install skills.');
      setInstalling(false);
      return;
    }
    try {
      const res = await fetch('/api/skills/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ skill_id: skill!.id }),
      });
      const data = await res.json();
      if (!res.ok) { setInstallError(data.error || 'Installation failed'); }
      else { setInstalled(true); }
    } catch {
      setInstallError('Network error. Please try again.');
    } finally {
      setInstalling(false);
    }
  };

  const exampleCode = (s: Skill) => {
    const cap = s.capabilities[0];
    const paramExample = cap?.params
      ? Object.entries(cap.params).map(([k]) => `    ${k}: 'your-${k}'`).join(',\n')
      : '';
    return `const AGENT_OS_URL = '${APP_URL}';
const API_KEY = 'your-api-key';

// 1. Install the skill
await fetch(\`\${AGENT_OS_URL}/api/skills/install\`, {
  method: 'POST',
  headers: { Authorization: \`Bearer \${API_KEY}\`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ skill_id: '${s.id}' }),
});

// 2. Use the skill
const result = await fetch(\`\${AGENT_OS_URL}/api/skills/use\`, {
  method: 'POST',
  headers: { Authorization: \`Bearer \${API_KEY}\`, 'Content-Type': 'application/json' },
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading skill…</div>
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--bg)' }}>
        <div className="text-4xl">🔍</div>
        <p className="font-medium">Skill not found</p>
        <Link href="/marketplace" className="text-sm hover:underline" style={{ color: '#a855f7' }}>
          ← Back to Marketplace
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Nav */}
      <nav className="sticky top-0 z-40 backdrop-blur-md"
        style={{ background: 'rgba(10,10,20,0.85)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black font-mono text-xs"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 0 12px rgba(124,58,237,0.4)' }}>
              A
            </div>
            <span className="font-mono font-bold text-sm">Agent<span className="gradient-text">OS</span></span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/marketplace" className="text-sm transition-colors hover:text-white" style={{ color: '#a855f7' }}>
              ← Marketplace
            </Link>
            <Link href="/signup" className="btn-primary text-xs px-4 py-2">Get Started</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Hero */}
        <div className="card p-8 mb-6">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex items-start gap-5 flex-1">
              <span className="text-5xl">{skill.icon || '📦'}</span>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <h1 className="text-2xl font-black">{skill.name}</h1>
                  {skill.verified && <span className="badge badge-green text-xs">✓ Official</span>}
                  <span className="badge badge-purple text-xs">{skill.category}</span>
                </div>
                <div className="flex items-center gap-3 text-sm flex-wrap mb-3" style={{ color: 'var(--text-muted)' }}>
                  <span>by @{skill.author_name}</span>
                  <span>·</span>
                  <span>v{skill.version}</span>
                  {skill.rating > 0 && (
                    <>
                      <span>·</span>
                      <span>⭐ {Number(skill.rating).toFixed(1)} ({skill.review_count})</span>
                    </>
                  )}
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {skill.description}
                </p>
              </div>
            </div>

            <div className="flex-shrink-0 text-right min-w-[160px]">
              <div className="text-2xl font-black mb-1">
                {skill.pricing_model === 'free'
                  ? <span style={{ color: '#22c55e' }}>Free</span>
                  : <span style={{ color: '#a855f7' }}>${skill.price_per_call}<span className="text-sm font-normal" style={{ color: 'var(--text-muted)' }}>/call</span></span>
                }
              </div>
              {skill.pricing_model !== 'free' && skill.free_tier_calls > 0 && (
                <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                  First {skill.free_tier_calls} calls free
                </div>
              )}
              <button onClick={handleInstall} disabled={installing || installed}
                className="btn-primary w-full py-2.5 mb-2"
                style={{ opacity: (installing || installed) ? 0.7 : 1 }}>
                {installed ? '✓ Installed' : installing ? 'Installing…' : 'Install Skill'}
              </button>
              {installError && (
                <p className="text-xs mt-1" style={{ color: '#fca5a5' }}>{installError}</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {skill.long_description && (
              <div className="card p-6">
                <h2 className="font-bold mb-3">About</h2>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {skill.long_description}
                </p>
              </div>
            )}

            {/* Capabilities */}
            <div className="card p-6">
              <h2 className="font-bold mb-4">Capabilities</h2>
              <div className="space-y-3">
                {skill.capabilities.map((cap, i) => (
                  <div key={i} className="rounded-lg p-4"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <div className="font-mono text-sm mb-1">
                      <span style={{ color: '#a855f7' }}>{cap.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>({Object.keys(cap.params || {}).join(', ')})</span>
                      {cap.returns && <span style={{ color: '#67e8f9' }}> → {cap.returns}</span>}
                    </div>
                    <div className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>{cap.description}</div>
                    {Object.keys(cap.params || {}).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {Object.entries(cap.params).map(([k, v]) => (
                          <span key={k} className="text-xs font-mono rounded px-2 py-0.5"
                            style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#c084fc' }}>
                            {k}: <span style={{ color: 'var(--text-muted)' }}>{v}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Example usage */}
            <div className="terminal">
              <div className="terminal-header">
                <div className="terminal-dot" style={{ background: '#ff5f57' }} />
                <div className="terminal-dot" style={{ background: '#febc2e' }} />
                <div className="terminal-dot" style={{ background: '#28c840' }} />
                <span className="text-xs ml-2 font-mono" style={{ color: 'var(--text-muted)' }}>javascript</span>
              </div>
              <div className="p-5">
                <pre className="text-xs font-mono leading-relaxed overflow-x-auto" style={{ color: '#94a3b8' }}>
                  <code className="whitespace-pre">{exampleCode(skill)}</code>
                </pre>
              </div>
            </div>

            {/* Reviews */}
            {skill.reviews && skill.reviews.length > 0 && (
              <div className="card p-6">
                <h2 className="font-bold mb-4">Reviews ({skill.review_count})</h2>
                <div className="space-y-4">
                  {skill.reviews.slice(0, 5).map((review, i) => (
                    <div key={i} className="pb-4 last:pb-0" style={{ borderBottom: i < Math.min(4, skill.reviews!.length - 1) ? '1px solid var(--border)' : 'none' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span>{'⭐'.repeat(review.rating)}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          @{review.agent_id.slice(0, 14)}…
                        </span>
                      </div>
                      {review.review_title && (
                        <p className="text-sm font-medium mb-0.5">{review.review_title}</p>
                      )}
                      {review.review_text && (
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{review.review_text}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="card p-5">
              <h3 className="text-sm font-bold mb-3">Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Installs</span>
                  <span className="font-semibold">{skill.total_installs.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>API Calls</span>
                  <span className="font-semibold">{skill.total_calls.toLocaleString()}</span>
                </div>
                {skill.rating > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-muted)' }}>Rating</span>
                    <span className="font-semibold">⭐ {Number(skill.rating).toFixed(1)}/5</span>
                  </div>
                )}
              </div>
            </div>

            {skill.primitives_required.length > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-bold mb-3">Required Primitives</h3>
                <div className="flex flex-wrap gap-1.5">
                  {skill.primitives_required.map(p => (
                    <span key={p} className="text-xs font-mono rounded px-2 py-0.5"
                      style={{ background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', color: '#67e8f9' }}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {skill.tags.length > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-bold mb-3">Tags</h3>
                <div className="flex flex-wrap gap-1.5">
                  {skill.tags.map(tag => (
                    <span key={tag} className="text-xs font-mono rounded px-2 py-0.5"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(skill.homepage_url || skill.repository_url) && (
              <div className="card p-5">
                <h3 className="text-sm font-bold mb-3">Links</h3>
                <div className="space-y-2 text-sm">
                  {skill.homepage_url && (
                    <a href={skill.homepage_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 hover:underline" style={{ color: '#a855f7' }}>
                      🌐 Homepage
                    </a>
                  )}
                  {skill.repository_url && (
                    <a href={skill.repository_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 hover:underline" style={{ color: '#a855f7' }}>
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
