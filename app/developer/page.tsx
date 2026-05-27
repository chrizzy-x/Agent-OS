'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Badge from '@/components/Badge';
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

interface AgentApp {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  publisherId: string;
  publisherName: string;
  installCount: number;
  verified: boolean;
  published: boolean;
  deviceTargets: string[];
  createdAt: string;
}

interface Earnings {
  this_month: string;
  last_month: string;
  all_time: string;
  per_skill: { skill_id: string; skill_name: string; total_calls: number; total_revenue: string }[];
}

type DeveloperTier = 'free' | 'pro' | 'hyper' | 'enterprise';

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

const EMPTY_APP = {
  name: '',
  slug: '',
  category: 'Operations',
  description: '',
  long_description: '',
  visibility: 'public',
  app_url: '',
  repository_url: '',
  device_targets: 'AgentOS Desktop, AgentOS Cloud',
  manifest: '{\n  "version": "1.0.0",\n  "runtime": "agentos-app",\n  "entrypoint": "agentos://apps/my-agentic-app",\n  "primitives": ["mem.*", "db.*", "net.fetch"],\n  "skills": [],\n  "permissions": ["memory", "database", "network"],\n  "requiredSecrets": [],\n  "commands": [\n    { "name": "run", "description": "Run the app workflow" }\n  ]\n}',
  default_config: '{\n  "system_prompt": "Run this app safely on AgentOS."\n}',
};

const CATEGORIES = [
  'Documents', 'Web & Browser', 'AI & ML', 'Finance & Crypto',
  'Communication', 'Data & Analytics', 'Cloud & Deploy', 'Security',
  'Utilities', 'Content', 'Network', 'Research', 'Support',
];

const APP_CATEGORIES = [
  'Research', 'Finance', 'Growth', 'Data', 'Security', 'Support', 'Operations',
];

const labelStyle = {
  display: 'block' as const,
  fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  marginBottom: '6px',
};

