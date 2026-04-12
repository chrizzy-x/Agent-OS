'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import {
  clearLegacyBrowserAuth,
  destroyBrowserSession,
  fetchBrowserSession,
  type BrowserSession,
} from '@/src/auth/browser-session';

type XAccountConnection = {
  id: string;
  owner_agent_id: string;
  child_agent_id: string;
  x_user_id: string;
  username: string;
  display_name?: string | null;
  status: string;
  last_sync_at?: string | null;
  created_at?: string;
};

type XDraft = {
  id: string;
  account_connection_id: string;
  author_agent_id: string;
  kind: 'post' | 'reply';
  text: string;
  reply_to_post_id?: string | null;
  guardrail_status: string;
  guardrail_reasons?: string[];
  similarity_score?: number;
  approval_status: string;
  created_at: string;
  updated_at: string;
  account?: XAccountConnection | null;
};

type XQueueItem = {
  id: string;
  draft_id: string;
  account_connection_id: string;
  kind: string;
  text_snapshot: string;
  scheduled_for: string;
  publish_status: string;
  attempt_count: number;
  last_error?: string | null;
  published_post_id?: string | null;
  published_at?: string | null;
  account?: XAccountConnection | null;
};

function formatTimestamp(value?: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString();
}

function DraftStatusBadge({ status }: { status: string }) {
  const className =
    status === 'required' ? 'badge badge-amber' :
    status === 'approved' || status === 'auto_approved' ? 'badge badge-green' :
    status === 'blocked' ? 'badge badge-danger' :
    'badge badge-dim';

  return <span className={className}>{status.replace(/_/g, ' ')}</span>;
}

function QueueStatusBadge({ status }: { status: string }) {
  const className =
    status === 'queued' ? 'badge badge-amber' :
    status === 'published' ? 'badge badge-green' :
    status === 'failed' || status === 'canceled' ? 'badge badge-danger' :
    'badge badge-dim';

  return <span className={className}>{status}</span>;
}

function DashboardXPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [accounts, setAccounts] = useState<XAccountConnection[]>([]);
  const [drafts, setDrafts] = useState<XDraft[]>([]);
  const [queue, setQueue] = useState<XQueueItem[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<'all' | string>('all');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const currentSession = await fetchBrowserSession();
      if (!active) return;
      if (!currentSession) {
        clearLegacyBrowserAuth();
        router.replace('/signin');
        return;
      }

      setSession(currentSession);
      await loadData();
    }

    async function loadData() {
      try {
        const [accountsRes, draftsRes, queueRes] = await Promise.all([
          fetch('/api/x/accounts', { cache: 'no-store' }),
          fetch('/api/x/drafts?limit=100', { cache: 'no-store' }),
          fetch('/api/x/queue?limit=100', { cache: 'no-store' }),
        ]);

        const [accountsBody, draftsBody, queueBody] = await Promise.all([
          accountsRes.json(),
          draftsRes.json(),
          queueRes.json(),
        ]);

        if (!active) return;

        if (!accountsRes.ok) throw new Error(accountsBody.error || 'Failed to load X accounts');
        if (!draftsRes.ok) throw new Error(draftsBody.error || 'Failed to load X drafts');
        if (!queueRes.ok) throw new Error(queueBody.error || 'Failed to load X queue');

        setAccounts(Array.isArray(accountsBody.accounts) ? accountsBody.accounts : []);
        setDrafts(Array.isArray(draftsBody.drafts) ? draftsBody.drafts : []);
        setQueue(Array.isArray(queueBody.queue) ? queueBody.queue : []);
        setError('');
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load X operations data');
        setAccounts([]);
        setDrafts([]);
        setQueue([]);
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void bootstrap();
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    const oauthStatus = searchParams.get('x_oauth');
    const username = searchParams.get('username');
    const reason = searchParams.get('reason');

    if (oauthStatus === 'success') {
      setNotice(`Connected @${username || 'account'} successfully.`);
    } else if (oauthStatus === 'error') {
      setError(reason || 'X OAuth failed');
    }
  }, [searchParams]);

  async function reload() {
    setRefreshing(true);
    try {
      const [accountsRes, draftsRes, queueRes] = await Promise.all([
        fetch('/api/x/accounts', { cache: 'no-store' }),
        fetch('/api/x/drafts?limit=100', { cache: 'no-store' }),
        fetch('/api/x/queue?limit=100', { cache: 'no-store' }),
      ]);

      const [accountsBody, draftsBody, queueBody] = await Promise.all([
        accountsRes.json(),
        draftsRes.json(),
        queueRes.json(),
      ]);

      if (!accountsRes.ok) throw new Error(accountsBody.error || 'Failed to load X accounts');
      if (!draftsRes.ok) throw new Error(draftsBody.error || 'Failed to load X drafts');
      if (!queueRes.ok) throw new Error(queueBody.error || 'Failed to load X queue');

      setAccounts(Array.isArray(accountsBody.accounts) ? accountsBody.accounts : []);
      setDrafts(Array.isArray(draftsBody.drafts) ? draftsBody.drafts : []);
      setQueue(Array.isArray(queueBody.queue) ? queueBody.queue : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload X data');
    } finally {
      setRefreshing(false);
    }
  }

  async function connectAccount() {
    setConnecting(true);
    setError('');
    try {
      const response = await fetch('/api/x/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirectTo: '/dashboard/x' }),
      });
      const body = await response.json();
      if (!response.ok || !body.authorizationUrl) {
        throw new Error(body.error || 'Failed to start X account connection');
      }
      window.location.href = body.authorizationUrl as string;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start X account connection');
      setConnecting(false);
    }
  }

  async function handleAction(label: string, task: () => Promise<void>, successMessage: string) {
    setBusyKey(label);
    setError('');
    setNotice('');
    try {
      await task();
      setNotice(successMessage);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyKey('');
    }
  }

  async function approveDraft(draftId: string) {
    await handleAction(`approve:${draftId}`, async () => {
      const response = await fetch(`/api/x/drafts/${draftId}/approve`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Failed to approve draft');
    }, 'Draft approved.');
  }

  async function blockDraft(draftId: string) {
    await handleAction(`block:${draftId}`, async () => {
      const response = await fetch(`/api/x/drafts/${draftId}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Blocked by operator review' }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Failed to block draft');
    }, 'Draft blocked.');
  }

  async function publishNow(params: { draftId?: string; queueId?: string }) {
    const key = params.queueId ? `publishq:${params.queueId}` : `publishd:${params.draftId}`;
    await handleAction(key, async () => {
      const response = await fetch('/api/x/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Failed to publish item');
    }, 'Publish action completed.');
  }

  async function handleSignOut() {
    await destroyBrowserSession();
    router.push('/signin');
  }

  const filteredDrafts = useMemo(() => {
    return selectedAccountId === 'all'
      ? drafts
      : drafts.filter(draft => draft.account_connection_id === selectedAccountId);
  }, [drafts, selectedAccountId]);

  const filteredQueue = useMemo(() => {
    return selectedAccountId === 'all'
      ? queue
      : queue.filter(item => item.account_connection_id === selectedAccountId);
  }, [queue, selectedAccountId]);

  const pendingDrafts = filteredDrafts.filter(draft => draft.approval_status === 'required');
  const reviewableDrafts = filteredDrafts.filter(draft => ['required', 'approved', 'auto_approved', 'blocked'].includes(draft.approval_status));
  const queuedDraftIds = new Set(filteredQueue.filter(item => ['queued', 'publishing'].includes(item.publish_status)).map(item => item.draft_id));
  const queuedItems = filteredQueue.filter(item => item.publish_status === 'queued');

  if (loading || !session) {
    return <div className="min-h-screen" style={{ background: 'var(--bg)' }} />;
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <nav style={{ background: 'rgba(3,3,10,0.9)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(16px)' }} className="sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard/social" className="flex items-center gap-2">
              <div className="w-7 h-7 flex items-center justify-center font-black font-mono text-xs" style={{ background: 'var(--bg-primary)', border: '1px solid var(--accent)', color: 'var(--accent)' }}>
                X
              </div>
              <span className="font-mono font-bold text-sm">X<span style={{ color: 'var(--accent)' }}>Ops</span></span>
            </Link>
            <div className="hidden sm:flex items-center gap-5 text-sm" style={{ color: 'var(--text-muted)' }}>
              <Link href="/dashboard/social" className="hover:text-white transition-colors">Example Hub</Link>
              <Link href="/studio" className="hover:text-white transition-colors">Studio</Link>
              <Link href="/ops" className="hover:text-white transition-colors">Ops</Link>
              <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block font-mono text-xs px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.18)', color: '#fdba74' }}>
              {session.agentId.slice(0, 22)}...
            </span>
            <button onClick={() => void handleSignOut()} className="btn-outline text-sm px-3 py-1.5 rounded-lg">Sign out</button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-5 py-8 space-y-6">
        <section className="card p-6 relative overflow-hidden">
          <div className="absolute -top-20 -right-12 w-56 h-56 rounded-full" style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.20), transparent 65%)', filter: 'blur(6px)' }} />
          <div className="relative flex flex-col xl:flex-row xl:items-end justify-between gap-6">
            <div className="max-w-3xl">
              <div className="badge badge-amber mb-3">Approval-first control plane</div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-3">Review drafts, manage queue, and publish intentionally.</h1>
              <p className="text-sm sm:text-base leading-7" style={{ color: 'var(--text-muted)' }}>
                Connected X accounts use dedicated child agents, encrypted OAuth storage, and explicit operator review before publishing. This screen is the X moderation layer inside the broader example integration control plane.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => void connectAccount()} disabled={connecting} className="btn-primary rounded-lg px-5 py-3 text-sm">
                {connecting ? 'Redirecting...' : 'Connect X account'}
              </button>
              <button onClick={() => void reload()} disabled={refreshing} className="btn-outline rounded-lg px-5 py-3 text-sm">
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </section>

        {notice && (
          <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#86efac' }}>
            {notice}
          </div>
        )}

        {error && (
          <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
            {error}
          </div>
        )}

        <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Connected Accounts', value: accounts.length, tone: '#fb923c' },
            { label: 'Pending Approval', value: pendingDrafts.length, tone: '#facc15' },
            { label: 'Queued Publishes', value: queuedItems.length, tone: '#38bdf8' },
            { label: 'Reviewable Drafts', value: reviewableDrafts.length, tone: '#a78bfa' },
          ].map(item => (
            <div key={item.label} className="card p-5">
              <div className="text-3xl font-black" style={{ color: item.tone }}>{item.value}</div>
              <div className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{item.label}</div>
            </div>
          ))}
        </section>

        <section className="card p-4 flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
          <div>
            <div className="text-sm font-semibold">Account Filter</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Review all connected accounts together or isolate a single account.</div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedAccountId}
              onChange={event => setSelectedAccountId(event.target.value)}
              className="input-dark min-w-[240px]"
            >
              <option value="all">All connected accounts</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>@{account.username}</option>
              ))}
            </select>
          </div>
        </section>

        <section className="grid xl:grid-cols-[0.95fr_1.05fr] gap-6">
          <div className="space-y-6">
            <div className="card p-5">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-lg font-black">Connected Accounts</h2>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Each account has a dedicated child agent and independent sync state.</p>
                </div>
              </div>

              {accounts.length === 0 ? (
                <div className="rounded-xl p-8 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border-bright)' }}>
                  <div className="w-12 h-12 mx-auto rounded-2xl mb-4" style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.18), rgba(251,191,36,0.08))', border: '1px solid rgba(249,115,22,0.2)' }} />
                  <h3 className="font-bold mb-2">No X accounts connected yet</h3>
                  <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>Start with one account, keep replies in approval mode, and let the cron workers handle sync.</p>
                  <button onClick={() => void connectAccount()} disabled={connecting} className="btn-primary rounded-lg px-5 py-3 text-sm">
                    {connecting ? 'Redirecting...' : 'Connect first X account'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {accounts.map(account => (
                    <div key={account.id} className="rounded-2xl p-4" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))', border: '1px solid var(--border)' }}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <div className="text-lg font-black">@{account.username}</div>
                            <QueueStatusBadge status={account.status} />
                          </div>
                          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{account.display_name || 'Connected X account'}</div>
                        </div>
                        <div className="text-xs text-right" style={{ color: 'var(--text-muted)' }}>
                          <div>Last sync: {formatTimestamp(account.last_sync_at)}</div>
                          <div>Connected: {formatTimestamp(account.created_at)}</div>
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3 mt-4 text-xs font-mono">
                        <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(0,0,0,0.28)', border: '1px solid var(--border-bright)' }}>
                          <div style={{ color: 'var(--text-muted)' }}>Connection ID</div>
                          <div className="mt-1 break-all">{account.id}</div>
                        </div>
                        <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(0,0,0,0.28)', border: '1px solid var(--border-bright)' }}>
                          <div style={{ color: 'var(--text-muted)' }}>Child Agent</div>
                          <div className="mt-1 break-all">{account.child_agent_id}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-5">
              <h2 className="text-lg font-black mb-4">Publish Queue</h2>
              <div className="space-y-3">
                {filteredQueue.length === 0 ? (
                  <div className="rounded-xl p-5 text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border-bright)', color: 'var(--text-muted)' }}>
                    No queued publish items for the current filter.
                  </div>
                ) : (
                  filteredQueue.map(item => (
                    <div key={item.id} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className="font-semibold">@{item.account?.username || 'account'}</span>
                            <QueueStatusBadge status={item.publish_status} />
                            <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                              {item.kind}
                            </span>
                          </div>
                          <p className="text-sm leading-6">{item.text_snapshot}</p>
                          <div className="flex flex-wrap gap-4 mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                            <span>Scheduled: {formatTimestamp(item.scheduled_for)}</span>
                            <span>Attempts: {item.attempt_count}</span>
                            {item.published_post_id ? <span>Post ID: {item.published_post_id}</span> : null}
                          </div>
                          {item.last_error ? (
                            <div className="mt-3 text-xs" style={{ color: '#fca5a5' }}>Last error: {item.last_error}</div>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-2 min-w-[120px]">
                          {item.publish_status === 'queued' ? (
                            <button
                              onClick={() => void publishNow({ queueId: item.id })}
                              disabled={busyKey === `publishq:${item.id}`}
                              className="btn-primary rounded-lg px-4 py-2 text-sm"
                            >
                              {busyKey === `publishq:${item.id}` ? 'Publishing...' : 'Publish now'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-lg font-black">Draft Review Queue</h2>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Approve, block, or manually publish drafts that have cleared policy.</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black" style={{ color: '#facc15' }}>{pendingDrafts.length}</div>
                <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Pending</div>
              </div>
            </div>

            <div className="space-y-4">
              {reviewableDrafts.length === 0 ? (
                <div className="rounded-xl p-6 text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border-bright)', color: 'var(--text-muted)' }}>
                  No drafts are waiting for review in the current filter.
                </div>
              ) : (
                reviewableDrafts.map(draft => {
                  const canApprove = draft.approval_status === 'required' && draft.guardrail_status !== 'rejected';
                  const canBlock = draft.approval_status !== 'blocked';
                  const canPublish = ['approved', 'auto_approved'].includes(draft.approval_status) && !queuedDraftIds.has(draft.id);

                  return (
                    <div key={draft.id} className="rounded-2xl p-4" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))', border: '1px solid var(--border)' }}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className="font-semibold">@{draft.account?.username || 'account'}</span>
                            <DraftStatusBadge status={draft.approval_status} />
                            <span className="badge badge-dim">{draft.guardrail_status}</span>
                            <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                              {draft.kind}
                            </span>
                          </div>
                          <p className="text-sm leading-6 whitespace-pre-wrap">{draft.text}</p>

                          <div className="flex flex-wrap gap-4 mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                            <span>Created: {formatTimestamp(draft.created_at)}</span>
                            <span>Similarity: {(Number(draft.similarity_score ?? 0)).toFixed(2)}</span>
                            {draft.reply_to_post_id ? <span>Reply to: {draft.reply_to_post_id}</span> : null}
                          </div>

                          {Array.isArray(draft.guardrail_reasons) && draft.guardrail_reasons.length > 0 ? (
                            <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.18)', color: '#fdba74' }}>
                              {draft.guardrail_reasons.join(' ')}
                            </div>
                          ) : null}

                          {queuedDraftIds.has(draft.id) ? (
                            <div className="mt-3 text-xs" style={{ color: '#93c5fd' }}>This draft already has an active queue item.</div>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-2 min-w-[120px]">
                          {canApprove ? (
                            <button
                              onClick={() => void approveDraft(draft.id)}
                              disabled={busyKey === `approve:${draft.id}`}
                              className="btn-primary rounded-lg px-4 py-2 text-sm"
                            >
                              {busyKey === `approve:${draft.id}` ? 'Approving...' : 'Approve'}
                            </button>
                          ) : null}
                          {canPublish ? (
                            <button
                              onClick={() => void publishNow({ draftId: draft.id })}
                              disabled={busyKey === `publishd:${draft.id}`}
                              className="btn-outline rounded-lg px-4 py-2 text-sm"
                            >
                              {busyKey === `publishd:${draft.id}` ? 'Publishing...' : 'Publish'}
                            </button>
                          ) : null}
                          {canBlock ? (
                            <button
                              onClick={() => void blockDraft(draft.id)}
                              disabled={busyKey === `block:${draft.id}`}
                              className="btn-outline rounded-lg px-4 py-2 text-sm"
                            >
                              {busyKey === `block:${draft.id}` ? 'Blocking...' : 'Block'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}


export default function DashboardXPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: 'var(--bg)' }} />}>
      <DashboardXPageContent />
    </Suspense>
  );
}

