'use client';

import { useCallback, useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import {
  AppShell,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  Select,
  SidebarNav,
  SidebarSection,
  Textarea,
} from '@/components/os/ui';

type AgentProfile = {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  bio: string | null;
  website: string | null;
  preferences?: {
    theme?: string;
    language?: string;
    timezone?: string;
    dateFormat?: string;
    timeFormat?: string;
    compactMode?: boolean;
    showAdvancedFeatures?: boolean;
    analyticsCrashReports?: boolean;
  };
};

type Workspace = { id: string; name: string; plan: string };

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceName, setWorkspaceName] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, workspacesRes] = await Promise.all([
        fetch('/api/agent/me', { cache: 'no-store' }),
        fetch('/api/workspaces', { cache: 'no-store' }),
      ]);
      const profileData = await profileRes.json();
      const workspaceData = await workspacesRes.json();
      setProfile(profileData);
      setWorkspaces(workspaceData.workspaces ?? []);
      setWorkspaceName(workspaceData.workspaces?.[0]?.name ?? '');
    } catch {
      setProfile(null);
      setWorkspaces([]);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const firstWorkspace = workspaces[0];
      if (firstWorkspace && workspaceName && workspaceName !== firstWorkspace.name) {
        await fetch(`/api/workspaces/${firstWorkspace.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: workspaceName }),
        });
      }
      const profilePayload = await profileRes.json();
      setMessage(profileRes.ok ? 'Settings saved' : profilePayload.error ?? 'Save failed');
      await load();
    } catch {
      setMessage('Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/settings" />
      <AppShell
        activePath="/settings"
        sidebar={(
          <SidebarSection title="Settings">
            <SidebarNav
              items={[
                { href: '/settings', label: 'Profile', active: true },
                { href: '/settings', label: 'Workspace' },
                { href: '/billing', label: 'Billing & Plan' },
                { href: '/settings/team', label: 'Security' },
                { href: '/developer', label: 'Integrations' },
                { href: '/settings/team', label: 'Notifications' },
                { href: '/settings/team', label: 'Advanced' },
              ]}
            />
          </SidebarSection>
        )}
      >
        <PageHeader
          eyebrow="Settings"
          title="Account and workspace settings"
          subtitle="Profile, workspace defaults, billing-adjacent preferences, and visibility controls."
          actions={<Button onClick={() => void save()}>{saving ? 'Saving...' : 'Save changes'}</Button>}
        />

        {loading ? <LoadingState label="Loading settings" /> : !profile ? (
          <EmptyState title="Settings unavailable" body="Sign in again to edit your account and workspace configuration." />
        ) : (
          <>
            <Card>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <Input value={profile.name ?? ''} onChange={event => setProfile(current => current ? { ...current, name: event.target.value } : current)} placeholder="Full name" />
                <Input value={profile.email ?? ''} onChange={event => setProfile(current => current ? { ...current, email: event.target.value } : current)} placeholder="Email" />
                <Input value={profile.username ?? ''} onChange={event => setProfile(current => current ? { ...current, username: event.target.value } : current)} placeholder="Username" />
                <Input value={profile.website ?? ''} onChange={event => setProfile(current => current ? { ...current, website: event.target.value } : current)} placeholder="Website" />
              </div>
              <div style={{ marginTop: 12 }}>
                <Textarea value={profile.bio ?? ''} onChange={event => setProfile(current => current ? { ...current, bio: event.target.value } : current)} placeholder="Bio" />
              </div>
            </Card>

            <Card>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <Select value={profile.preferences?.theme ?? 'dark'} onChange={event => setProfile(current => current ? { ...current, preferences: { ...current.preferences, theme: event.target.value } } : current)}>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </Select>
                <Input value={profile.preferences?.language ?? 'en'} onChange={event => setProfile(current => current ? { ...current, preferences: { ...current.preferences, language: event.target.value } } : current)} placeholder="Language" />
                <Input value={profile.preferences?.timezone ?? 'UTC'} onChange={event => setProfile(current => current ? { ...current, preferences: { ...current.preferences, timezone: event.target.value } } : current)} placeholder="Timezone" />
                <Select value={profile.preferences?.timeFormat ?? '24h'} onChange={event => setProfile(current => current ? { ...current, preferences: { ...current.preferences, timeFormat: event.target.value } } : current)}>
                  <option value="24h">24h</option>
                  <option value="12h">12h</option>
                </Select>
              </div>
            </Card>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Workspace</div>
              <div style={{ display: 'grid', gap: 12 }}>
                <Input value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} placeholder="Workspace name" />
                <div className="os-entity-copy">Plan: {workspaces[0]?.plan ?? 'retail_free'} · Default visibility: private</div>
              </div>
            </Card>

            {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}
          </>
        )}
      </AppShell>
    </div>
  );
}
