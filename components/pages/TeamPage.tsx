'use client';

import { useCallback, useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import {
  AppShell,
  Button,
  Card,
  DataTable,
  EmptyState,
  Input,
  LoadingState,
  MetricCard,
  PageHeader,
  Select,
  SidebarNav,
  SidebarSection,
  Tabs,
} from '@/components/os/ui';

type Workspace = { id: string; name: string; plan: string };
type Member = { userId: string; name: string | null; email: string | null; role: string; joinedAt: string };

const TABS = ['Members', 'Roles & Permissions', 'Activity Log', 'SSO & Security'];

export default function TeamPage() {
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [tab, setTab] = useState('Members');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const workspacesRes = await fetch('/api/workspaces', { cache: 'no-store' });
      const workspacesData = await workspacesRes.json();
      const nextWorkspaces = workspacesData.workspaces ?? [];
      setWorkspaces(nextWorkspaces);
      const targetWorkspaceId = workspaceId || nextWorkspaces[0]?.id || '';
      setWorkspaceId(targetWorkspaceId);
      if (targetWorkspaceId) {
        const membersRes = await fetch(`/api/workspaces/${targetWorkspaceId}/members`, { cache: 'no-store' });
        const membersData = await membersRes.json();
        setMembers(membersData.members ?? []);
      } else {
        setMembers([]);
      }
    } catch {
      setWorkspaces([]);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateRole(userId: string, role: string) {
    if (!workspaceId) return;
    const response = await fetch(`/api/workspaces/${workspaceId}/members`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, role }),
    });
    const payload = await response.json();
    setMessage(response.ok ? 'Role updated' : payload.error ?? 'Role update failed');
    await load();
  }

  const selectedWorkspace = workspaces.find(item => item.id === workspaceId) ?? null;

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/settings" />
      <AppShell
        sidebar={(
          <SidebarSection title="Team">
            <SidebarNav
              items={[
                { href: '/settings/team', label: 'Members', active: tab === 'Members', onClick: () => setTab('Members') },
                { href: '/settings/team', label: 'Roles & Permissions', active: tab === 'Roles & Permissions', onClick: () => setTab('Roles & Permissions') },
                { href: '/settings/team', label: 'Activity Log', active: tab === 'Activity Log', onClick: () => setTab('Activity Log') },
                { href: '/settings/team', label: 'SSO & Security', active: tab === 'SSO & Security', onClick: () => setTab('SSO & Security') },
              ]}
            />
          </SidebarSection>
        )}
      >
        <PageHeader
          eyebrow="Team & workspace"
          title="Members and permissions"
          subtitle="Enterprise member management, roles, and workspace access."
        />

        {loading ? <LoadingState label="Loading team" /> : !selectedWorkspace ? (
          <EmptyState title="No workspace selected" body="Create or join a workspace before managing team access." />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <MetricCard label="Total members" value={members.length} />
              <MetricCard label="Admins" value={members.filter(item => item.role === 'admin' || item.role === 'owner').length} />
              <MetricCard label="Developers" value={members.filter(item => item.role === 'member').length} />
              <MetricCard label="Viewers" value={members.filter(item => item.role === 'viewer').length} />
            </div>

            <Card>
              <Tabs tabs={TABS.map(item => ({ key: item, label: item }))} active={tab} onChange={setTab} />
            </Card>

            {tab === 'Members' ? (
              <Card>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 12, marginBottom: 16 }}>
                  <Input value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="Invite email" />
                  <Select value={inviteRole} onChange={event => setInviteRole(event.target.value)}>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </Select>
                  <Button variant="secondary" disabled>Invite</Button>
                </div>
                <div className="os-entity-copy" style={{ marginBottom: 16 }}>Email invitations are not wired on this backend yet. Role updates work for existing members.</div>
                <DataTable
                  columns={['Name', 'Email', 'Role', 'Joined', 'Update']}
                  rows={members.map(member => [
                    member.name ?? member.userId,
                    member.email ?? '—',
                    member.role,
                    new Date(member.joinedAt).toLocaleDateString(),
                    <Select key={`${member.userId}-role`} value={member.role} onChange={event => void updateRole(member.userId, event.target.value)}>
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      <option value="viewer">Viewer</option>
                    </Select>,
                  ])}
                />
              </Card>
            ) : null}

            {tab === 'Roles & Permissions' ? (
              <Card>
                <div className="os-entity-copy">Owner and admin roles can update members. Viewer access is read-only. Member access is for normal project collaboration.</div>
              </Card>
            ) : null}

            {tab === 'Activity Log' ? (
              <Card>
                <div className="os-entity-copy">Workspace audit events are available in the workspace APIs and surface here when audit log UI is expanded.</div>
              </Card>
            ) : null}

            {tab === 'SSO & Security' ? (
              <Card>
                <div className="os-entity-copy">SSO configuration is not present in this repo yet. The page stays responsive and clear instead of showing a broken form.</div>
              </Card>
            ) : null}

            {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}
          </>
        )}
      </AppShell>
    </div>
  );
}