export default function DeveloperPage() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [mySkills, setMySkills] = useState<Skill[]>([]);
  const [myApps, setMyApps] = useState<AgentApp[]>([]);
  const [agentTier, setAgentTier] = useState<DeveloperTier>('free');
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPublish, setShowPublish] = useState(false);
  const [publishMode, setPublishMode] = useState<'skill' | 'app'>('skill');
  const [form, setForm] = useState(EMPTY_SKILL);
  const [appForm, setAppForm] = useState(EMPTY_APP);
  const [publishing, setPublishing] = useState(false);
  const [publishingApp, setPublishingApp] = useState(false);
  const [visibilityBusySlug, setVisibilityBusySlug] = useState('');
  const [publishError, setPublishError] = useState('');
  const [publishSuccess, setPublishSuccess] = useState('');
  const [payoutEmail, setPayoutEmail] = useState('');
  const [payoutWallet, setPayoutWallet] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('paypal');
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState('');
  const [payoutRequested, setPayoutRequested] = useState(false);
  const canPublishApps = agentTier === 'enterprise' || agentTier === 'hyper';

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const currentSession = await fetchBrowserSession();
      if (!active) return;
      if (!currentSession) { setLoading(false); return; }

      setSession(currentSession);
      await Promise.all([
        fetchAgentProfile(),
        fetchMySkills(currentSession.agentId),
        fetchMyApps(currentSession.agentId),
        fetchEarnings(),
        fetchPayoutSettings(),
      ]);
      if (active) setLoading(false);
    }

    void bootstrap();
    return () => { active = false; };
  }, []);

  const fetchMySkills = async (agentId: string) => {
    try {
      const res = await fetch(`/api/skills?author=${agentId}`);
      const data = await res.json();
      setMySkills(data.skills ?? []);
    } catch { setMySkills([]); }
  };

  const fetchAgentProfile = async () => {
    try {
      const res = await fetch('/api/agent/me', { cache: 'no-store' });
      const data = await res.json();
      const tier = data.tier;
      setAgentTier(tier === 'enterprise' || tier === 'hyper' || tier === 'pro' || tier === 'free' ? tier : 'free');
    } catch {
      setAgentTier('free');
    }
  };

  const fetchMyApps = async (agentId: string) => {
    try {
      const res = await fetch(`/api/apps?publisher=${agentId}`);
      const data = await res.json();
      setMyApps(data.apps ?? []);
    } catch { setMyApps([]); }
  };

  const fetchEarnings = async () => {
    try {
      const res = await fetch('/api/developer/earnings');
      if (res.ok) setEarnings(await res.json());
    } catch { /* silent */ }
  };

  const fetchPayoutSettings = async () => {
    try {
      const res = await fetch('/api/developer/payout-settings');
      if (res.ok) {
        const data = await res.json();
        setPayoutEmail(data.payout_email ?? '');
        setPayoutWallet(data.payout_wallet ?? '');
        setPayoutMethod(data.payout_method ?? 'paypal');
        setPayoutRequested(data.payout_requested ?? false);
      } else {
        setPayoutEmail(''); setPayoutWallet(''); setPayoutMethod('paypal');
      }
    } catch {
      setPayoutEmail(''); setPayoutWallet(''); setPayoutMethod('paypal');
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
        body: JSON.stringify({
          payout_email: payoutMethod !== 'crypto' ? payoutEmail : undefined,
          payout_wallet: payoutMethod === 'crypto' ? payoutWallet : undefined,
          payout_method: payoutMethod,
          request_payout: requestPayout,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setPayoutMsg(data.error ?? 'Failed to save'); return; }
      setPayoutMsg(requestPayout ? 'Payout requested. We will process it within 5 business days.' : 'Payout settings saved.');
      if (requestPayout) setPayoutRequested(true);
    } catch { setPayoutMsg('Network error. Please try again.'); }
    finally { setPayoutSaving(false); }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublishing(true);
    setPublishError('');
    setPublishSuccess('');

    let capabilitiesParsed;
    try { capabilitiesParsed = JSON.parse(form.capabilities); }
    catch { setPublishError('Capabilities must be valid JSON.'); setPublishing(false); return; }

    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, slug: form.slug, category: form.category,
          description: form.description, long_description: form.long_description,
          icon: form.icon, pricing_model: form.pricing_model,
          price_per_call: form.price_per_call, free_tier_calls: form.free_tier_calls,
          capabilities: capabilitiesParsed, source_code: form.source_code,
          primitives_required: form.primitives_required,
          tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          repository_url: form.repository_url || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setPublishError(data.error || 'Publishing failed'); }
      else {
        setPublishSuccess(`Skill "${form.name}" published successfully.`);
        setShowPublish(false);
        setForm(EMPTY_SKILL);
        if (session) await fetchMySkills(session.agentId);
      }
    } catch { setPublishError('Network error. Please try again.'); }
    finally { setPublishing(false); }
  };

  const handlePublishApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPublishApps) {
      setPublishError('Enterprise subscription required to publish AgentOS apps.');
      return;
    }
    setPublishingApp(true);
    setPublishError('');
    setPublishSuccess('');

    let manifestParsed: Record<string, unknown>;
    let configParsed: Record<string, unknown>;
    try { manifestParsed = JSON.parse(appForm.manifest); }
    catch { setPublishError('Manifest must be valid JSON.'); setPublishingApp(false); return; }
    try { configParsed = JSON.parse(appForm.default_config); }
    catch { setPublishError('Default config must be valid JSON.'); setPublishingApp(false); return; }

    try {
      const res = await fetch('/api/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: appForm.name,
          slug: appForm.slug,
          category: appForm.category,
          description: appForm.description,
          long_description: appForm.long_description,
          app_url: appForm.app_url || null,
          repository_url: appForm.repository_url || null,
          device_targets: appForm.device_targets.split(',').map(t => t.trim()).filter(Boolean),
          manifest: manifestParsed,
          default_config: configParsed,
          published: appForm.visibility === 'public',
        }),
      });
      const data = await res.json();
      if (!res.ok) { setPublishError(data.error || 'App publishing failed'); }
      else {
        setPublishSuccess(`App "${appForm.name}" published to the App Store.`);
        setShowPublish(false);
        setAppForm(EMPTY_APP);
        if (session) await fetchMyApps(session.agentId);
      }
    } catch { setPublishError('Network error. Please try again.'); }
    finally { setPublishingApp(false); }
  };

  const handleToggleAppVisibility = async (app: AgentApp) => {
    setVisibilityBusySlug(app.slug);
    setPublishError('');
    setPublishSuccess('');
    try {
      const res = await fetch('/api/apps', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: app.slug, visibility: app.published ? 'private' : 'public' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPublishError(data.error || 'Visibility update failed');
      } else {
        setPublishSuccess(`App "${app.name}" is now ${data.app?.published ? 'public' : 'private'}.`);
        if (session) await fetchMyApps(session.agentId);
      }
    } catch {
      setPublishError('Network error. Please try again.');
    } finally {
      setVisibilityBusySlug('');
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      <Nav activePath="/developer" />

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px 80px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <Badge variant="accent" style={{ marginBottom: '12px' }}>Developer Portal</Badge>
            <h1 style={{
              fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
              fontSize: '28px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: '6px',
              marginTop: '8px',
            }}>Developer Dashboard</h1>
            <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
              Publish and manage your skills and apps
            </p>
          </div>
          {session && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => { setPublishMode('skill'); setShowPublish(value => !(value && publishMode === 'skill')); setPublishError(''); setPublishSuccess(''); }}
                className={showPublish && publishMode === 'skill' ? 'btn-outline' : 'btn-primary'}
                style={{ flexShrink: 0 }}
              >
                {showPublish && publishMode === 'skill' ? 'Cancel' : '+ Publish Skill'}
              </button>
              <button
                onClick={() => { setPublishMode('app'); setShowPublish(value => !(value && publishMode === 'app')); setPublishError(''); setPublishSuccess(''); }}
                disabled={!canPublishApps}
                className={showPublish && publishMode === 'app' ? 'btn-outline' : 'btn-primary'}
                style={{ flexShrink: 0, opacity: canPublishApps ? 1 : 0.45, cursor: canPublishApps ? 'pointer' : 'not-allowed' }}
              >
                {showPublish && publishMode === 'app' ? 'Cancel' : 'Publish App'}
              </button>
            </div>
          )}
        </div>

        {/* Earnings stats */}
        {session && earnings && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1px', border: '1px solid var(--border)', backgroundColor: 'var(--border)', marginBottom: '32px' }}>
            {[
              { label: 'This Month', value: `$${earnings.this_month}`, accent: true },
              { label: 'Last Month', value: `$${earnings.last_month}`, accent: false },
              { label: 'All Time', value: `$${earnings.all_time}`, accent: false },
              { label: 'Published Skills', value: String(mySkills.length), accent: false },
              { label: 'Published Apps', value: String(myApps.length), accent: false },
            ].map(card => (
              <div key={card.label} style={{ padding: '20px 24px', backgroundColor: 'var(--bg-secondary)' }}>
                <div style={{
                  fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                  fontSize: '24px',
                  fontWeight: 700,
                  color: card.accent ? 'var(--accent)' : 'var(--text-primary)',
                  marginBottom: '4px',
                }}>{card.value}</div>
                <div style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '12px', color: 'var(--text-secondary)' }}>{card.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Sign-in gate */}
        {!session && (
          <div style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', padding: '64px 40px', textAlign: 'center', marginBottom: '32px' }}>
            <h2 style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
              Sign in to publish
            </h2>
            <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto 24px', lineHeight: 1.6 }}>
              Sign in once to open a secure browser session, then publish skills or apps without pasting a bearer token into the web UI.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <Link href="/signin" className="btn-primary">Sign In</Link>
              <Link href="/signup" className="btn-outline">Create Account</Link>
            </div>
          </div>
        )}

        {/* Publish form */}
        {session && showPublish && publishMode === 'skill' && (
          <div style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', padding: '32px', marginBottom: '32px' }}>
            <h2 style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '24px', marginTop: 0 }}>
              Publish a New Skill
            </h2>
            <form onSubmit={handlePublish} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Skill Name *</label>
                  <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-dark" placeholder="e.g. PDF Extractor" />
                </div>
                <div>
                  <label style={labelStyle}>Slug *</label>
                  <input type="text" required value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} className="input-dark" placeholder="e.g. pdf-extractor" />
                  <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Lowercase letters, numbers, hyphens only</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Category *</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="input-dark">
                    {CATEGORIES.map(cat => <option key={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Icon (emoji)</label>
                  <input type="text" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} className="input-dark" placeholder="??" maxLength={4} />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Short Description *</label>
                <input type="text" required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-dark" placeholder="One sentence describing what this skill does" />
              </div>
              <div>
                <label style={labelStyle}>Long Description</label>
                <textarea rows={3} value={form.long_description} onChange={e => setForm(f => ({ ...f, long_description: e.target.value }))} className="input-dark" placeholder="Detailed description shown on the skill detail page" style={{ resize: 'vertical' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Pricing</label>
                  <select value={form.pricing_model} onChange={e => setForm(f => ({ ...f, pricing_model: e.target.value }))} className="input-dark">
                    <option value="free">Free</option>
                    <option value="usage">Usage-based</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Price per Call ($)</label>
                  <input type="number" min={0} step={0.001} value={form.price_per_call} onChange={e => setForm(f => ({ ...f, price_per_call: parseFloat(e.target.value) || 0 }))} className="input-dark" disabled={form.pricing_model === 'free'} />
                </div>
                <div>
                  <label style={labelStyle}>Free Tier Calls</label>
                  <input type="number" min={0} value={form.free_tier_calls} onChange={e => setForm(f => ({ ...f, free_tier_calls: parseInt(e.target.value) || 0 }))} className="input-dark" />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Capabilities JSON *</label>
                <textarea rows={8} required value={form.capabilities} onChange={e => setForm(f => ({ ...f, capabilities: e.target.value }))} className="input-dark" placeholder='[{"name": "run", "description": "...", "params": {}, "returns": "string"}]'
                  style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', resize: 'vertical' }} />
                <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>JSON array of capability objects with name, description, params, returns</p>
              </div>
              <div>
                <label style={labelStyle}>Source Code *</label>
                <textarea rows={12} required value={form.source_code} onChange={e => setForm(f => ({ ...f, source_code: e.target.value }))} className="input-dark"
                  placeholder={"class Skill {\n  run(params) {\n    return { result: 'hello' };\n  }\n}"}
                  style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', resize: 'vertical' }} />
                <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>JavaScript class named Skill. Each capability method should match a capability name.</p>
              </div>
              <div>
                <label style={labelStyle}>Tags (comma-separated)</label>
                <input type="text" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} className="input-dark" placeholder="data, json, transform" />
              </div>
              <div>
                <label style={labelStyle}>Repository URL</label>
                <input type="url" value={form.repository_url} onChange={e => setForm(f => ({ ...f, repository_url: e.target.value }))} className="input-dark" placeholder="https://github.com/..." />
              </div>

              {publishError && (
                <div style={{ padding: '12px 16px', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.3)', color: 'var(--danger)', fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px' }}>
                  {publishError}
                </div>
              )}
              <button type="submit" disabled={publishing} className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', opacity: publishing ? 0.5 : 1, cursor: publishing ? 'not-allowed' : 'pointer' }}>
                {publishing ? 'Publishing...' : 'Publish to Skill Store'}
              </button>
            </form>
          </div>
        )}

        {session && showPublish && publishMode === 'app' && (
          <div style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', padding: '32px', marginBottom: '32px' }}>
            <h2 style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '24px', marginTop: 0 }}>
              Publish a New App
            </h2>
            <form onSubmit={handlePublishApp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>App Name *</label>
                  <input type="text" required value={appForm.name} onChange={e => setAppForm(f => ({ ...f, name: e.target.value }))} className="input-dark" placeholder="e.g. Invoice Ops" />
                </div>
                <div>
                  <label style={labelStyle}>Slug</label>
                  <input type="text" value={appForm.slug} onChange={e => setAppForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} className="input-dark" placeholder="auto-generated if empty" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Category *</label>
                  <select value={appForm.category} onChange={e => setAppForm(f => ({ ...f, category: e.target.value }))} className="input-dark">
                    {APP_CATEGORIES.map(cat => <option key={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Device Targets</label>
                  <input type="text" value={appForm.device_targets} onChange={e => setAppForm(f => ({ ...f, device_targets: e.target.value }))} className="input-dark" placeholder="AgentOS Desktop, AgentOS Cloud" />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Visibility</label>
                <select value={appForm.visibility} onChange={e => setAppForm(f => ({ ...f, visibility: e.target.value }))} className="input-dark">
                  <option value="public">Public App Store listing</option>
                  <option value="private">Private to publisher</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Short Description *</label>
                <input type="text" required value={appForm.description} onChange={e => setAppForm(f => ({ ...f, description: e.target.value }))} className="input-dark" placeholder="One sentence describing the app" />
              </div>
              <div>
                <label style={labelStyle}>Long Description</label>
                <textarea rows={3} value={appForm.long_description} onChange={e => setAppForm(f => ({ ...f, long_description: e.target.value }))} className="input-dark" placeholder="Detailed App Store description" style={{ resize: 'vertical' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>App URL</label>
                  <input type="url" value={appForm.app_url} onChange={e => setAppForm(f => ({ ...f, app_url: e.target.value }))} className="input-dark" placeholder="https://..." />
                </div>
                <div>
                  <label style={labelStyle}>Repository URL</label>
                  <input type="url" value={appForm.repository_url} onChange={e => setAppForm(f => ({ ...f, repository_url: e.target.value }))} className="input-dark" placeholder="https://github.com/..." />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Manifest JSON *</label>
                <textarea rows={11} required value={appForm.manifest} onChange={e => setAppForm(f => ({ ...f, manifest: e.target.value }))} className="input-dark"
                  style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', resize: 'vertical' }} />
                <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Declare runtime, entrypoint, primitives, permissions, required secrets, and commands. Do not put secret values here.</p>
              </div>
              <div>
                <label style={labelStyle}>Default Config JSON</label>
                <textarea rows={5} value={appForm.default_config} onChange={e => setAppForm(f => ({ ...f, default_config: e.target.value }))} className="input-dark"
                  style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', resize: 'vertical' }} />
              </div>

              {publishError && (
                <div style={{ padding: '12px 16px', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.3)', color: 'var(--danger)', fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px' }}>
                  {publishError}
                </div>
              )}
              <button type="submit" disabled={publishingApp} className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', opacity: publishingApp ? 0.5 : 1, cursor: publishingApp ? 'not-allowed' : 'pointer' }}>
                {publishingApp ? 'Publishing...' : 'Publish to App Store'}
              </button>
            </form>
          </div>
        )}

        {publishSuccess && (
          <div style={{ padding: '12px 16px', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)', color: 'var(--accent)', fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', marginBottom: '24px' }}>
            ✓ {publishSuccess}
          </div>
        )}

        {/* My skills */}
        {session && (
          <div style={{ marginBottom: '40px' }}>
            <h2 style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
              Your Skills{' '}
              {!loading && <span style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontWeight: 400, fontSize: '14px', color: 'var(--text-secondary)' }}>({mySkills.length})</span>}
            </h2>

            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', border: '1px solid var(--border)', backgroundColor: 'var(--border)' }}>
                {[...Array(3)].map((_, i) => (
                  <div key={i} style={{ padding: '20px 24px', backgroundColor: 'var(--bg-secondary)' }}>
                    <div style={{ height: '14px', background: 'var(--bg-tertiary)', width: '33%', marginBottom: '8px' }} />
                    <div style={{ height: '12px', background: 'var(--border)', width: '66%' }} />
                  </div>
                ))}
              </div>
            ) : mySkills.length === 0 ? (
              <div style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', padding: '64px 40px', textAlign: 'center' }}>
                <h3 style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>No skills published yet</h3>
                <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                  Build a skill and share it with the AgentOS community.
                </p>
                <button onClick={() => setShowPublish(true)} className="btn-primary">Publish Your First Skill</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', border: '1px solid var(--border)', backgroundColor: 'var(--border)' }}>
                {mySkills.map(skill => (
                  <div key={skill.id} style={{ padding: '20px 24px', backgroundColor: 'var(--bg-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '18px', lineHeight: 1 }}>{skill.icon || '??'}</span>
                          <h3 style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{skill.name}</h3>
                          <Badge variant="dim">{skill.category}</Badge>
                          <Badge variant={skill.published ? 'accent' : 'warning'}>{skill.published ? 'Published' : 'Draft'}</Badge>
                        </div>
                        <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>{skill.description}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px' }}>
                          <div><span style={{ color: 'var(--text-tertiary)' }}>Installs </span><span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{skill.total_installs.toLocaleString()}</span></div>
                          <div><span style={{ color: 'var(--text-tertiary)' }}>API Calls </span><span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{skill.total_calls.toLocaleString()}</span></div>
                          {skill.rating > 0 && <div><span style={{ color: 'var(--text-tertiary)' }}>Rating </span><span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>★ {Number(skill.rating).toFixed(1)}</span></div>}
                        </div>
                      </div>
                      <Link href={`/marketplace/${skill.slug}`} style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', color: 'var(--accent)', textDecoration: 'none', flexShrink: 0, marginTop: '2px' }}>
                        View →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* My apps */}
        {session && (
          <div style={{ marginBottom: '40px' }}>
            <h2 style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
              Your Apps{' '}
              {!loading && <span style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontWeight: 400, fontSize: '14px', color: 'var(--text-secondary)' }}>({myApps.length})</span>}
            </h2>

            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', border: '1px solid var(--border)', backgroundColor: 'var(--border)' }}>
                {[...Array(2)].map((_, i) => (
                  <div key={i} style={{ padding: '20px 24px', backgroundColor: 'var(--bg-secondary)' }}>
                    <div style={{ height: '14px', background: 'var(--bg-tertiary)', width: '33%', marginBottom: '8px' }} />
                    <div style={{ height: '12px', background: 'var(--border)', width: '66%' }} />
                  </div>
                ))}
              </div>
            ) : myApps.length === 0 ? (
              <div style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', padding: '48px 40px', textAlign: 'center' }}>
                <h3 style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>No apps published yet</h3>
                <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                  {canPublishApps ? 'Publish a packaged agentic app to the App Store.' : 'Enterprise subscription required to publish AgentOS apps.'}
                </p>
                <button
                  onClick={() => { setPublishMode('app'); setShowPublish(true); }}
                  disabled={!canPublishApps}
                  className="btn-primary"
                  style={{ opacity: canPublishApps ? 1 : 0.45, cursor: canPublishApps ? 'pointer' : 'not-allowed' }}
                >
                  Publish Your First App
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', border: '1px solid var(--border)', backgroundColor: 'var(--border)' }}>
                {myApps.map(app => (
                  <div key={app.id} style={{ padding: '20px 24px', backgroundColor: 'var(--bg-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                          <h3 style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{app.name}</h3>
                          <Badge variant="dim">{app.category}</Badge>
                          <Badge variant={app.published ? 'accent' : 'warning'}>{app.published ? 'Public' : 'Private'}</Badge>
                          {app.verified && <Badge variant="accent">Verified</Badge>}
                        </div>
                        <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>{app.description}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', flexWrap: 'wrap' }}>
                          <div><span style={{ color: 'var(--text-tertiary)' }}>Downloads </span><span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{app.installCount.toLocaleString()}</span></div>
                          <div><span style={{ color: 'var(--text-tertiary)' }}>Targets </span><span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{app.deviceTargets.join(', ')}</span></div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, marginTop: '2px' }}>
                        <button
                          type="button"
                          onClick={() => void handleToggleAppVisibility(app)}
                          disabled={visibilityBusySlug === app.slug}
                          style={{ background: 'none', border: 0, padding: 0, fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', color: 'var(--accent)', cursor: visibilityBusySlug === app.slug ? 'wait' : 'pointer' }}
                        >
                          {visibilityBusySlug === app.slug ? 'Saving...' : app.published ? 'Make Private' : 'Make Public'}
                        </button>
                        <a href={`/api/apps/${app.slug}/download`} style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', color: 'var(--accent)', textDecoration: 'none' }}>
                          Download
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Payout settings */}
        {session && (
          <div style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', padding: '32px', marginBottom: '24px' }}>
            <h3 style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px', marginTop: 0 }}>Payout Settings</h3>
            <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Connect your payout account to receive your 70% revenue share monthly.
            </p>
            <form onSubmit={e => handleSavePayoutSettings(e, false)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Payment Method</label>
                <select className="input-dark" value={payoutMethod} onChange={e => { setPayoutMethod(e.target.value); setPayoutMsg(''); }}>
                  <option value="paypal">PayPal</option>
                  <option value="bank_transfer">Bank Transfer (ACH/Wire)</option>
                  <option value="crypto">Crypto (USDC)</option>
                </select>
              </div>
              {payoutMethod === 'crypto' ? (
                <div>
                  <label style={labelStyle}>Wallet Address (Solana / USDC)</label>
                  <input type="text" className="input-dark" placeholder="e.g. 7xKX..." value={payoutWallet} onChange={e => setPayoutWallet(e.target.value)}
                    style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px' }} />
                  <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Enter your USDC-compatible wallet address. Payments are sent in USDC on Solana.</p>
                </div>
              ) : (
                <div>
                  <label style={labelStyle}>{payoutMethod === 'paypal' ? 'PayPal Email' : 'Account Email'}</label>
                  <input type="email" className="input-dark" placeholder="your@email.com" value={payoutEmail} onChange={e => setPayoutEmail(e.target.value)} />
                </div>
              )}
              {payoutMsg && (
                <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', color: payoutMsg.includes('error') || payoutMsg.includes('Failed') ? 'var(--danger)' : 'var(--accent)', margin: 0 }}>
                  {payoutMsg}
                </p>
              )}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button type="submit" className="btn-primary" disabled={payoutSaving} style={{ opacity: payoutSaving ? 0.5 : 1 }}>
                  {payoutSaving ? 'Saving...' : 'Save Settings'}
                </button>
                <button type="button" className="btn-outline" disabled={payoutSaving || payoutRequested || !earnings || earnings.all_time === '0.00'}
                  onClick={e => handleSavePayoutSettings(e as unknown as React.FormEvent, true)}
                  style={{ opacity: (payoutRequested || !earnings || earnings.all_time === '0.00') ? 0.5 : 1, cursor: (payoutRequested) ? 'not-allowed' : 'pointer' }}>
                  {payoutRequested ? 'Payout Requested' : 'Request Payout'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Revenue sharing info */}
        {session && (
          <div style={{ border: '1px solid rgba(0,255,136,0.2)', backgroundColor: 'rgba(0,255,136,0.04)', padding: '24px' }}>
            <h3 style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '14px', fontWeight: 600, color: 'var(--accent)', marginBottom: '8px', marginTop: 0 }}>Revenue Sharing</h3>
            <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
              AgentOS shares <strong style={{ color: 'var(--text-primary)' }}>70% of all usage revenue</strong> with skill developers.
              Paid skills earn $0.001–$0.10 per API call. Earnings are paid monthly to your connected payout account.
              Free skills help grow your install count and reputation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
