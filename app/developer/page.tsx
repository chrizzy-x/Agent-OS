'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';

interface Skill {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  icon: string;
  published: boolean;
  total_installs: number;
  total_calls: number;
  rating: number;
  review_count: number;
  created_at: string;
}

interface Earnings {
  this_month: string;
  last_month: string;
  all_time: string;
  per_skill: { skill_id: string; skill_name: string; total_calls: number; total_revenue: string }[];
}

const EMPTY_SKILL = {
  name: '',
  slug: '',
  category: 'Data & Analytics',
  description: '',
  long_description: '',
  icon: '??',
  pricing_model: 'free',
  price_per_call: 0,
  free_tier_calls: 100,
  capabilities: '[\n  {\n    "name": "run",\n    "description": "Describe what this capability does",\n    "params": { "input": "string" },\n    "returns": "string"\n  }\n]',
  source_code: '// Your skill code here\nclass Skill {\n  run(params) {\n    return { result: params.input };\n  }\n}',
  primitives_required: [],
  tags: '',
  repository_url: '',
};

const CATEGORIES = [
  'Documents', 'Web & Browser', 'AI & ML', 'Finance & Crypto',
  'Communication', 'Data & Analytics', 'Cloud & Deploy', 'Security',
  'Utilities', 'Content', 'Network', 'Research', 'Support',
];

