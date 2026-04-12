'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('agentos_token');
}

interface CryptoInfo {
  wallet: string;
  amountUsdc: string;
  network: string;
  reference: string;
  skillId: string;
  skillSlug: string;
}

function CryptoPayModal({ info, onConfirm, onClose, busy, errorMsg }: {
  info: CryptoInfo;
  onConfirm: (txHash: string) => void;
  onClose: () => void;
  busy: boolean;
  errorMsg: string;
}) {
  const [txHash, setTxHash] = useState('');
  const [copied, setCopied] = useState(false);

  const copyWallet = () => {
    navigator.clipboard.writeText(info.wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="font-bold">Complete payment</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {info.network === 'solana' ? 'Solana' : 'Base'} · USDC
            </p>
          </div>
          <button onClick={onClose} className="text-xl w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)' }}>×</button>
        </div>

        {/* Amount */}
        <div className="rounded-xl px-4 py-3 mb-4 text-center"
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <p className="text-2xl font-black" style={{ color: '#22c55e' }}>{info.amountUsdc} USDC</p>
        </div>

        {/* Wallet */}
        <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Send to:</p>
        <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 mb-4"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
          <code className="text-xs flex-1 break-all" style={{ color: 'var(--accent)' }}>{info.wallet}</code>
          <button onClick={copyWallet} className="text-xs flex-shrink-0 px-2 py-1 font-medium"
            style={{ background: copied ? 'var(--accent-glow)' : 'transparent', border: `1px solid ${copied ? 'var(--accent)' : 'var(--border-active)'}`, color: copied ? 'var(--accent)' : 'var(--text-secondary)' }}>
            {copied ? '✓' : 'Copy'}
          </button>
        </div>

        {/* TX input */}
        <input
          type="text"
          value={txHash}
          onChange={e => setTxHash(e.target.value)}
          placeholder="Paste transaction signature after paying..."
          className="w-full px-3 py-2.5 rounded-lg text-sm mb-3"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />

        {errorMsg && <p className="text-xs mb-3" style={{ color: '#fca5a5' }}>{errorMsg}</p>}

        <button
          onClick={() => txHash.trim() && onConfirm(txHash.trim())}
          disabled={busy || !txHash.trim()}
          className="btn-primary w-full py-3 text-sm font-semibold"
          style={{ opacity: busy || !txHash.trim() ? 0.6 : 1 }}>
          {busy ? 'Verifying...' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}

export default function SkillDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params?.slug as string;

  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [cryptoInfo, setCryptoInfo] = useState<{ wallet: string; amountUsdc: string; network: string; reference: string; skillId: string; skillSlug: string } | null>(null);

  const isFree = !skill || skill.pricing_model === 'free' || skill.price_per_call === 0;

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/skills/${slug}`)
      .then(r => r.json())
      .then(d => setSkill(d.skill ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const handleInstall = async () => {
    if (!skill) return;

    const token = getToken();
    if (!token) {
      router.push(`/signin?next=/marketplace/${slug}`);
      return;
    }

    setActionState('busy');
    setErrorMsg('');
    try {
      const res = await fetch('/api/skills/install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ skill_id: skill.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          router.push(`/signin?next=/marketplace/${slug}`);
          return;
        }
        setErrorMsg(data.error || 'Installation failed');
        setActionState('error');
      } else {
        setActionState('done');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
      setActionState('error');
    }
  };

  const handleBuy = async (method: 'paypal' | 'crypto') => {
    if (!skill) return;

    const token = getToken();
    if (!token) {
      router.push(`/signin?next=/marketplace/${slug}`);
      return;
    }

    setActionState('busy');
    setErrorMsg('');
    setCryptoInfo(null);
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ skillId: skill.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { router.push(`/signin?next=/marketplace/${slug}`); return; }
        setErrorMsg(data.error || 'Could not start checkout');
        setActionState('error');
      } else if (data.wallet) {
        setCryptoInfo({
          wallet: data.wallet,
          amountUsdc: data.amountUsdc,
          network: data.network,
          reference: data.reference,
          skillId: skill.id,
          skillSlug: skill.slug,
        });
        setActionState('idle');
      } else {
        setErrorMsg('Something went wrong. Try again.');
        setActionState('error');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
      setActionState('error');
    }
  };

  const handleCryptoConfirm = async (txHash: string) => {
    if (!cryptoInfo) return;
    const token = getToken();
    if (!token) { router.push(`/signin?next=/marketplace/${slug}`); return; }
    setActionState('busy');
    try {
      const params = new URLSearchParams({
        tx: txHash,
        wallet: cryptoInfo.wallet,
        amount: cryptoInfo.amountUsdc,
        network: cryptoInfo.network,
        reference: cryptoInfo.reference,
        skill_id: cryptoInfo.skillId,
        skill_slug: cryptoInfo.skillSlug,
      });
      router.push(`/marketplace/success?${params.toString()}`);
    } catch { setErrorMsg('Network error.'); setActionState('error'); }
  };

  const exampleCode = (s: Skill) => {
    const cap = s.capabilities[0];
    const paramExample = cap?.params
      ? Object.entries(cap.params).map(([k]) => `    ${k}: 'your-${k}'`).join(',\n')
      : '';
    return `const AGENT_OS_URL = '${APP_URL}';
const BEARER_TOKEN = 'your-bearer-token';

// 1. Install the skill
await fetch(\`\${AGENT_OS_URL}/api/skills/install\`, {
  method: 'POST',
  headers: { Authorization: \`Bearer \${BEARER_TOKEN}\`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ skill_id: '${s.id}' }),
});

// 2. Use the skill
const result = await fetch(\`\${AGENT_OS_URL}/api/skills/use\`, {
  method: 'POST',
  headers: { Authorization: \`Bearer \${BEARER_TOKEN}\`, 'Content-Type': 'application/json' },
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
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading skill...</div>
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--bg)' }}>
        <div className="text-4xl">🔍</div>
        <p className="font-medium">Skill not found</p>
        <Link href="/marketplace" className="text-sm hover:underline" style={{ color: 'var(--accent)' }}>
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
            <div className="w-7 h-7 flex items-center justify-center font-black font-mono text-xs"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--accent)', color: 'var(--accent)' }}>
              A
            </div>
            <span className="font-mono font-bold text-sm">Agent<span style={{ color: 'var(--accent)' }}>OS</span></span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/marketplace" className="text-sm transition-colors hover:text-white" style={{ color: 'var(--accent)' }}>
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
                  <span className="badge badge-accent text-xs">{skill.category}</span>
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
                  <span>·</span>
                  <span>{skill.total_installs.toLocaleString()} installs</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {skill.description}
                </p>
              </div>
            </div>

            {/* Install / Buy panel */}
            <div className="flex-shrink-0 min-w-[180px]">
              {/* Price display */}
              <div className="text-right mb-3">
                {isFree ? (
                  <span className="text-2xl font-black" style={{ color: '#22c55e' }}>Free</span>
                ) : (
                  <div>
                    <span className="text-2xl font-black" style={{ color: 'var(--accent)' }}>
                      ${skill.price_per_call}
                    </span>
                    <span className="text-sm font-normal" style={{ color: 'var(--text-muted)' }}>/mo</span>
                  </div>
                )}
                {!isFree && skill.free_tier_calls > 0 && (
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    First {skill.free_tier_calls} calls free
                  </div>
                )}
              </div>

              {/* CTA button */}
              {isFree ? (
                <button
                  onClick={() => void handleInstall()}
                  disabled={actionState === 'busy' || actionState === 'done'}
                  className="btn-primary w-full py-2.5"
                  style={{ opacity: actionState === 'busy' || actionState === 'done' ? 0.7 : 1 }}>
                  {actionState === 'done'
                    ? 'Installed ✓'
                    : actionState === 'busy'
                    ? 'Installing...'
                    : 'Install Free'}
                </button>
              ) : (
                <button
                  onClick={() => void handleBuy('crypto')}
                  disabled={actionState === 'busy'}
                  className="btn-primary w-full py-2.5"
                  style={{ opacity: actionState === 'busy' ? 0.7 : 1 }}>
                  {actionState === 'busy' ? 'Loading...' : `Buy — $${skill.price_per_call}/mo`}
                </button>
              )}

              {actionState === 'error' && errorMsg && (
                <p className="text-xs mt-2 text-right" style={{ color: '#fca5a5' }}>{errorMsg}</p>
              )}

              {actionState === 'done' && (
                <Link href="/dashboard"
                  className="block text-center text-xs mt-2 hover:underline"
                  style={{ color: '#86efac' }}>
                  View in dashboard →
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Crypto payment panel */}
        {cryptoInfo && (
          <CryptoPayModal
            info={cryptoInfo}
            onConfirm={handleCryptoConfirm}
            onClose={() => setCryptoInfo(null)}
            busy={actionState === 'busy'}
            errorMsg={errorMsg}
          />
        )}

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
                      <span style={{ color: 'var(--accent)' }}>{cap.name}</span>
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
                    <div key={i} className="pb-4 last:pb-0"
                      style={{ borderBottom: i < Math.min(4, skill.reviews!.length - 1) ? '1px solid var(--border)' : 'none' }}>
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
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Version</span>
                  <span className="font-semibold">v{skill.version}</span>
                </div>
                {skill.rating > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-muted)' }}>Rating</span>
                    <span className="font-semibold">⭐ {Number(skill.rating).toFixed(1)}/5</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Author</span>
                  <span className="font-semibold">@{skill.author_name}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Category</span>
                  <span className="font-semibold">{skill.category}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Pricing</span>
                  <span className="font-semibold" style={{ color: isFree ? '#86efac' : '#c084fc' }}>
                    {isFree ? 'Free' : `$${skill.price_per_call}/mo`}
                  </span>
                </div>
              </div>
            </div>

            {skill.primitives_required.length > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-bold mb-3">Required Primitives</h3>
                <div className="flex flex-wrap gap-1.5">
                  {skill.primitives_required.map(p => (
                    <span key={p} className="tag text-xs">
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
                      className="flex items-center gap-2 hover:underline" style={{ color: 'var(--accent)' }}>
                      🌐 Homepage
                    </a>
                  )}
                  {skill.repository_url && (
                    <a href={skill.repository_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 hover:underline" style={{ color: 'var(--accent)' }}>
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
