'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import {
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
} from '@/components/os/ui';

type Skill = {
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

export default function SkillDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug ?? '';
  const [tab, setTab] = useState('Overview');
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
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
    if (slug) void load();
    return () => { active = false; };
  }, [slug]);

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
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/skills" />
      <AppShell
        activePath="/skills"
        sidebar={(
          <SidebarSection title="Marketplace">
            <SidebarNav
              items={[
                { href: '/skills', label: 'Back to marketplace' },
                { href: `/skills/${slug}`, label: 'Skill details', active: true },
                { href: '/vault', label: 'Vault' },
                { href: '/developer', label: 'Developer' },
              ]}
            />
          </SidebarSection>
        )}
        aside={(
          <SidebarSection title="Quick facts">
            {skill ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Badge tone="accent">{skill.category}</Badge>
                {skill.verified ? <Badge tone="success">Verified</Badge> : null}
                <div className="os-entity-copy">{skill.total_installs.toLocaleString()} installs</div>
                <div className="os-entity-copy">{skill.rating.toFixed(1)} rating</div>
              </div>
            ) : null}
          </SidebarSection>
        )}
      >
        {loading ? <LoadingState label="Loading skill" /> : !skill ? (
          <EmptyState title="Skill not found" body="This skill may be unpublished or unavailable." action={<Button href="/skills">Back to marketplace</Button>} />
        ) : (
          <>
            <PageHeader
              eyebrow="Skill details"
              title={skill.name}
              subtitle={skill.long_description || skill.description}
              actions={(
                <>
                  <Badge tone="accent">{skill.category}</Badge>
                  <Button onClick={() => void install()}>{installing ? 'Installing...' : 'Install'}</Button>
                </>
              )}
            />
            <Card>
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
                        {capability.params ? <pre className="os-code-block">{JSON.stringify(capability.params, null, 2)}</pre> : null}
                      </Card>
                    ))}
                  </div>
                </Card>
              </div>
            ) : null}

            {tab === 'Permissions' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {(skill.permissions_required && skill.permissions_required.length > 0 ? skill.permissions_required : ['No special permissions']).map(permission => (
                  <PermissionCard key={permission} title={permission} description="Review access scope before installing this skill." required={permission !== 'No special permissions'} />
                ))}
                {(skill.required_secrets && skill.required_secrets.length > 0 ? skill.required_secrets : []).map(secret => (
                  <PermissionCard key={secret} title={secret} description="Assign from Vault before the skill runs." required />
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

            {tab === 'Changelog' ? <EmptyState title="No changelog yet" body="Install, permissions, and capability metadata are available now. Version notes have not been published yet." /> : null}
            {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}
          </>
        )}
      </AppShell>
    </div>
  );
}
