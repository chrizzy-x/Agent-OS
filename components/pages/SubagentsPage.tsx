'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { useApplicationShell } from '@/components/os/application-shell';
import { fetchBrowserSession, fetchWithBrowserSession } from '@/src/auth/browser-session';
import {
  Button,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
  Tabs,
  Textarea,
} from '@/components/os/ui';

type Subagent = {
  id: string;
  name: string;
  description: string | null;
  instructions: string;
  status: string;
  workspaceId: string;
  visibility: 'private' | 'workspace' | 'public';
  exposedCapabilities?: string[];
};

type InstalledSkill = {
  id: string;
  name: string;
  slug: string;
  description: string;
};

type SubagentsPageProps = {
  activePath?: string;
  basePath?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
};

function visibilityLabel(value: Subagent['visibility']): string {
  if (value === 'private') return 'Incognito';
  if (value === 'workspace') return 'Workflow';
  return 'Public';
}

export default function SubagentsPage({
  activePath = '/subagents',
  basePath = '/subagents',
  eyebrow = 'Subagents',
  title = 'Subagents',
  subtitle = 'Incognito workforce: roles, memory stance, skills, permissions, and operating status.',
}: SubagentsPageProps) {
  const shell = useApplicationShell();
  const [loading, setLoading] = useState(true);
  const [subagents, setSubagents] = useState<Subagent[]>([]);
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([]);
  const [view, setView] = useState<'grid' | 'org'>('grid');
  const [draft, setDraft] = useState({
    workspaceId: '',
    name: '',
    description: '',
    instructions: '',
    visibility: 'private' as 'private' | 'workspace' | 'public',
    exposedCapabilities: '',
    attachedSkills: [] as string[],
  });
  const [message, setMessage] = useState('');
  const [savingSubagentId, setSavingSubagentId] = useState('');

  function skillToken(slug: string): string {
    return `skill:${slug}`;
  }

  function manualCapabilities(values: string[] = []): string[] {
    return values.filter(item => !item.startsWith('skill:'));
  }

  function attachedSkillLabels(values: string[] = []): string {
    const labels = values
      .filter(item => item.startsWith('skill:'))
      .map(item => item.slice('skill:'.length))
      .map(slug => installedSkills.find(skill => skill.slug === slug)?.name ?? slug);
    return labels.length ? labels.join(', ') : 'None assigned';
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const session = await fetchBrowserSession().catch(() => null);
      if (!session) {
        setSubagents([]);
        setInstalledSkills([]);
        return;
      }
      const [subagentsRes, workspacesRes, skillsRes] = await Promise.all([
        fetchWithBrowserSession(`/api/subagents${shell.activeWorkspaceId ? `?workspaceId=${encodeURIComponent(shell.activeWorkspaceId)}` : ''}`, { cache: 'no-store' }),
        fetchWithBrowserSession('/api/workspaces', { cache: 'no-store' }),
        fetchWithBrowserSession('/api/skills/installed', { cache: 'no-store' }),
      ]);
      const subagentsData = await subagentsRes.response.json();
      const workspacesData = await workspacesRes.response.json();
      const skillsData = await skillsRes.response.json();
      setSubagents(subagentsData.subagents ?? []);
      setInstalledSkills((skillsData.installed_skills ?? []).map((entry: { skill?: Record<string, unknown> }) => ({
        id: String(entry.skill?.id ?? ''),
        name: String(entry.skill?.name ?? 'Skill'),
        slug: String(entry.skill?.slug ?? entry.skill?.id ?? ''),
        description: String(entry.skill?.description ?? 'Installed skill'),
      })).filter((skill: InstalledSkill) => skill.id && skill.slug));
      setDraft(current => ({ ...current, workspaceId: shell.activeWorkspaceId || current.workspaceId || workspacesData.workspaces?.[0]?.id || '' }));
    } catch {
      setSubagents([]);
    } finally {
      setLoading(false);
    }
  }, [shell.activeWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createSubagent() {
    if (!draft.workspaceId || !draft.name.trim()) return;
    const response = await fetch('/api/subagents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...draft,
        exposedCapabilities: [
          ...draft.exposedCapabilities.split(',').map(item => item.trim()).filter(Boolean),
          ...draft.attachedSkills.map(skillToken),
        ],
      }),
    });
    const payload = await response.json();
    setMessage(response.ok ? 'Subagent created' : payload.error ?? 'Create failed');
    if (response.ok) {
      setDraft(current => ({ ...current, name: '', description: '', instructions: '', exposedCapabilities: '', attachedSkills: [] }));
      await load();
    }
  }

  async function toggleDraftSkill(slug: string) {
    setDraft(current => ({
      ...current,
      attachedSkills: current.attachedSkills.includes(slug)
        ? current.attachedSkills.filter(item => item !== slug)
        : [...current.attachedSkills, slug],
    }));
  }

  async function toggleSubagentSkill(subagent: Subagent, slug: string) {
    const token = skillToken(slug);
    const current = subagent.exposedCapabilities ?? [];
    const next = current.includes(token)
      ? current.filter(item => item !== token)
      : [...current, token];
    setSavingSubagentId(subagent.id);
    setMessage('');
    try {
      const response = await fetch(`/api/subagents/${encodeURIComponent(subagent.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exposedCapabilities: next }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? 'Skill attachments updated.' : payload.error ?? payload.message ?? 'Skill attachment update failed.');
      if (response.ok) await load();
    } finally {
      setSavingSubagentId('');
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath={activePath} />
      <WorkspaceShell activePath={activePath}>
        <PageHeader
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          actions={(
            <Button
              onClick={() => void createSubagent()}
              disabled={!draft.workspaceId || !draft.name.trim()}
              disabledReason={!draft.workspaceId ? 'Select a workspace before creating a subagent.' : !draft.name.trim() ? 'Enter a subagent name before creating.' : undefined}
            >
              Create subagent
            </Button>
          )}
        />

        <div style={{ display: 'grid', gap: 10 }}>
          <Input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="Subagent name" />
          <Input value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} placeholder="Description" />
          <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', gap: 10 }}>
            <select
              value={draft.visibility}
              onChange={event => setDraft(current => ({ ...current, visibility: event.target.value as 'private' | 'workspace' | 'public' }))}
              style={{ minHeight: 34, borderRadius: 7, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', color: 'inherit', padding: '0 10px' }}
            >
              <option value="private">Incognito</option>
              <option value="workspace">Workflow</option>
              <option value="public">Public</option>
            </select>
            <Input
              value={draft.exposedCapabilities}
              onChange={event => setDraft(current => ({ ...current, exposedCapabilities: event.target.value }))}
              placeholder="Manual capabilities, comma-separated"
            />
          </div>
          <div className="os-drawer-stack">
            <div className="os-entity-title">Attach installed skills</div>
            {installedSkills.length ? (
              <div className="os-inline-actions">
                {installedSkills.map(skill => (
                  <label key={skill.id} className="os-inline-actions">
                    <input
                      type="checkbox"
                      checked={draft.attachedSkills.includes(skill.slug)}
                      onChange={() => void toggleDraftSkill(skill.slug)}
                    />
                    {skill.name}
                  </label>
                ))}
              </div>
            ) : (
              <div className="os-entity-copy">Install a skill before attaching one to a subagent.</div>
            )}
          </div>
          <Textarea value={draft.instructions} onChange={event => setDraft(current => ({ ...current, instructions: event.target.value }))} placeholder="Instructions" />
          <label className="os-inline-actions">
            <input
              type="checkbox"
              checked={draft.visibility === 'private'}
              onChange={event => setDraft(current => ({ ...current, visibility: event.target.checked ? 'private' : 'workspace' }))}
            />
            Incognito Mode
          </label>
        </div>

        {loading ? <LoadingState label="Loading subagents" /> : subagents.length === 0 ? (
          <EmptyState title="No incognito subagents yet" body="Create a focused subagent for research, operations, or testing." action={<Button href="/studio?mode=nl&prompt=Create%20an%20incognito%20subagent">Create with Super AgentOS</Button>} />
        ) : (
          <div className="os-drawer-stack">
            <Tabs
              tabs={[
                { key: 'grid', label: 'Grid' },
                { key: 'org', label: 'Organization Chart' },
              ]}
              active={view}
              onChange={key => setView(key as 'grid' | 'org')}
            />
            {view === 'grid' ? (
              <div className="subagent-grid">
                {subagents.map(subagent => (
                  <article key={subagent.id} className="subagent-card">
                    <div className="os-inline-actions">
                      <div>
                        <div className="os-entity-title">{subagent.name}</div>
                        <div className="os-entity-copy">{subagent.description ?? 'Incognito subagent'}</div>
                      </div>
                      <span className="os-status-pill">{subagent.status}</span>
                    </div>
                    <dl className="subagent-facts">
                      <div><dt>Type</dt><dd>{visibilityLabel(subagent.visibility)} subagent</dd></div>
                      <div><dt>Memory</dt><dd>Workspace scoped</dd></div>
                      <div><dt>Manual capabilities</dt><dd>{manualCapabilities(subagent.exposedCapabilities).join(', ') || 'None assigned'}</dd></div>
                      <div><dt>Attached skills</dt><dd>{attachedSkillLabels(subagent.exposedCapabilities)}</dd></div>
                      <div><dt>Permissions</dt><dd>{subagent.visibility === 'private' ? 'Incognito Mode only' : `${visibilityLabel(subagent.visibility)} visible`}</dd></div>
                    </dl>
                    {installedSkills.length ? (
                      <div className="os-drawer-stack">
                        <div className="os-entity-copy">Skill attachments</div>
                        <div className="os-inline-actions">
                          {installedSkills.map(skill => (
                            <label key={`${subagent.id}-${skill.id}`} className="os-inline-actions">
                              <input
                                type="checkbox"
                                checked={(subagent.exposedCapabilities ?? []).includes(skillToken(skill.slug))}
                                disabled={savingSubagentId === subagent.id}
                                onChange={() => void toggleSubagentSkill(subagent, skill.slug)}
                              />
                              {skill.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <Link href={`${basePath}/${subagent.id}`} className="btn-ghost">Open</Link>
                  </article>
                ))}
              </div>
            ) : (
              <div className="subagent-org">
                <div className="subagent-org-root">Workspace Lead</div>
                <div className="subagent-org-grid">
                  {subagents.map(subagent => (
                    <Link key={subagent.id} href={`${basePath}/${subagent.id}`} className="subagent-org-node">
                      <strong>{subagent.name}</strong>
                      <span>{subagent.description ?? subagent.visibility}</span>
                      <small>{subagent.status}</small>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {message ? <div className="os-entity-copy">{message}</div> : null}
      </WorkspaceShell>
    </div>
  );
}
