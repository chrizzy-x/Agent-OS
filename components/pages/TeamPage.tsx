'use client';

import { useCallback, useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { summarizeValue } from '@/src/ui/presenters';
import {
  ActivityFeed,
  Button,
  Card,
  DataTable,
  EmptyState,
  Input,
  LoadingState,
  MetricCard,
  PageHeader,
  Select,
  Tabs,
} from '@/components/os/ui';

type Workspace = { id: string; name: string; plan: string };
type Member = { userId: string; name: string | null; email: string | null; role: string; joinedAt: string };
type AuditEntry = { id: string; actorLabel: string | null; action: string; metadata: Record<string, unknown>; createdAt: string };

const TABS = ['Members', 'Roles & Permissions', 'Activity Log', 'SSO & Security'];

export default function TeamPage() {
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<AuditEntry[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [tab, setTab] = useState('Members');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const workspacesRes = await fetch('/api/workspaces', { cache: 'no-store' });
      const workspacesData = await workspacesRes.json();
      const nextWorkspaces = workspacesData.workspaces ?? [];
      const targetWorkspaceId = workspaceId || nextWorkspaces[0]?.id || '';
      setWorkspaces(nextWorkspaces);
      setWorkspaceId(targetWorkspaceId);
      if (!targetWorkspaceId) {
        setMembers([]);
        setActivity([]);
        return;
      }
      const [membersRes, auditRes] = await Promise.all([
        fetch(`/api/workspaces/${targetWorkspaceId}/members`, { cache: 'no-store' }),
        fetch(`/api/workspaces/${targetWorkspaceId}/audit`, { cache: 'no-store' }),
      ]);
      const membersData = await membersRes.json();
      const auditData = await auditRes.json();
      setMembers(membersData.members ?? []);
      setActivity(auditData.audit ?? []);
    } catch {
      setWorkspaces([]);
      setMembers([]);
      setActivity([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function inviteMember() {
    if (!workspaceId || !inviteEmail.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const payload = await response.json();
      setMessage(response.ok ? `Added ${inviteEmail.trim()} as ${inviteRole}.` : payload.message ?? payload.error ?? 'Invite failed');
      if (response.ok) {
        setInviteEmail('');
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function updateRole(userId: string, role: string) {
    if (!workspaceId) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, role }),
      });
      const payload = await response.json();
      setMessage(response.ok ? 'Role updated.' : payload.error ?? 'Role update failed');
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(userId: string) {
    if (!workspaceId) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members?user_id=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
      const payload = await response.json();
      setMessage(response.ok ? 'Member removed.' : payload.error ?? 'Removal failed');
      await load();
    } finally {
      setSaving(false);
    }
  }

  const selectedWorkspace = workspaces.find(item => item.id === workspaceId) ?? null;

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/settings" />
      <WorkspaceShell
        activePath="/settings"
        extraSidebar={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Team</div>
            <Tabs tabs={TABS.map(item => ({ key: item, label: item }))} active={tab} onChange={setTab} />
          </Card>
        )}
      >
        <PageHeader
          eyebrow="Team & workspace"
          title="Members and permissions"
          subtitle="Enterprise member management, roles, audit history, and workspace access."
        />

        {loading ? <LoadingState label="Loading team" /> : !selectedWorkspace ? (
          <EmptyState title="No workspace selected" body="Create or join a workspace before managing team access." />
        ) : (
          <>
            <Card>
              <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', gap: 12, alignItems: 'center' }}>
                <div className="os-sidebar-title">Workspace</div>
                <Select value={workspaceId} onChange={event => setWorkspaceId(event.target.value)}>
                  {workspaces.map(item => <option key={item.id} value={item.id}>{item.name} ({item.plan})</option>)}
                </Select>
              </div>
            </Card>

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
                  <Button variant="secondary" onClick={() => void inviteMember()} disabled={saving || !inviteEmail.trim()}>
                    {saving ? 'Working...' : 'Add member'}
                  </Button>
                </div>
                <DataTable
                  columns={['Name', 'Email', 'Role', 'Joined', 'Update', 'Remove']}
                  rows={members.map(member => [
                    member.name ?? member.userId,
                    member.email ?? '-',
                    member.role,
                    new Date(member.joinedAt).toLocaleDateString(),
                    <Select key={`${member.userId}-role`} value={member.role} onChange={event => void updateRole(member.userId, event.target.value)}>
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      <option value="viewer">Viewer</option>
                      <option value="owner">Owner</option>
                    </Select>,
                    <Button key={`${member.userId}-remove`} variant="ghost" onClick={() => void removeMember(member.userId)} disabled={saving}>Remove</Button>,
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
              activity.length === 0 ? <EmptyState title="No workspace activity yet" body="Workspace membership, plan, and security events appear here as they happen." /> : (
                <Card>
                  <ActivityFeed items={activity.map(item => ({
                    id: item.id,
                    title: item.action,
                    subtitle: item.actorLabel || summarizeValue(item.metadata, 80),
                    time: new Date(item.createdAt).toLocaleString(),
                  }))} />
                </Card>
              )
            ) : null}

            {tab === 'SSO & Security' ? (
              <Card>
                <div className="os-entity-copy" style={{ marginBottom: 12 }}>Workspace roles are active today. Enterprise SAML and SCIM rollout is handled through the billing and support flow.</div>
                <Button href="/billing" variant="secondary">Request enterprise access</Button>
              </Card>
            ) : null}

            {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}
          </>
        )}
      </WorkspaceShell>
    </div>
  );
}
