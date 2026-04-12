'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  clearLegacyBrowserAuth,
  destroyBrowserSession,
  fetchBrowserSession,
  type BrowserSession,
} from '@/src/auth/browser-session';

type SocialPlatform = {
  id: 'x' | 'facebook' | 'instagram' | 'telegram' | 'youtube' | 'whatsapp';
  label: string;
  status: 'live' | 'scaffolded';
  connectorReady: boolean;
  connectedCount: number;
  authMode: 'oauth_user' | 'bot_token' | 'business_access';
  accountType: 'profile' | 'page' | 'business' | 'bot' | 'channel' | 'number';
  dashboardHref?: string;
  summary: string;
  requirements: string[];
};

const PLATFORM_TONES: Record<SocialPlatform['id'], { accent: string; glow: string; chip: string }> = {
  x: { accent: '#f97316', glow: 'rgba(249,115,22,0.24)', chip: 'rgba(249,115,22,0.12)' },
  facebook: { accent: '#3b82f6', glow: 'rgba(59,130,246,0.24)', chip: 'rgba(59,130,246,0.12)' },
  instagram: { accent: '#ec4899', glow: 'rgba(236,72,153,0.24)', chip: 'rgba(236,72,153,0.12)' },
  telegram: { accent: '#22c55e', glow: 'rgba(34,197,94,0.22)', chip: 'rgba(34,197,94,0.12)' },
  youtube: { accent: '#ef4444', glow: 'rgba(239,68,68,0.24)', chip: 'rgba(239,68,68,0.12)' },
  whatsapp: { accent: '#10b981', glow: 'rgba(16,185,129,0.24)', chip: 'rgba(16,185,129,0.12)' },
};

function authModeLabel(mode: SocialPlatform['authMode']): string {
  if (mode === 'oauth_user') return 'OAuth user';
  if (mode === 'business_access') return 'Business access';
  return 'Bot token';
}

