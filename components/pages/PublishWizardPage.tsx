'use client';

import { useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import {
  AppShell,
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChips,
  Input,
  LoadingState,
  PageHeader,
  SearchBar,
  Select,
  SidebarNav,
  SidebarSection,
  Tabs,
  Textarea,
} from '@/components/os/ui';

const STEPS = ['Manifest', 'Permissions', 'SDK & Tests', 'Screenshots', 'Review', 'Publish'];

type WizardState = {
  name: string;
  slug: string;
  category: string;
  description: string;
  longDescription: string;
  runtime: 'external-app' | 'agentos-app' | 'workspace-app';
  entrypoint: string;
  commands: string;
  deviceTargets: string;
  primitives: string;
  skills: string;
  requiredSecrets: string;
  optionalSecrets: string;
  permissions: string;
  screenshots: string[];
  visibility: 'private' | 'unlisted' | 'public';
};

const DEFAULT_STATE: WizardState = {
  name: '',
  slug: '',
  category: 'Research',
  description: '',
  longDescription: '',
  runtime: 'agentos-app',
  entrypoint: 'agentos://apps/new-app',
  commands: JSON.stringify([{ name: 'run', description: 'Run the app workflow' }], null, 2),
  deviceTargets: 'AgentOS Cloud, AgentOS Desktop',
  primitives: 'mem.*, fs.*, db.*, net.fetch',
  skills: '',
  requiredSecrets: '',
  optionalSecrets: '',
  permissions: 'memory, files, network',
  screenshots: [],
  visibility: 'private',
};

export default function PublishWizardPage({ initialSlug }: { initialSlug?: string | null }) {
  const slug = initialSlug ?? null;
  const [step, setStep] = useState('Manifest');
  const [loading, setLoading] = useState(Boolean(slug));
  const [state, setState] = useState<WizardState>(DEFAULT_STATE);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!slug) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/apps/${slug}`, { cache: 'no-store' });
        const data = await res.json();
        const app = data.app;
        if (!active || !app) return;
        setState({
          name: app.name ?? '',
          slug: app.slug ?? '',
          category: app.category ?? 'Research',
          description: app.description ?? '',
          longDescription: app.longDescription ?? '',
          runtime: app.runtimeType ?? 'external-app',
          entrypoint: app.manifest?.entrypoint ?? '',
          commands: JSON.stringify(app.manifest?.commands ?? [], null, 2),
          deviceTargets: (app.deviceTargets ?? []).join(', '),
          primitives: (app.manifest?.primitives ?? []).join(', '),
          skills: (app.manifest?.skills ?? []).join(', '),
          requiredSecrets: (app.requiredSecrets ?? []).join(', '),
          optionalSecrets: '',
          permissions: (app.permissionsRequired ?? app.manifest?.permissions ?? []).join(', '),
          screenshots: app.screenshots ?? [],
          visibility: app.visibility ?? 'public',
        });
      } catch {
        setMessage('Failed to load app metadata');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [slug]);

  const manifestPreview = useMemo(() => {
    try {
      return JSON.stringify({
        schemaVersion: 'agentos.app.v1',
        version: '1.0.0',
        runtime: state.runtime,
        entrypoint: state.entrypoint,
        primitives: state.primitives.split(',').map(item => item.trim()).filter(Boolean),
        skills: state.skills.split(',').map(item => item.trim()).filter(Boolean),
        permissions: state.permissions.split(',').map(item => item.trim()).filter(Boolean),
        requiredSecrets: state.requiredSecrets.split(',').map(item => item.trim()).filter(Boolean),
        commands: JSON.parse(state.commands || '[]'),
      }, null, 2);
    } catch {
      return 'Invalid command JSON';
    }
  }, [state]);

  async function publish() {
    setSaving(true);
    setMessage('');
    try {
      const commands = JSON.parse(state.commands || '[]');
      const payload = {
        name: state.name,
        slug: state.slug || undefined,
        category: state.category,
        description: state.description,
        longDescription: state.longDescription,
        device_targets: state.deviceTargets.split(',').map(item => item.trim()).filter(Boolean),
        visibility: state.visibility,
        manifest: {
          schemaVersion: 'agentos.app.v1',
          version: '1.0.0',
          runtime: state.runtime,
          entrypoint: state.entrypoint,
          primitives: state.primitives.split(',').map(item => item.trim()).filter(Boolean),
          skills: state.skills.split(',').map(item => item.trim()).filter(Boolean),
          permissions: state.permissions.split(',').map(item => item.trim()).filter(Boolean),
          requiredSecrets: state.requiredSecrets.split(',').map(item => item.trim()).filter(Boolean),
          commands,
        },
        permissionsRequired: state.permissions.split(',').map(item => item.trim()).filter(Boolean),
        requiredSecrets: state.requiredSecrets.split(',').map(item => item.trim()).filter(Boolean),
        screenshots: state.screenshots,
      };
      const res = await fetch(slug ? `/api/apps/${slug}` : '/api/apps', {
        method: slug ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setMessage(res.ok ? `Saved ${data.app?.name ?? state.name}` : data.error ?? 'Save failed');
    } catch {
      setMessage('Manifest validation failed');
    } finally {
      setSaving(false);
    }
  }

  async function uploadScreenshots(files: FileList | null) {
    if (!files || files.length === 0 || !state.slug) return;
    const form = new FormData();
    Array.from(files).forEach(file => form.append('files', file));
    const response = await fetch(`/api/apps/${state.slug}/screenshots`, { method: 'POST', body: form });
    const payload = await response.json();
    if (response.ok) {
      setState(current => ({ ...current, screenshots: payload.screenshots ?? current.screenshots }));
    } else {
      setMessage(payload.error ?? 'Screenshot upload failed');
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/developer" />
      <AppShell
        activePath="/developer"
        sidebar={(
          <>
            <SidebarSection title="Publish">
              <Tabs tabs={STEPS.map(item => ({ key: item, label: item }))} active={step} onChange={setStep} />
            </SidebarSection>
            <SidebarSection title="Routes">
              <SidebarNav
                items={[
                  { href: '/developer', label: 'Developer' },
                  { href: '/publishing/new', label: 'New publish flow', active: !slug },
                  { href: '/appstore', label: 'Appstore' },
                ]}
              />
            </SidebarSection>
          </>
        )}
        aside={(
          <SidebarSection title="Preview">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Badge tone="accent">{state.runtime}</Badge>
              <div className="os-entity-title">{state.name || 'Untitled app'}</div>
              <div className="os-entity-copy">{state.description || 'Short description preview'}</div>
              <Badge tone={state.visibility === 'public' ? 'success' : state.visibility === 'unlisted' ? 'accent' : 'default'}>{state.visibility}</Badge>
            </div>
          </SidebarSection>
        )}
      >
        <PageHeader
          eyebrow="Publish app wizard"
          title={slug ? 'Edit app metadata' : 'Publish App Wizard'}
          subtitle="Turn internal apps and workflows into publishable listings, or refine metadata for SDK-backed apps."
          actions={<Button onClick={() => void publish()}>{saving ? 'Saving...' : 'Publish'}</Button>}
        />

        {loading ? <LoadingState label="Loading app metadata" /> : (
          <>
            {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}

            {step === 'Manifest' ? (
              <Card>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <Input value={state.name} onChange={event => setState(current => ({ ...current, name: event.target.value }))} placeholder="App name" />
                  <Input value={state.slug} onChange={event => setState(current => ({ ...current, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} placeholder="Slug" />
                  <Input value={state.category} onChange={event => setState(current => ({ ...current, category: event.target.value }))} placeholder="Category" />
                  <Select value={state.runtime} onChange={event => setState(current => ({ ...current, runtime: event.target.value as WizardState['runtime'] }))}>
                    <option value="agentos-app">Internal app</option>
                    <option value="external-app">External SDK</option>
                    <option value="workspace-app">Workspace app</option>
                  </Select>
                </div>
                <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                  <Input value={state.entrypoint} onChange={event => setState(current => ({ ...current, entrypoint: event.target.value }))} placeholder="Entrypoint" />
                  <Input value={state.deviceTargets} onChange={event => setState(current => ({ ...current, deviceTargets: event.target.value }))} placeholder="Device targets" />
                  <Input value={state.description} onChange={event => setState(current => ({ ...current, description: event.target.value }))} placeholder="Short description" />
                  <Textarea value={state.longDescription} onChange={event => setState(current => ({ ...current, longDescription: event.target.value }))} placeholder="Long description" />
                  <Textarea value={state.commands} onChange={event => setState(current => ({ ...current, commands: event.target.value }))} placeholder="Commands JSON" />
                </div>
              </Card>
            ) : null}

            {step === 'Permissions' ? (
              <Card>
                <div style={{ display: 'grid', gap: 12 }}>
                  <Input value={state.primitives} onChange={event => setState(current => ({ ...current, primitives: event.target.value }))} placeholder="Primitives" />
                  <Input value={state.skills} onChange={event => setState(current => ({ ...current, skills: event.target.value }))} placeholder="Skills" />
                  <Input value={state.permissions} onChange={event => setState(current => ({ ...current, permissions: event.target.value }))} placeholder="Permissions" />
                  <Input value={state.requiredSecrets} onChange={event => setState(current => ({ ...current, requiredSecrets: event.target.value }))} placeholder="Required secrets" />
                  <Input value={state.optionalSecrets} onChange={event => setState(current => ({ ...current, optionalSecrets: event.target.value }))} placeholder="Optional secrets" />
                </div>
              </Card>
            ) : null}

            {step === 'SDK & Tests' ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Validation</div>
                <SearchBar value={state.entrypoint} readOnly />
                <pre className="os-code-block">{manifestPreview}</pre>
                <div className="os-entity-copy">Internal apps default to private. External SDK apps can edit metadata here after registration.</div>
              </Card>
            ) : null}

            {step === 'Screenshots' ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Screenshots</div>
                <input type="file" multiple accept="image/*" onChange={event => void uploadScreenshots(event.target.files)} />
                {state.slug ? null : <div className="os-entity-copy">Save the app first to upload screenshots.</div>}
                {state.screenshots.length === 0 ? (
                  <EmptyState title="No screenshots yet" body="Upload screenshots after the app has a stable slug." />
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {state.screenshots.map(path => <SearchBar key={path} value={path} readOnly />)}
                  </div>
                )}
              </Card>
            ) : null}

            {step === 'Review' ? (
              <Card>
                <div className="os-entity-title" style={{ marginBottom: 12 }}>Review</div>
                <pre className="os-code-block">{manifestPreview}</pre>
              </Card>
            ) : null}

            {step === 'Publish' ? (
              <Card>
                <div style={{ display: 'grid', gap: 12 }}>
                  <Select value={state.visibility} onChange={event => setState(current => ({ ...current, visibility: event.target.value as WizardState['visibility'] }))}>
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </Select>
                  <div className="os-entity-copy">Internal apps default to private. Change to unlisted or public when you are ready.</div>
                  <Button onClick={() => void publish()}>{saving ? 'Publishing...' : 'Publish'}</Button>
                </div>
              </Card>
            ) : null}
          </>
        )}
      </AppShell>
    </div>
  );
}
