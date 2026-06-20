'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { destroyBrowserSession, fetchBrowserSessionState, fetchWithBrowserSession, type BrowserSessionAuthState } from '@/src/auth/browser-session';
import { PLAN_LABELS, type AgentPlan } from '@/src/auth/tiers';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  Textarea,
} from '@/components/os/ui';

type AgentProfile = {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  website: string | null;
  preferences?: Record<string, unknown>;
};

type Workspace = { id: string; name: string; plan: AgentPlan | string };

type BearerToken = {
  id: string;
  name: string;
  scopes: string[];
  status: 'active' | 'revoked';
  maskedToken: string;
  lastUsedAt: string | null;
  createdAt: string;
};

type ThemePreference = 'system' | 'light' | 'dark';

function planLabel(plan: string | undefined): string {
  return plan && plan in PLAN_LABELS ? PLAN_LABELS[plan as AgentPlan] : plan ?? 'Free';
}

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : 'Never';
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <div className="os-entity-head" style={{ marginBottom: 12 }}>
        <div className="os-entity-title">{title}</div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceName, setWorkspaceName] = useState('');
  const [tokens, setTokens] = useState<BearerToken[]>([]);
  const [newTokenName, setNewTokenName] = useState('Workspace API');
  const [oneTimeToken, setOneTimeToken] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const currentPlan = workspaces[0]?.plan ? String(workspaces[0].plan) : 'retail_free';
  const currentPlanLabel = planLabel(currentPlan);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sessionState = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
      setAuthState(sessionState.state);
      if (!sessionState.session) {
        setProfile(null);
        setWorkspaces([]);
        setTokens([]);
        return;
      }
      const [profileRes, workspacesRes, tokensRes] = await Promise.all([
        fetchWithBrowserSession('/api/agent/me', { cache: 'no-store', credentials: 'include' }),
        fetchWithBrowserSession('/api/workspaces', { cache: 'no-store', credentials: 'include' }),
        fetchWithBrowserSession('/api/bearer-tokens', { cache: 'no-store', credentials: 'include' }).catch(() => null),
      ]);
      setAuthState(profileRes.authState !== 'active' ? profileRes.authState : workspacesRes.authState);
      const profileData = await profileRes.response.json();
      const workspaceData = await workspacesRes.response.json();
      const tokenData = tokensRes?.response.ok ? await tokensRes.response.json() : { tokens: [] };
      setProfile(profileRes.response.ok ? profileData : {
        id: 'browser-session',
        name: sessionState.session.agentName ?? null,
        email: null,
        username: null,
        avatarUrl: sessionState.session.avatarUrl ?? null,
        bio: null,
        website: null,
        preferences: { theme: 'dark' },
      });
      setWorkspaces(workspaceData.workspaces ?? []);
      setWorkspaceName(workspaceData.workspaces?.[0]?.name ?? '');
      setTokens(tokenData.tokens ?? []);
    } catch {
      setProfile(null);
      setWorkspaces([]);
      setTokens([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!profile) return;
    setSaving(true);
    setMessage('');
    try {
      const profileRes = await fetch('/api/agent/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const firstWorkspace = workspaces[0];
      if (firstWorkspace && workspaceName && workspaceName !== firstWorkspace.name) {
        await fetch(`/api/workspaces/${firstWorkspace.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: workspaceName }),
        });
      }
      const profilePayload = await profileRes.json();
      setMessage(profileRes.ok ? 'Account saved' : profilePayload.error ?? 'Save failed');
      await load();
    } catch {
      setMessage('Save failed');
    } finally {
      setSaving(false);
    }
  }

  function updateAvatarFromFile(file: File | null) {
    if (!file || !file.type.startsWith('image/')) {
      setMessage(file ? 'Choose an image file for the avatar.' : '');
      return;
    }
    if (file.size > 180000) {
      setMessage('Avatar image must be under 180 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const avatarUrl = typeof reader.result === 'string' ? reader.result : '';
      if (avatarUrl) setProfile(current => current ? { ...current, avatarUrl } : current);
    };
    reader.readAsDataURL(file);
  }

  async function createToken() {
    setMessage('');
    setOneTimeToken('');
    const response = await fetch('/api/bearer-tokens', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newTokenName,
        workspaceId: workspaces[0]?.id ?? null,
        scopes: ['workspace', 'api'],
      }),
    });
    const payload = await response.json().catch(() => ({})) as { bearerToken?: string; error?: string };
    if (!response.ok || !payload.bearerToken) {
      setMessage(payload.error ?? 'Bearer token creation failed');
      return;
    }
    setOneTimeToken(payload.bearerToken);
    setMessage('Bearer token created. Copy it now; it will be masked after this view.');
    await load();
  }

  async function revokeToken(id: string) {
    const response = await fetch('/api/bearer-tokens', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setMessage(response.ok ? 'Bearer token revoked' : 'Bearer token revoke failed');
    await load();
  }

  async function logout() {
    await destroyBrowserSession();
    router.replace('/signin');
  }

  const tokenPreview = useMemo(() => tokens.slice(0, 6), [tokens]);
  const themePreference = (profile?.preferences?.theme === 'light' || profile?.preferences?.theme === 'dark' || profile?.preferences?.theme === 'system'
    ? profile.preferences.theme
    : 'system') as ThemePreference;

  function setThemePreference(theme: ThemePreference) {
    setProfile(current => current ? { ...current, preferences: { ...(current.preferences ?? {}), theme } } : current);
    window.dispatchEvent(new CustomEvent('agentos:set-theme', { detail: { theme } }));
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/profile" />
      <WorkspaceShell activePath="/profile">
        <PageHeader
          eyebrow="Profile"
          title="Account center"
          subtitle="Account, plan, billing, usage, security, sessions, tokens, Developer/SDK access, and logout."
          actions={(
            <div className="os-inline-actions">
              <Button href="/billing" variant="secondary">Upgrade Plan</Button>
              <Button onClick={() => void save()}>{saving ? 'Saving...' : 'Save changes'}</Button>
            </div>
          )}
        />

        {loading ? <LoadingState label="Loading account" /> : !profile ? (
          <EmptyState
            title={authState === 'expired' ? 'Session expired' : 'Sign in required'}
            body={authState === 'expired' ? 'Sign in again to manage your account.' : 'Sign in to manage your account.'}
            action={<Button href="/signin">{authState === 'expired' ? 'Sign in again' : 'Sign in'}</Button>}
          />
        ) : (
          <div className="os-drawer-stack">
            {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}

            <Section title="Account Info">
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 112px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
                <div className="profile-avatar-control">
                  <div className="profile-avatar-preview">
                    {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span>{(profile.name || profile.username || 'User').split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || 'U'}</span>}
                  </div>
                  <label className="btn-ghost" style={{ width: '100%', cursor: 'pointer' }}>
                    Upload
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={event => updateAvatarFromFile(event.target.files?.[0] ?? null)} />
                  </label>
                  {profile.avatarUrl ? <button type="button" className="btn-ghost" onClick={() => setProfile(current => current ? { ...current, avatarUrl: null } : current)}>Remove</button> : null}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <Input value={profile.name ?? ''} onChange={event => setProfile(current => current ? { ...current, name: event.target.value } : current)} placeholder="Full name" />
                  <Input value={profile.email ?? ''} onChange={event => setProfile(current => current ? { ...current, email: event.target.value } : current)} placeholder="Email" />
                  <Input value={profile.username ?? ''} onChange={event => setProfile(current => current ? { ...current, username: event.target.value } : current)} placeholder="Username" />
                  <Input value={profile.website ?? ''} onChange={event => setProfile(current => current ? { ...current, website: event.target.value } : current)} placeholder="Website" />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <Textarea value={profile.bio ?? ''} onChange={event => setProfile(current => current ? { ...current, bio: event.target.value } : current)} placeholder="Bio" />
              </div>
            </Section>

            <Section title="Current Plan" action={<Button href="/billing" variant="secondary">Upgrade Plan</Button>}>
              <div className="os-inline-actions">
                <Badge tone="accent">{currentPlanLabel}</Badge>
              </div>
            </Section>

            <Section title="Appearance">
              <div className="os-segmented-control" role="group" aria-label="Theme">
                {(['system', 'light', 'dark'] as const).map(theme => (
                  <button
                    key={theme}
                    type="button"
                    className={themePreference === theme ? 'active' : ''}
                    onClick={() => setThemePreference(theme)}
                  >
                    {theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Billing" action={<Button href="/billing" variant="secondary">Upgrade Plan</Button>}>
              <div className="os-entity-copy">Beta billing is $0. Plan changes are enforced by backend capability checks.</div>
            </Section>

            <Section title="Subscription" action={<Button href="/billing" variant="secondary">Upgrade Plan</Button>}>
              <div className="os-entity-copy">Active subscription: {currentPlanLabel}. Workspace: {workspaces[0]?.name ?? 'Default workspace'}.</div>
            </Section>

            <Section title="Usage">
              <div className="os-entity-copy">Usage follows the active plan limits for Super AgentOS, memory, workflows, subagents, apps, and skills.</div>
            </Section>

            <Section title="Security">
              <div className="os-entity-copy">Browser sessions use secure cookies. Bearer tokens are hashed, masked after creation, and revocable.</div>
            </Section>

            <Section title="Sessions">
              <div className="os-entity-copy">Use Logout to clear browser cookies, access tokens, refresh tokens, and local legacy credentials.</div>
            </Section>

            <Section title="API Tokens">
              <div className="os-entity-copy">Use Bearer Tokens for external API, MCP-style integrations, and automation access.</div>
            </Section>

            <Section title="Bearer Tokens" action={<Button onClick={() => void createToken()}>Create token</Button>}>
              <div style={{ display: 'grid', gap: 12 }}>
                <Input value={newTokenName} onChange={event => setNewTokenName(event.target.value)} placeholder="Token name" />
                {oneTimeToken ? <Textarea value={oneTimeToken} onChange={() => undefined} placeholder="One-time token" /> : null}
                {tokenPreview.length === 0 ? (
                  <div className="os-entity-copy">No bearer tokens yet.</div>
                ) : tokenPreview.map(token => (
                  <div key={token.id} className="os-entity-head">
                    <div>
                      <div className="os-entity-title">{token.name}</div>
                      <div className="os-entity-copy">{token.maskedToken} · {token.scopes.join(', ')} · last used {formatDate(token.lastUsedAt)}</div>
                    </div>
                    <div className="os-inline-actions">
                      <Badge tone={token.status === 'active' ? 'success' : 'default'}>{token.status}</Badge>
                      {token.status === 'active' ? <button type="button" className="btn-ghost" onClick={() => void revokeToken(token.id)}>Revoke</button> : null}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Developer / SDK" action={<Button href="/developer" variant="secondary">Open SDK</Button>}>
              <div className="os-entity-copy">SDK app discoverability is available on Enterprise and Enterprise Max plans. External agents and tools use Bearer Token or MCP connectivity.</div>
            </Section>

            <Section title="Workspace">
              <Input value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} placeholder="Workspace name" />
            </Section>

            <Section title="Logout" action={<Button onClick={() => void logout()} variant="secondary">Logout</Button>}>
              <div className="os-entity-copy">Logout clears the browser session, local legacy credentials, and blocks protected routes until sign-in.</div>
            </Section>
          </div>
        )}
      </WorkspaceShell>
    </div>
  );
}
