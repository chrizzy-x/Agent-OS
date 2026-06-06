'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import SurfaceShell from '@/components/os/surface-shell';
import { summarizeSkillCapability } from '@/src/ui/presenters';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PermissionCard,
  SearchBar,
  Tabs,
} from '@/components/os/ui';

export type SkillDetailRecord = {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  long_description?: string;
  total_installs: number;
  rating: number;
  review_count: number;
  capabilities: Array<{ name: string; description: string; params?: Record<string, string>; returns?: string }>;
  permissions_required?: string[];
  required_secrets?: string[];
  tags: string[];
  verified: boolean;
};

const TABS = ['Overview', 'Permissions', 'Examples', 'Changelog'];

export default function SkillDetailPage({ initialSkill = null }: { initialSkill?: SkillDetailRecord | null }) {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const [tab, setTab] = useState('Overview');
  const [skill, setSkill] = useState<SkillDetailRecord | null>(initialSkill);
  const [loading, setLoading] = useState(initialSkill === null);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/skills/${slug}`, { cache: 'no-store' });
        const data = await res.json();
        if (active) setSkill(data.skill ?? null);
      } catch {
        if (active) setSkill(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    if (!slug) {
      setSkill(null);
      setLoading(false);
      return () => { active = false; };
    }
    if (initialSkill && initialSkill.slug === slug) {
      setSkill(initialSkill);
      setLoading(false);
      return () => { active = false; };
    }
    void load();
    return () => { active = false; };
  }, [initialSkill, slug]);

  const examples = useMemo(
    () => skill?.capabilities.map(capability => `Use ${skill.name} to ${capability.description.toLowerCase()}.`).slice(0, 3) ?? [],
    [skill],
  );

  async function install() {
    if (!skill) return;
    setInstalling(true);
    setMessage('');
    try {
      const response = await fetch('/api/skills/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_id: skill.id }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error ?? 'Install failed');
        return;
      }
      setMessage('Installed');
    } catch {
      setMessage('Install failed');
    } finally {
      setInstalling(false);
    }
  }

  return (
    <SurfaceShell
        activePath="/skills"
        title={skill?.name ?? 'Skill'}
        subtitle={skill ? (skill.long_description || skill.description) : undefined}
        actions={skill ? (
          <>
            <Badge tone="accent">{skill.category}</Badge>
            {skill.verified ? <Badge tone="success">Verified</Badge> : null}
            <Button onClick={() => void install()}>{installing ? 'Installing...' : 'Install'}</Button>
          </>
        ) : undefined}
      >
        {loading ? <LoadingState label="Loading skill" /> : !skill ? (
          <EmptyState title="Skill not found" body="This skill may be unpublished or unavailable." action={<Button href="/skills">Back to marketplace</Button>} />
        ) : (
          <>
            <Card>
              <div className="os-inline-actions" style={{ marginBottom: 12 }}>
                <Badge tone="default">{skill.total_installs.toLocaleString()} installs</Badge>
                <Badge tone="default">{skill.rating.toFixed(1)} rating</Badge>
              </div>
              <Tabs tabs={TABS.map(item => ({ key: item, label: item }))} active={tab} onChange={setTab} />
            </Card>

            {tab === 'Overview' ? (
              <div style={{ display: 'grid', gap: 16 }}>
                <Card>
                  <div className="os-entity-title" style={{ marginBottom: 12 }}>Capabilities</div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {skill.capabilities.map(capability => (
                      <Card key={capability.name}>
                        <div className="os-entity-title">{capability.name}</div>
                        <div className="os-entity-copy">{capability.description}</div>
                        <div className="os-entity-copy">{summarizeSkillCapability(capability.params, capability.returns)}</div>
                        {capability.params ? <div className="os-entity-meta">{Object.keys(capability.params).join(', ') || 'No parameter names'}</div> : null}
                      </Card>
                    ))}
                  </div>
                </Card>
              </div>
            ) : null}

            {tab === 'Permissions' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {(skill.permissions_required && skill.permissions_required.length > 0 ? skill.permissions_required : ['No special permissions']).map(permission => (
                  <PermissionCard key={permission} title={permission} description="Review this access before you install the skill." required={permission !== 'No special permissions'} />
                ))}
                {(skill.required_secrets && skill.required_secrets.length > 0 ? skill.required_secrets : []).map(secret => (
                  <PermissionCard key={secret} title={secret} description="Add this secret in Vault before the skill runs." required />
                ))}
              </div>
            ) : null}

            {tab === 'Examples' ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Example prompts</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {examples.map(example => <SearchBar key={example} value={example} readOnly />)}
                </div>
              </Card>
            ) : null}

            {tab === 'Changelog' ? <EmptyState title="No changelog yet" body="Version notes have not been published yet." /> : null}
            {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}
          </>
        )}
    </SurfaceShell>
  );
}
