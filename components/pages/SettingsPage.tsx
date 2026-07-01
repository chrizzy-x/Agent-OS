'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import {
  destroyBrowserSession,
  fetchBrowserSessionState,
  fetchWithBrowserSession,
  type BrowserSession,
  type BrowserSessionAuthState,
} from '@/src/auth/browser-session';
import { getUpgradeablePlans, PLAN_LABELS, type AgentPlan } from '@/src/auth/tiers';
import { Badge, Button, Card, EmptyState, Input, LoadingState, PageHeader, Textarea } from '@/components/os/ui';

type SettingsSectionId =
  | 'general'
  | 'account'
  | 'billing'
  | 'appearance'
  | 'notifications'
  | 'privacy-security'
  | 'developer-access'
  | 'sessions'
  | 'devices'
  | 'experimental';

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
type BearerToken = { id: string; name: string; scopes: string[]; status: 'active' | 'revoked'; maskedToken: string; lastUsedAt: string | null; createdAt: string };
type RefreshSession = { id: string; deviceLabel: string | null; userAgent: string | null; createdAt: string; lastSeenAt: string | null; expiresAt: string; revokedAt: string | null };
type TrustedDevice = { id: string; label: string; userAgent: string | null; lastSeenAt: string | null; createdAt: string; revokedAt: string | null };
type SessionAudit = { id: string; sessionId: string | null; deviceId: string | null; action: string; metadata: Record<string, unknown>; createdAt: string };
type ThemePreference = 'system' | 'light' | 'dark';

const SETTINGS_SECTIONS: Array<{ id: SettingsSectionId; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'account', label: 'Account' },
  { id: 'billing', label: 'Subscription & Billing' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'privacy-security', label: 'Privacy & Security' },
  { id: 'experimental', label: 'Experimental' },
  { id: 'developer-access', label: 'Developer Access' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'devices', label: 'Devices' },
];

const PLAN_CARDS: Array<{ plan: AgentPlan; summary: string }> = [
  { plan: 'retail_free', summary: 'Core AgentOS, workspace installs, workflows, subagents, and Vault.' },
  { plan: 'retail_pro', summary: 'Free plus bearer tokens, higher limits, and API access.' },
  { plan: 'enterprise_plus', summary: 'Pro plus SDK, publishing, MCP, and team controls.' },
  { plan: 'enterprise_max', summary: 'Enterprise plus highest limits, governance, and diagnostics.' },
];

function planLabel(plan: string | undefined): string {
  return plan && plan in PLAN_LABELS ? PLAN_LABELS[plan as AgentPlan] : plan ?? 'Free';
}

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : 'Never';
}