function formatAccountType(value: SocialPlatform['accountType']): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function DashboardSocialPage() {
  const router = useRouter();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadPlatforms() {
      try {
        const response = await fetch('/api/social/platforms', { cache: 'no-store' });
        const body = await response.json();

        if (!active) return;
        if (!response.ok) {
          throw new Error(body.error || 'Failed to load example integration catalog');
        }

        setPlatforms(Array.isArray(body.platforms) ? body.platforms : []);
        setError('');
      } catch (err) {
        if (!active) return;
        setPlatforms([]);
        setError(err instanceof Error ? err.message : 'Failed to load example integration catalog');
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    async function bootstrap() {
      const currentSession = await fetchBrowserSession();
      if (!active) return;
      if (!currentSession) {
        clearLegacyBrowserAuth();
        router.replace('/signin');
        return;
      }

      setSession(currentSession);
      await loadPlatforms();
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, [router]);

  async function reload() {
    setRefreshing(true);
    try {
      const response = await fetch('/api/social/platforms', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Failed to reload example integration catalog');
      }
      setPlatforms(Array.isArray(body.platforms) ? body.platforms : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload example integration catalog');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSignOut() {
    await destroyBrowserSession();
    router.push('/signin');
  }

  if (loading || !session) {
    return <div className="min-h-screen" style={{ background: 'var(--bg)' }} />;
  }

  const liveCount = platforms.filter(platform => platform.status === 'live').length;
  const readyCount = platforms.filter(platform => platform.connectorReady).length;
  const totalConnections = platforms.reduce((sum, platform) => sum + platform.connectedCount, 0);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <nav style={{ background: 'rgba(3,3,10,0.9)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(16px)' }} className="sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-7 h-7 flex items-center justify-center font-black font-mono text-xs" style={{ background: 'var(--bg-primary)', border: '1px solid var(--accent)', color: 'var(--accent)' }}>
                S
              </div>
              <span className="font-mono font-bold text-sm">Example<span style={{ color: 'var(--accent)' }}>Hub</span></span>
            </Link>
            <div className="hidden sm:flex items-center gap-5 text-sm" style={{ color: 'var(--text-muted)' }}>
              <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
              <Link href="/dashboard/x" className="hover:text-white transition-colors">X Ops</Link>
              <Link href="/studio" className="hover:text-white transition-colors">Studio</Link>
              <Link href="/docs/social-ops" className="hover:text-white transition-colors">Docs</Link>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block font-mono text-xs px-2.5 py-1.5" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              {session.agentId.slice(0, 22)}...
            </span>
            <button onClick={() => void handleSignOut()} className="btn-outline text-sm px-3 py-1.5 rounded-lg">Sign out</button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-5 py-8 space-y-6">
        <section className="card p-6 relative overflow-hidden">
          <div className="absolute -top-24 -right-10 w-64 h-64 rounded-full" style={{ background: 'radial-gradient(circle, var(--accent-glow), transparent 60%)', filter: 'blur(6px)' }} />
          <div className="relative flex flex-col xl:flex-row xl:items-end justify-between gap-6">
            <div className="max-w-3xl">
              <div className="badge badge-accent mb-3">Optional example control plane</div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-3">Operate X now, then extend into Facebook, Instagram, Telegram, YouTube, and WhatsApp.</h1>
              <p className="text-sm sm:text-base leading-7" style={{ color: 'var(--text-muted)' }}>
                This hub tracks live connector state, credential readiness, and rollout order across every network you want this platform to manage. X remains the only active connector today; the others are scaffolded and visible so you can extend from one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => void reload()} disabled={refreshing} className="btn-primary rounded-lg px-5 py-3 text-sm">
                {refreshing ? 'Refreshing...' : 'Refresh catalog'}
              </button>
              <Link href="/docs/social-ops" className="btn-outline rounded-lg px-5 py-3 text-sm">
                Example guide
              </Link>
              <Link href="/dashboard/x" className="btn-outline rounded-lg px-5 py-3 text-sm">
                Open X Ops
              </Link>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
            {error}
          </div>
        ) : null}

        <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Supported Networks', value: platforms.length, tone: 'var(--accent)' },
            { label: 'Live Connectors', value: liveCount, tone: '#f97316' },
            { label: 'Credential-Ready', value: readyCount, tone: '#22c55e' },
            { label: 'Connected Accounts', value: totalConnections, tone: '#facc15' },
          ].map(item => (
            <div key={item.label} className="card p-5">
              <div className="text-3xl font-black" style={{ color: item.tone }}>{item.value}</div>
              <div className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{item.label}</div>
            </div>
          ))}
        </section>

        <section className="grid lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {platforms.map(platform => {
            const tone = PLATFORM_TONES[platform.id];
            return (
              <article key={platform.id} className="card p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-28 h-28 rounded-full" style={{ background: `radial-gradient(circle, ${tone.glow}, transparent 65%)` }} />
                <div className="relative flex flex-col gap-5 h-full">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm" style={{ background: tone.chip, border: `1px solid ${tone.glow}`, color: tone.accent }}>
                        {platform.label.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-lg font-black">{platform.label}</div>
                        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                          {authModeLabel(platform.authMode)} | {formatAccountType(platform.accountType)} accounts
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black" style={{ color: tone.accent }}>{platform.connectedCount}</div>
                      <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Connected</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs px-2.5 py-1 rounded-full" style={platform.status === 'live'
                      ? { background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.22)', color: '#fdba74' }
                      : { background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      {platform.status === 'live' ? 'Live connector' : 'Scaffolded'}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full" style={platform.connectorReady
                      ? { background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.22)', color: '#86efac' }
                      : { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: '#fca5a5' }}>
                      {platform.connectorReady ? 'Credentials ready' : 'Credentials missing'}
                    </span>
                  </div>

                  <p className="text-sm leading-6" style={{ color: 'var(--text-muted)' }}>
                    {platform.summary}
                  </p>

                  <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                    <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
                      Implementation Requirements
                    </div>
                    <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                      {platform.requirements.map(requirement => (
                        <li key={requirement} className="flex items-start gap-2">
                          <span style={{ color: tone.accent }}>-</span>
                          <span>{requirement}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-auto pt-1">
                    {platform.dashboardHref ? (
                      <Link href={platform.dashboardHref} className="btn-primary rounded-lg px-4 py-2.5 text-sm inline-flex">
                        Open {platform.label} workspace
                      </Link>
                    ) : (
                      <div className="inline-flex rounded-lg px-4 py-2.5 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        Connector scaffold only
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
}