export default function DeveloperPage() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [mySkills, setMySkills] = useState<Skill[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPublish, setShowPublish] = useState(false);
  const [form, setForm] = useState(EMPTY_SKILL);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [publishSuccess, setPublishSuccess] = useState('');
  const [payoutEmail, setPayoutEmail] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('paypal');
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState('');
  const [payoutRequested, setPayoutRequested] = useState(false);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const currentSession = await fetchBrowserSession();
      if (!active) return;
      if (!currentSession) {
        setLoading(false);
        return;
      }

      setSession(currentSession);
      await Promise.all([
        fetchMySkills(currentSession.agentId),
        fetchEarnings(),
        fetchPayoutSettings(),
      ]);
      if (active) {
        setLoading(false);
      }
    }

    void bootstrap();
    return () => { active = false; };
  }, []);

  const fetchMySkills = async (agentId: string) => {
    try {
      const res = await fetch(`/api/skills?author=${agentId}`);
      const data = await res.json();
      setMySkills(data.skills ?? []);
    } catch {
      setMySkills([]);
    }
  };

  const fetchEarnings = async () => {
    try {
      const res = await fetch('/api/developer/earnings');
      if (res.ok) setEarnings(await res.json());
    } catch {
      // silent
    }
  };

  const fetchPayoutSettings = async () => {
    try {
      const res = await fetch('/api/developer/payout-settings');
      if (res.ok) {
        const data = await res.json();
        setPayoutEmail(data.payout_email ?? '');
        setPayoutMethod(data.payout_method ?? 'paypal');
        setPayoutRequested(data.payout_requested ?? false);
      }
    } catch {
      // silent
    }
  };

  const handleSavePayoutSettings = async (e: React.FormEvent, requestPayout = false) => {
    e.preventDefault();
    setPayoutSaving(true);
    setPayoutMsg('');
    try {
      const res = await fetch('/api/developer/payout-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payout_email: payoutEmail, payout_method: payoutMethod, request_payout: requestPayout }),
      });
      const data = await res.json();
      if (!res.ok) { setPayoutMsg(data.error ?? 'Failed to save'); return; }
      setPayoutMsg(requestPayout ? 'Payout requested. We will process it within 5 business days.' : 'Payout settings saved.');
      if (requestPayout) setPayoutRequested(true);
    } catch {
      setPayoutMsg('Network error. Please try again.');
    } finally {
      setPayoutSaving(false);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublishing(true);
    setPublishError('');
    setPublishSuccess('');

    let capabilitiesParsed;
    try {
      capabilitiesParsed = JSON.parse(form.capabilities);
    } catch {
      setPublishError('Capabilities must be valid JSON.');
      setPublishing(false);
      return;
    }

    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          category: form.category,
          description: form.description,
          long_description: form.long_description,
          icon: form.icon,
          pricing_model: form.pricing_model,
          price_per_call: form.price_per_call,
          free_tier_calls: form.free_tier_calls,
          capabilities: capabilitiesParsed,
          source_code: form.source_code,
          primitives_required: form.primitives_required,
          tags: form.tags ? form.tags.split(',').map(tag => tag.trim()).filter(Boolean) : [],
          repository_url: form.repository_url || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPublishError(data.error || 'Publishing failed');
      } else {
        setPublishSuccess(`Skill "${form.name}" published successfully.`);
        setShowPublish(false);
        setForm(EMPTY_SKILL);
        if (session) {
          await fetchMySkills(session.agentId);
        }
      }
    } catch {
      setPublishError('Network error. Please try again.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
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
            <Link href="/marketplace" className="text-sm transition-colors hover:text-white" style={{ color: 'var(--text-muted)' }}>Marketplace</Link>
            <Link href="/developer" className="text-sm font-medium" style={{ color: '#a855f7' }}>Developer</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="badge badge-purple mb-3">Developer Portal</div>
            <h1 className="text-2xl font-black">Developer <span className="gradient-text">Dashboard</span></h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Publish and manage your skills</p>
          </div>
          {session && (
            <button
              onClick={() => { setShowPublish(!showPublish); setPublishError(''); setPublishSuccess(''); }}
              className="btn-primary"
            >
              {showPublish ? 'Cancel' : '+ Publish Skill'}
            </button>
          )}
        </div>

        {session && earnings && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {[
              { label: 'This Month', value: `$${earnings.this_month}`, color: '#a855f7' },
              { label: 'Last Month', value: `$${earnings.last_month}`, color: 'var(--text)' },
              { label: 'All Time', value: `$${earnings.all_time}`, color: 'var(--text)' },
              { label: 'Published Skills', value: String(mySkills.length), color: '#06b6d4' },
            ].map(card => (
              <div key={card.label} className="card p-4">
                <div className="text-2xl font-black mb-0.5" style={{ color: card.color }}>{card.value}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{card.label}</div>
              </div>
            ))}
          </div>
        )}

        {!session && (
          <div className="card p-12 text-center">
            <div className="text-5xl mb-4">??</div>
            <h2 className="text-lg font-bold mb-2">Sign in to publish skills</h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              Sign in once to open a secure browser session, then publish skills without pasting a bearer token into the web UI.
            </p>
            <div className="flex justify-center gap-3">
              <Link href="/signin" className="btn-primary">Sign In</Link>
              <Link href="/signup" className="btn-outline">Create Account</Link>
            </div>
          </div>
        )}

        {session && showPublish && (
          <div className="card p-6 mb-8">
            <h2 className="text-lg font-bold mb-6">Publish a New Skill</h2>
            <form onSubmit={handlePublish} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Skill Name *</label>
                  <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-dark" placeholder="e.g. PDF Extractor" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Slug *</label>
                  <input type="text" required value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} className="input-dark" placeholder="e.g. pdf-extractor" />
                  <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>Lowercase letters, numbers, hyphens only</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Category *</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="input-dark">
                    {CATEGORIES.map(category => <option key={category}>{category}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Icon (emoji)</label>
                  <input type="text" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} className="input-dark" placeholder="??" maxLength={4} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Short Description *</label>
                <input type="text" required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-dark" placeholder="One sentence describing what this skill does" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Long Description</label>
                <textarea rows={3} value={form.long_description} onChange={e => setForm(f => ({ ...f, long_description: e.target.value }))} className="input-dark" placeholder="Detailed description shown on the skill detail page" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Pricing</label>
                  <select value={form.pricing_model} onChange={e => setForm(f => ({ ...f, pricing_model: e.target.value }))} className="input-dark">
                    <option value="free">Free</option>
                    <option value="usage">Usage-based</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Price per Call ($)</label>
                  <input type="number" min={0} step={0.001} value={form.price_per_call} onChange={e => setForm(f => ({ ...f, price_per_call: parseFloat(e.target.value) || 0 }))} className="input-dark" disabled={form.pricing_model === 'free'} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Free Tier Calls</label>
                  <input type="number" min={0} value={form.free_tier_calls} onChange={e => setForm(f => ({ ...f, free_tier_calls: parseInt(e.target.value) || 0 }))} className="input-dark" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Capabilities JSON *</label>
                <textarea rows={8} required value={form.capabilities} onChange={e => setForm(f => ({ ...f, capabilities: e.target.value }))} className="input-dark font-mono text-xs" placeholder='[{"name": "run", "description": "...", "params": {}, "returns": "string"}]' />
                <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>JSON array of capability objects with name, description, params, returns</p>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Source Code *</label>
                <textarea rows={12} required value={form.source_code} onChange={e => setForm(f => ({ ...f, source_code: e.target.value }))} className="input-dark font-mono text-xs" placeholder={"class Skill {\n  run(params) {\n    return { result: 'hello' };\n  }\n}"} />
                <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>JavaScript class named Skill. Each capability method should match a capability name.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Tags (comma-separated)</label>
                <input type="text" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} className="input-dark" placeholder="data, json, transform" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>Repository URL</label>
                <input type="url" value={form.repository_url} onChange={e => setForm(f => ({ ...f, repository_url: e.target.value }))} className="input-dark" placeholder="https://github.com/..." />
              </div>

              {publishError && <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>{publishError}</div>}
              <button type="submit" disabled={publishing} className="btn-primary w-full py-3" style={{ opacity: publishing ? 0.5 : 1, cursor: publishing ? 'not-allowed' : 'pointer' }}>
                {publishing ? 'Publishingâ€¦' : 'Publish to Marketplace'}
              </button>
            </form>
          </div>
        )}

        {publishSuccess && (
          <div className="rounded-lg px-4 py-3 text-sm mb-6" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: '#86efac' }}>
            ? {publishSuccess}
          </div>
        )}

        {session && (
          <div>
            <h2 className="text-lg font-bold mb-4">
              Your Skills{' '}
              {!loading && <span className="font-normal text-sm" style={{ color: 'var(--text-muted)' }}>({mySkills.length})</span>}
            </h2>

            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="card p-5 animate-pulse">
                    <div className="h-4 rounded w-1/3 mb-2" style={{ background: 'var(--surface-2)' }} />
                    <div className="h-3 rounded w-2/3" style={{ background: 'var(--border)' }} />
                  </div>
                ))}
              </div>
            ) : mySkills.length === 0 ? (
              <div className="card p-12 text-center">
                <div className="text-5xl mb-4">???</div>
                <h3 className="font-bold mb-2">No skills published yet</h3>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                  Build a skill and share it with the Agent OS community.
                </p>
                <button onClick={() => setShowPublish(true)} className="btn-primary">
                  Publish Your First Skill
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {mySkills.map(skill => (
                  <div key={skill.id} className="card p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xl">{skill.icon || '??'}</span>
                          <h3 className="font-bold">{skill.name}</h3>
                          <span className="badge badge-purple text-xs">{skill.category}</span>
                          <span className={skill.published ? 'badge badge-green text-xs' : 'badge badge-amber text-xs'}>{skill.published ? 'Published' : 'Draft'}</span>
                        </div>
                        <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>{skill.description}</p>
                        <div className="flex items-center gap-5 text-sm">
                          <div><span style={{ color: 'var(--text-muted)' }}>Installs</span><span className="ml-1.5 font-semibold">{skill.total_installs.toLocaleString()}</span></div>
                          <div><span style={{ color: 'var(--text-muted)' }}>API Calls</span><span className="ml-1.5 font-semibold">{skill.total_calls.toLocaleString()}</span></div>
                          {skill.rating > 0 && <div><span style={{ color: 'var(--text-muted)' }}>Rating</span><span className="ml-1.5 font-semibold">? {Number(skill.rating).toFixed(1)}</span></div>}
                        </div>
                      </div>
                      <Link href={`/marketplace/${skill.slug}`} className="text-sm flex-shrink-0 hover:underline" style={{ color: '#a855f7' }}>
                        View ?
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {session && (
          <div className="card mt-10 p-6">
            <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text)' }}>Payout Settings</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
              Connect your payout account to receive your 70% revenue share monthly.
            </p>
            <form onSubmit={(e) => handleSavePayoutSettings(e, false)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Payout Email</label>
                <input type="email" className="input-dark w-full" placeholder="your@email.com" value={payoutEmail} onChange={e => setPayoutEmail(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Payment Method</label>
                <select className="input-dark w-full" value={payoutMethod} onChange={e => setPayoutMethod(e.target.value)}>
                  <option value="paypal">PayPal</option>
                  <option value="bank_transfer">Bank Transfer (ACH/Wire)</option>
                  <option value="crypto">Crypto (USDC)</option>
                </select>
              </div>
              {payoutMsg && <p className="text-sm" style={{ color: payoutMsg.includes('error') || payoutMsg.includes('Failed') ? '#f87171' : '#4ade80' }}>{payoutMsg}</p>}
              <div className="flex gap-3 flex-wrap">
                <button type="submit" className="btn-primary text-sm px-4 py-2" disabled={payoutSaving}>{payoutSaving ? 'Savingâ€¦' : 'Save Settings'}</button>
                <button type="button" className="btn-outline text-sm px-4 py-2" disabled={payoutSaving || payoutRequested || !earnings || earnings.all_time === '0.00'} onClick={(e) => handleSavePayoutSettings(e as unknown as React.FormEvent, true)} style={payoutRequested ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
                  {payoutRequested ? 'Payout Requested' : 'Request Payout'}
                </button>
              </div>
            </form>
          </div>
        )}

        {session && (
          <div className="mt-6 rounded-xl p-6" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <h3 className="text-base font-bold mb-2" style={{ color: '#c084fc' }}>Revenue Sharing</h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Agent OS shares <strong style={{ color: 'var(--text)' }}>70% of all usage revenue</strong> with skill developers.
              Paid skills earn $0.001-$0.10 per API call. Earnings are paid monthly to your connected payout account.
              Free skills help grow your install count and reputation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

