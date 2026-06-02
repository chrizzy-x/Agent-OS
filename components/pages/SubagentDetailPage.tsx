'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Nav from '@/components/Nav';
import {
  ActivityFeed,
  AppShell,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  PermissionCard,
  SearchBar,
  SidebarNav,
  SidebarSection,
  Tabs,
  Textarea,
} from '@/components/os/ui';

type SubagentPayload = {
  subagent: {
    id: string;
    name: string;
    description: string | null;
    instructions: string;
    status: string;
  };
  profile: {
    model: string;
    temperature: number;
    behavior: string;
    allowedTools: string[];
    permissions: Record<string, boolean>;
  };
  installedSkills: Array<{ skill?: { name?: string; slug?: string; category?: string } }>;
  vaultAssignments: Array<{ secret?: { name?: string; masked_value?: string } }>;
  activity: Array<{ primitive: string; operation: string; success: boolean; created_at: string }>;
};

const TABS = ['Configure', 'Instructions', 'Memory', 'Skills', 'Tools', 'Permissions', 'Activity'];

export default function SubagentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<SubagentPayload | null>(null);
  const [tab, setTab] = useState('Configure');
  const [command, setCommand] = useState('');
  const [result, setResult] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/subagents/${id}`, { cache: 'no-store' });
        const data = await res.json();
        if (active) setPayload(data);
      } catch {
        if (active) setPayload(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    if (id) void load();
    return () => { active = false; };
  }, [id]);

  const subagent = payload?.subagent ?? null;
  const skillNames = useMemo(
    () => payload?.installedSkills.map(item => item.skill?.name || item.skill?.slug || 'Skill') ?? [],
    [payload],
  );

  async function save() {
    if (!subagent) return;
    setSaving(true);
    await fetch(`/api/subagents/${subagent.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subagent),
    });
    setSaving(false);
  }

  async function testRun() {
    if (!subagent || !command.trim()) return;
    const res = await fetch(`/api/subagents/${subagent.id}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    const data = await res.json();
    setResult(JSON.stringify(data.result ?? data, null, 2));
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/subagents" />
      <AppShell
        sidebar={(
          <SidebarSection title="Agents">
            <SidebarNav
              items={[
                { href: '/subagents', label: 'All subagents' },
                { href: `/subagents/${id}`, label: 'Agent details', active: true },
                { href: '/vault', label: 'Vault' },
              ]}
            />
          </SidebarSection>
        )}
        aside={(
          <SidebarSection title="Run test">
            <SearchBar value={command} onChange={event => setCommand(event.target.value)} placeholder="Test instruction" />
            <Button onClick={() => void testRun()}>Run</Button>
            {result ? <pre className="os-code-block">{result}</pre> : null}
          </SidebarSection>
        )}
      >
        {loading ? <LoadingState label="Loading agent" /> : !payload || !subagent ? (
          <EmptyState title="Subagent not found" body="This private agent is unavailable or you do not have access." />
        ) : (
          <>
            <PageHeader
              eyebrow="Agent details"
              title={subagent.name}
              subtitle={subagent.description ?? 'Private agent'}
              actions={(
                <>
                  <Badge tone="success">{subagent.status}</Badge>
                  <Button variant="secondary" onClick={() => void save()}>{saving ? 'Saving...' : 'Save'}</Button>
                  <Button onClick={() => void testRun()}>Run test</Button>
                </>
              )}
            />
            <Card>
              <Tabs tabs={TABS.map(item => ({ key: item, label: item }))} active={tab} onChange={setTab} />
            </Card>

            {tab === 'Configure' ? (
              <Card>
                <div className="os-entity-copy">Model: {payload.profile.model} · Temperature: {payload.profile.temperature} · Behavior: {payload.profile.behavior}</div>
              </Card>
            ) : null}

            {tab === 'Instructions' ? (
              <Card>
                <Textarea value={subagent.instructions} onChange={event => setPayload(current => current ? { ...current, subagent: { ...current.subagent, instructions: event.target.value } } : current)} />
              </Card>
            ) : null}

            {tab === 'Memory' ? (
              <Card>
                <div className="os-entity-copy">Pinned facts, learned preferences, and session memory surfaces are ready for this agent profile.</div>
              </Card>
            ) : null}

            {tab === 'Skills' ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Installed skills</div>
                <div className="os-entity-copy">{skillNames.join(' • ') || 'No installed skills'}</div>
              </Card>
            ) : null}

            {tab === 'Tools' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {payload.profile.allowedTools.map(tool => (
                  <PermissionCard key={tool} title={tool} description="Allowed MCP or primitive tool for this private agent." required />
                ))}
              </div>
            ) : null}

            {tab === 'Permissions' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {Object.entries(payload.profile.permissions).map(([key, value]) => (
                  <PermissionCard key={key} title={key} description="Workspace-scoped permission toggle." required={value} />
                ))}
                {payload.vaultAssignments.map((item, index) => (
                  <PermissionCard key={`${item.secret?.name ?? 'secret'}-${index}`} title={item.secret?.name ?? 'Vault secret'} description={item.secret?.masked_value ?? 'Assigned from Vault'} required />
                ))}
              </div>
            ) : null}

            {tab === 'Activity' ? (
              <ActivityFeed
                items={payload.activity.map((item, index) => ({
                  id: `${item.operation}-${index}`,
                  title: item.operation,
                  subtitle: item.primitive,
                  status: item.success ? 'success' : 'error',
                  time: new Date(item.created_at).toLocaleString(),
                }))}
              />
            ) : null}
          </>
        )}
      </AppShell>
    </div>
  );
}