function CardSection(props: { id?: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={props.id}>
      <Card>
        <div className="os-entity-head" style={{ marginBottom: 12 }}>
          <div className="os-entity-title">{props.title}</div>
          {props.action}
        </div>
        {props.children}
      </Card>
    </section>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [section, setSection] = useState<SettingsSectionId>('general');
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceName, setWorkspaceName] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [tokens, setTokens] = useState<BearerToken[]>([]);
  const [newTokenName, setNewTokenName] = useState('Workspace API');
  const [oneTimeToken, setOneTimeToken] = useState('');
  const [sessions, setSessions] = useState<RefreshSession[]>([]);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [audit, setAudit] = useState<SessionAudit[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<AgentPlan | null>(null);

  const currentPlan = workspaces[0]?.plan ? String(workspaces[0].plan) : session?.plan ?? 'retail_free';
  const currentPlanLabel = planLabel(currentPlan);
  const currentPlanKey = currentPlan in PLAN_LABELS ? currentPlan as AgentPlan : null;
  const upgradeablePlans = useMemo(() => currentPlanKey ? new Set(getUpgradeablePlans(currentPlanKey)) : new Set<AgentPlan>(), [currentPlanKey]);

  const themePreference = (profile?.preferences?.theme === 'light' || profile?.preferences?.theme === 'dark' || profile?.preferences?.theme === 'system'
    ? profile.preferences.theme
    : 'system') as ThemePreference;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sessionState = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
      setSession(sessionState.session);
      setAuthState(sessionState.state);
      if (!sessionState.session) {
        setProfile(null);
        setWorkspaces([]);
        setTokens([]);
        setSessions([]);
        setDevices([]);
        setAudit([]);
        return;
      }
      const [profileRes, workspacesRes, tokensRes, sessionsRes, devicesRes] = await Promise.all([
        fetchWithBrowserSession('/api/agent/me', { cache: 'no-store', credentials: 'include' }),
        fetchWithBrowserSession('/api/workspaces', { cache: 'no-store', credentials: 'include' }),
        fetchWithBrowserSession('/api/bearer-tokens', { cache: 'no-store', credentials: 'include' }).catch(() => null),
        fetchWithBrowserSession('/api/settings/sessions', { cache: 'no-store', credentials: 'include' }).catch(() => null),
        fetchWithBrowserSession('/api/settings/devices', { cache: 'no-store', credentials: 'include' }).catch(() => null),
      ]);
      setAuthState(profileRes.authState !== 'active' ? profileRes.authState : workspacesRes.authState);
      const profileData = await profileRes.response.json();
      const workspaceData = await workspacesRes.response.json();
      const tokenData = tokensRes?.response.ok ? await tokensRes.response.json() : { tokens: [] };
      const sessionData = sessionsRes?.response.ok ? await sessionsRes.response.json() : { sessions: [], audit: [] };
      const deviceData = devicesRes?.response.ok ? await devicesRes.response.json() : { devices: [] };
      setProfile(profileRes.response.ok ? profileData : {
        id: 'browser-session',
        name: sessionState.session.agentName ?? null,
        email: null,
        username: null,
        avatarUrl: sessionState.session.avatarUrl ?? null,
        bio: null,
        website: null,
        preferences: { theme: 'system' },
      });
      setWorkspaces(workspaceData.workspaces ?? []);
      setWorkspaceName(workspaceData.workspaces?.[0]?.name ?? '');
      setTokens(tokenData.tokens ?? []);
      setSessions(sessionData.sessions ?? []);
      setAudit(sessionData.audit ?? []);
      setDevices(deviceData.devices ?? []);
    } catch {
      setProfile(null);
      setWorkspaces([]);
      setTokens([]);
      setSessions([]);
      setDevices([]);
      setAudit([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const requested = searchParams.get('section') as SettingsSectionId | null;
    const hash = window.location.hash.replace('#', '') as SettingsSectionId;
    if (requested && SETTINGS_SECTIONS.some(item => item.id === requested)) setSection(requested);
    else if (SETTINGS_SECTIONS.some(item => item.id === hash)) setSection(hash);
    else if (['downloads', 'organizations', 'workspaces'].includes(hash)) setSection('general');
    void load();
  }, [load, searchParams]);

  function selectSection(next: SettingsSectionId) {
    setSection(next);
    const params = new URLSearchParams(window.location.search);
    params.set('section', next);
    window.history.replaceState(null, '', `/settings?${params.toString()}`);
  }

  function setThemePreference(theme: ThemePreference) {
    setProfile(current => current ? { ...current, preferences: { ...(current.preferences ?? {}), theme } } : current);
    window.dispatchEvent(new CustomEvent('agentos:set-theme', { detail: { theme } }));
  }

  async function saveAccount() {
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
      if (firstWorkspace && workspaceName.trim() && workspaceName !== firstWorkspace.name) {
        await fetch(`/api/workspaces/${firstWorkspace.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: workspaceName.trim() }),
        });
      }
      const payload = await profileRes.json().catch(() => ({}));
      setMessage(profileRes.ok ? 'Settings saved.' : payload.error ?? 'Save failed.');
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function createWorkspace() {
    if (!newWorkspaceName.trim()) return;
    const response = await fetch('/api/workspaces', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newWorkspaceName.trim() }),
    });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? 'Workspace created.' : payload.error ?? payload.message ?? 'Workspace creation failed.');
    if (response.ok) setNewWorkspaceName('');
    await load();
  }

  async function createToken() {
    setMessage('');
    setOneTimeToken('');
    const response = await fetch('/api/bearer-tokens', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTokenName, workspaceId: workspaces[0]?.id ?? null, scopes: ['workspace', 'api'] }),
    });
    const payload = await response.json().catch(() => ({})) as { bearerToken?: string; error?: string };
    if (!response.ok || !payload.bearerToken) {
      setMessage(payload.error ?? 'Bearer token creation failed.');
      return;
    }
    setOneTimeToken(payload.bearerToken);
    setMessage('Bearer token created. It will be masked after this view.');
    await load();
  }

  async function revokeToken(id: string) {
    const response = await fetch('/api/bearer-tokens', {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setMessage(response.ok ? 'Bearer token revoked.' : 'Bearer token revoke failed.');
    await load();
  }

  async function revokeSession(sessionId: string) {
    const response = await fetch(`/api/settings/sessions?sessionId=${encodeURIComponent(sessionId)}`, { method: 'DELETE', credentials: 'include' });
    setMessage(response.ok ? 'Session revoked.' : 'Session revoke failed.');
    await load();
  }

  async function signOutCurrentDevice() {
    await destroyBrowserSession();
    router.replace('/signin');
  }

  async function signOutAllDevices() {
    await fetch('/api/settings/sessions', { method: 'DELETE', credentials: 'include' }).catch(() => null);
    await destroyBrowserSession();
    router.replace('/signin');
  }

  async function changePlan(newPlan: AgentPlan) {
    setPendingPlan(newPlan);
    setMessage('');
    try {
      const response = await fetch('/api/plans/transition', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPlan }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      setMessage(response.ok ? `${PLAN_LABELS[newPlan]} is now active.` : payload.message ?? 'Plan change failed.');
      await load();
    } finally {
      setPendingPlan(null);
    }
  }

  function renderGeneral() {
    return (
      <div className="os-drawer-stack">
        <CardSection id="downloads" title="General">
          <div className="settings-two-column">
            <div className="os-entity-copy">Workspace: {workspaces[0]?.name ?? 'Default workspace'}</div>
            <div className="os-entity-copy">Plan: {currentPlanLabel}</div>
            <div className="os-entity-copy">Desktop app: Coming soon</div>
            <div className="os-entity-copy">Mobile app: Coming soon</div>
          </div>
        </CardSection>
        <CardSection id="workspaces" title="Workspaces">
          <div className="os-drawer-stack">
            <Input value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} placeholder="Current workspace name" />
            <div className="os-inline-actions">
              <Input value={newWorkspaceName} onChange={event => setNewWorkspaceName(event.target.value)} placeholder="New workspace name" />
              <Button onClick={() => void createWorkspace()}>Create Workspace</Button>
            </div>
            <div className="os-entity-copy">Switch workspace from the global sidebar workspace selector.</div>
            <div className="os-entity-copy">Switch Organization is coming soon.</div>
          </div>
        </CardSection>
      </div>
    );
  }

  function renderAccount() {
    if (!profile) return null;
    return (
      <div className="os-drawer-stack">
        <CardSection title="Profile">
          <div className="settings-profile-grid">
            <div className="profile-avatar-preview">
              {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span>{(profile.name || profile.username || 'User').split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || 'U'}</span>}
            </div>
            <div className="settings-two-column">
              <Input value={profile.name ?? ''} onChange={event => setProfile(current => current ? { ...current, name: event.target.value } : current)} placeholder="Full name" />
              <Input value={profile.email ?? ''} onChange={event => setProfile(current => current ? { ...current, email: event.target.value } : current)} placeholder="Email" />
              <Input value={profile.username ?? ''} onChange={event => setProfile(current => current ? { ...current, username: event.target.value } : current)} placeholder="Username" />
              <Input value={profile.website ?? ''} onChange={event => setProfile(current => current ? { ...current, website: event.target.value } : current)} placeholder="Website" />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <Textarea value={profile.bio ?? ''} onChange={event => setProfile(current => current ? { ...current, bio: event.target.value } : current)} placeholder="Bio" />
          </div>
        </CardSection>
        <CardSection title="Account">
          <div className="settings-two-column">
            <div className="os-entity-copy">Current Session: {session?.expiresAt ? `expires ${formatDate(session.expiresAt)}` : 'Active'}</div>
            <div className="os-entity-copy">Account type: {session?.accountType ?? 'retail'}</div>
          </div>
        </CardSection>
      </div>
    );
  }

  function renderBilling() {
    return (
      <div className="os-drawer-stack">
        <CardSection title="Current Plan">
          <div className="os-inline-actions">
            <Badge tone="accent">{currentPlanLabel}</Badge>
            <span className="os-entity-copy">Usage and limits are enforced by backend capabilities.</span>
          </div>
        </CardSection>
        <CardSection title="Usage">
          <div className="settings-two-column">
            <div className="os-entity-copy">Token Usage: available in plan telemetry when enabled.</div>
            <div className="os-entity-copy">Builder Revenue: {session?.capabilities?.includes('create_app') ? 'Enabled for publisher workspaces.' : 'Not enabled.'}</div>
          </div>
        </CardSection>
        <CardSection title="Plans">
          <div className="settings-plan-grid">
            {PLAN_CARDS.map(card => {
              const active = currentPlanKey === card.plan;
              const canSwitch = active || upgradeablePlans.has(card.plan);
              return (
                <Card key={card.plan}>
                  <div className="os-drawer-stack">
                    <div className="os-entity-head">
                      <strong>{PLAN_LABELS[card.plan]}</strong>
                      {active ? <Badge tone="success">Current</Badge> : null}
                    </div>
                    <div className="os-entity-copy">{card.summary}</div>
                    <Button disabled={!canSwitch || active || pendingPlan !== null} onClick={() => void changePlan(card.plan)}>
                      {active ? 'Active' : pendingPlan === card.plan ? 'Changing...' : card.plan.startsWith('retail') ? 'Downgrade' : 'Upgrade'}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </CardSection>
        <CardSection title="Payment Method, Invoices, Enterprise License">
          <div className="settings-two-column">
            <div className="os-entity-copy">Payment Method: beta billing is disabled.</div>
            <div className="os-entity-copy">Invoices: no invoices available in beta mode.</div>
            <div className="os-entity-copy">Enterprise License: contact sales when enabled.</div>
          </div>
        </CardSection>
      </div>
    );
  }

  function renderDeveloperAccess() {
    const developerCapabilities = [
      ['Developer Console', session?.capabilities?.includes('access_developer_console') === true],
      ['App Publishing', session?.capabilities?.includes('create_app') === true],
      ['Skill Publishing', session?.capabilities?.includes('create_skill') === true || session?.capabilities?.includes('publish_skill') === true],
      ['SDK', session?.capabilities?.includes('access_sdk') === true],
      ['Webhooks', session?.capabilities?.includes('manage_webhook') === true],
    ] as const;
    return (
      <div className="os-drawer-stack">
        <CardSection title="Developer Access">
          <div className="settings-two-column">
            <div className="os-entity-copy">Workspace plan: {currentPlanLabel}</div>
            <div className="os-entity-copy">Developer routes stay gated by backend capabilities.</div>
          </div>
        </CardSection>
        <CardSection title="Capabilities">
          <div className="settings-two-column">
            {developerCapabilities.map(([label, enabled]) => (
              <div key={label} className="os-entity-head">
                <span className="os-entity-copy">{label}</span>
                <Badge tone={enabled ? 'success' : 'default'}>{enabled ? 'Enabled' : 'Unavailable'}</Badge>
              </div>
            ))}
          </div>
        </CardSection>
      </div>
    );
  }

  function renderSessions() {
    return (
      <div className="os-drawer-stack">
        <CardSection title="Active Sessions" action={<Button variant="danger" onClick={() => void signOutAllDevices()}>Logout All Devices</Button>}>
          <div className="os-drawer-stack">
            {sessions.length === 0 ? <div className="os-empty-body">No active sessions recorded.</div> : sessions.map(item => (
              <div key={item.id} className="os-entity-head">
                <div>
                  <div className="os-entity-title">{item.deviceLabel ?? 'Browser session'}</div>
                  <div className="os-entity-copy">Last seen {formatDate(item.lastSeenAt)} | expires {formatDate(item.expiresAt)}</div>
                </div>
                <div className="os-inline-actions">
                  <Badge tone={item.revokedAt ? 'warning' : 'success'}>{item.revokedAt ? 'revoked' : 'active'}</Badge>
                  {!item.revokedAt ? <Button variant="danger" onClick={() => void revokeSession(item.id)}>Revoke</Button> : null}
                </div>
              </div>
            ))}
          </div>
        </CardSection>
        <CardSection title="Login History">
          <div className="os-drawer-stack">
            {audit.length === 0 ? <div className="os-empty-body">No login history recorded.</div> : audit.slice(0, 16).map(item => (
              <div key={item.id} className="os-entity-head">
                <span className="os-entity-copy">{item.action}</span>
                <span className="os-entity-copy">{formatDate(item.createdAt)}</span>
              </div>
            ))}
          </div>
        </CardSection>
      </div>
    );
  }

  function renderDevices() {
    return (
      <CardSection title="Devices">
        <div className="os-drawer-stack">
          {devices.length === 0 ? <div className="os-empty-body">No trusted devices recorded.</div> : devices.map(item => (
            <div key={item.id} className="os-entity-head">
              <div>
                <div className="os-entity-title">{item.label}</div>
                <div className="os-entity-copy">Last seen {formatDate(item.lastSeenAt)} | created {formatDate(item.createdAt)}</div>
              </div>
              <Badge tone={item.revokedAt ? 'warning' : 'success'}>{item.revokedAt ? 'revoked' : 'trusted'}</Badge>
            </div>
          ))}
        </div>
      </CardSection>
    );
  }

  function renderSecurity() {
    return (
      <div className="os-drawer-stack">
        <CardSection title="Current Device">
          <div className="os-entity-copy">{devices[0]?.label ?? 'Current browser'} | last seen {formatDate(devices[0]?.lastSeenAt)}</div>
        </CardSection>
        <CardSection title="Active Sessions" action={<Button variant="danger" onClick={() => void signOutAllDevices()}>Sign Out All Devices</Button>}>
          <div className="os-drawer-stack">
            {sessions.length === 0 ? <div className="os-empty-body">No active sessions recorded.</div> : sessions.map(item => (
              <div key={item.id} className="os-entity-head">
                <div>
                  <div className="os-entity-title">{item.deviceLabel ?? 'Browser session'}</div>
                  <div className="os-entity-copy">Last seen {formatDate(item.lastSeenAt)} | created {formatDate(item.createdAt)}</div>
                </div>
                <div className="os-inline-actions">
                  <Badge tone={item.revokedAt ? 'warning' : 'success'}>{item.revokedAt ? 'revoked' : 'active'}</Badge>
                  {!item.revokedAt ? <Button variant="danger" onClick={() => void revokeSession(item.id)}>Revoke Session</Button> : null}
                </div>
              </div>
            ))}
          </div>
        </CardSection>
        <CardSection title="Login History">
          <div className="os-drawer-stack">
            {audit.length === 0 ? <div className="os-empty-body">No login history recorded.</div> : audit.slice(0, 12).map(item => (
              <div key={item.id} className="os-entity-head">
                <span className="os-entity-copy">{item.action}</span>
                <span className="os-entity-copy">{formatDate(item.createdAt)}</span>
              </div>
            ))}
          </div>
        </CardSection>
        <CardSection title="API Tokens" action={<Button onClick={() => void createToken()}>Create token</Button>}>
          <div className="os-drawer-stack">
            <Input value={newTokenName} onChange={event => setNewTokenName(event.target.value)} placeholder="Token name" />
            {oneTimeToken ? <Textarea value={oneTimeToken} readOnly placeholder="One-time token" /> : null}
            {tokens.length === 0 ? <div className="os-empty-body">No bearer tokens yet.</div> : tokens.map(token => (
              <div key={token.id} className="os-entity-head">
                <div>
                  <div className="os-entity-title">{token.name}</div>
                  <div className="os-entity-copy">{token.maskedToken} | {token.scopes.join(', ')} | last used {formatDate(token.lastUsedAt)}</div>
                </div>
                <div className="os-inline-actions">
                  <Badge tone={token.status === 'active' ? 'success' : 'default'}>{token.status}</Badge>
                  {token.status === 'active' ? <Button variant="danger" onClick={() => void revokeToken(token.id)}>Revoke</Button> : null}
                </div>
              </div>
            ))}
          </div>
        </CardSection>
        <CardSection title="Sign Out">
          <div className="os-inline-actions">
            <Button variant="secondary" onClick={() => void signOutCurrentDevice()}>Sign Out Current Device</Button>
            <Button variant="danger" onClick={() => void signOutAllDevices()}>Sign Out All Devices</Button>
          </div>
        </CardSection>
      </div>
    );
  }

  function renderCurrentSection() {
    if (section === 'general') return renderGeneral();
    if (section === 'account') return renderAccount();
    if (section === 'billing') return renderBilling();
    if (section === 'appearance') return (
      <CardSection title="Appearance">
        <div className="os-segmented-control" role="group" aria-label="Theme">
          {(['system', 'light', 'dark'] as const).map(theme => (
            <button key={theme} type="button" className={themePreference === theme ? 'active' : ''} onClick={() => setThemePreference(theme)}>
              {theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
      </CardSection>
    );
    if (section === 'notifications') return (
      <CardSection title="Notifications">
        <div className="settings-two-column">
          <label className="os-switch" aria-checked="true"><span /> Product notifications</label>
          <label className="os-switch" aria-checked="true"><span /> Security alerts</label>
          <label className="os-switch" aria-checked="false"><span /> Marketing updates</label>
        </div>
      </CardSection>
    );
    if (section === 'privacy-security') return renderSecurity();
    if (section === 'developer-access') return renderDeveloperAccess();
    if (section === 'sessions') return renderSessions();
    if (section === 'devices') return renderDevices();
    return (
      <CardSection title="Experimental">
        <div className="settings-two-column">
          <div className="os-entity-copy">FFP: disabled and coming soon.</div>
          <div className="os-entity-copy">Keyboard Shortcuts: coming soon.</div>
          <div className="os-entity-copy">Internal previews: disabled unless explicitly enabled by workspace policy.</div>
        </div>
      </CardSection>
    );
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/settings" />
      <WorkspaceShell activePath="/settings">
        <PageHeader
          eyebrow="Settings"
          title="Settings"
          subtitle="Configure AgentOS account, billing, appearance, notifications, privacy, sessions, and experiments."
          actions={<Button onClick={() => void saveAccount()}>{saving ? 'Saving...' : 'Save changes'}</Button>}
        />

        {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}

        {loading ? <LoadingState label="Loading settings" /> : !profile ? (
          <EmptyState
            title={authState === 'expired' ? 'Session expired' : 'Sign in required'}
            body={authState === 'expired' ? 'Sign in again to configure AgentOS.' : 'Sign in to configure AgentOS.'}
            action={<Button href="/signin">{authState === 'expired' ? 'Sign in again' : 'Sign in'}</Button>}
          />
        ) : (
          <div className="settings-layout">
            <nav className="settings-nav" aria-label="Settings sections">
              {SETTINGS_SECTIONS.map(item => (
                <button key={item.id} type="button" className={section === item.id ? 'active' : ''} onClick={() => selectSection(item.id)}>
                  {item.label}
                </button>
              ))}
            </nav>
            <main className="settings-content">{renderCurrentSection()}</main>
          </div>
        )}
      </WorkspaceShell>
    </div>
  );
}
