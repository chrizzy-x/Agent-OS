'use client';

import { useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { resolveBrowserAccessState } from '@/src/auth/browser-access';
import { fetchBrowserSessionState, type BrowserSession, type BrowserSessionAuthState } from '@/src/auth/browser-session';
import {
  Badge,
  Button,
  Card,
  ConfirmationDialog,
  EmptyState,
  FilterChips,
  Input,
  LoadingState,
  PageHeader,
  SearchBar,
  Select,
  Tabs,
  Textarea,
} from '@/components/os/ui';

const STEPS = ['Build App', 'Configure App', 'Store Listing', 'Publish'];

type WizardState = {
  name: string;
  slug: string;
  category: string;
  description: string;
  longDescription: string;
  logoUrl: string;
  bannerUrl: string;
  videoUrl: string;
  version: string;
  developer: string;
  websiteUrl: string;
  documentationUrl: string;
  supportUrl: string;
  privacyPolicyUrl: string;
  termsUrl: string;
  appUrl: string;
  repositoryUrl: string;
  androidBuildUrl: string;
  iosBuildUrl: string;
  desktopBuildUrl: string;
  pricing: string;
  releaseNotes: string;
  changelog: string;
  tags: string;
  features: string;
  platforms: string;
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
  gallery: string;
  visibility: 'private' | 'workspace' | 'public';
};

const DEFAULT_STATE: WizardState = {
  name: '',
  slug: '',
  category: 'Research',
  description: '',
  longDescription: '',
  logoUrl: '',
  bannerUrl: '',
  videoUrl: '',
  version: '1.0.0',
  developer: '',
  websiteUrl: '',
  documentationUrl: '',
  supportUrl: '',
  privacyPolicyUrl: '',
  termsUrl: '',
  appUrl: '',
  repositoryUrl: '',
  androidBuildUrl: '',
  iosBuildUrl: '',
  desktopBuildUrl: '',
  pricing: 'Free',
  releaseNotes: '',
  changelog: '',
  tags: '',
  features: '',
  platforms: 'Web, AgentOS Cloud',
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
  gallery: '',
  visibility: 'private',
};

export default function PublishWizardPage({ initialSlug }: { initialSlug?: string | null }) {
  const slug = initialSlug ?? null;
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [sessionLoading, setSessionLoading] = useState(true);
  const [step, setStep] = useState(STEPS[0]);
  const [loading, setLoading] = useState(Boolean(slug));
  const [state, setState] = useState<WizardState>(DEFAULT_STATE);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDestructive, setPendingDestructive] = useState<null | { type: 'unpublish' | 'delete-screenshot' | 'delete-gallery'; path?: string }>(null);
  const canPublishApp = session?.capabilities?.includes('create_app') === true;
  const canPublishLive = session?.capabilities?.includes('publish_app') === true;
  const accessState = resolveBrowserAccessState(session, sessionLoading, 'create_app', authState);
  const reviewBackendReady = false;

  useEffect(() => {
    let active = true;
    void fetchBrowserSessionState()
      .then(current => {
        if (!active) return;
        setSession(current.session);
        setAuthState(current.state);
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setAuthState('signed_out');
      })
      .finally(() => { if (active) setSessionLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!slug || !canPublishApp) {
        if (active) setLoading(false);
        return;
      }
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
          logoUrl: app.logoUrl ?? '',
          bannerUrl: app.bannerUrl ?? '',
          videoUrl: app.videoUrl ?? '',
          version: app.manifest?.version ?? '1.0.0',
          developer: app.publisherName ?? '',
          websiteUrl: app.websiteUrl ?? '',
          documentationUrl: app.documentationUrl ?? '',
          supportUrl: app.supportUrl ?? '',
          privacyPolicyUrl: app.privacyPolicyUrl ?? '',
          termsUrl: app.termsUrl ?? '',
          appUrl: app.appUrl ?? app.manifest?.distribution?.webUrl ?? '',
          repositoryUrl: app.repositoryUrl ?? '',
          androidBuildUrl: app.manifest?.distribution?.androidUrl ?? '',
          iosBuildUrl: app.manifest?.distribution?.iosUrl ?? '',
          desktopBuildUrl: app.manifest?.distribution?.desktopUrl ?? '',
          pricing: typeof app.pricing?.model === 'string' ? app.pricing.model : 'Free',
          releaseNotes: app.releaseNotes ?? '',
          changelog: (app.changelog ?? []).join('\n'),
          tags: (app.tags ?? []).join(', '),
          features: (app.features ?? []).join('\n'),
          platforms: (app.platforms ?? []).join(', '),
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
          gallery: (app.gallery ?? []).join('\n'),
          visibility: app.visibility ?? 'public',
        });
      } catch {
        setMessage('Failed to load app metadata');
      } finally {
        if (active) setLoading(false);
      }
    }
    if (!sessionLoading) {
      void load();
    }
    return () => { active = false; };
  }, [canPublishApp, sessionLoading, slug]);

  const manifestPreview = useMemo(() => {
    try {
      return JSON.stringify({
        schemaVersion: 'agentos.app.v1',
        version: state.version,
        runtime: state.runtime,
        entrypoint: state.entrypoint,
        distribution: {
          webUrl: state.appUrl || null,
          androidUrl: state.androidBuildUrl || null,
          iosUrl: state.iosBuildUrl || null,
          desktopUrl: state.desktopBuildUrl || null,
          repositoryUrl: state.repositoryUrl || null,
        },
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

  const draftRequiredFields = useMemo(() => [
    state.name.trim() ? null : 'App name',
    state.slug.trim() ? null : 'Slug',
    state.category.trim() ? null : 'Category',
    state.description.trim() ? null : 'Short description',
  ].filter(Boolean) as string[], [state]);

  const requiredPublishingFields = useMemo(() => [
    ...draftRequiredFields,
    state.longDescription.trim() ? null : 'Full description',
    state.logoUrl.trim() ? null : 'Icon URL',
    state.version.trim() ? null : 'Version',
    state.entrypoint.trim() ? null : 'Entrypoint',
    state.permissions.trim() ? null : 'Permissions',
  ].filter(Boolean) as string[], [draftRequiredFields, state]);

  const draftBlockedReason = draftRequiredFields.length
    ? `Missing: ${draftRequiredFields.join(', ')}`
    : undefined;
  const publishBlockedReason = requiredPublishingFields.length
    ? `Missing: ${requiredPublishingFields.join(', ')}`
    : undefined;

  const reviewBackendMessage = 'Automated reviewer decisions are not connected yet. Submit Review records a submitted listing state for enterprise review; approval must happen outside this UI.';

  const galleryItems = useMemo(
    () => state.gallery.split('\n').map(item => item.trim()).filter(Boolean),
    [state.gallery],
  );

  const mediaValidation = useMemo(() => {
    const missing = [
      state.logoUrl ? null : 'Icon',
      state.bannerUrl ? null : 'Banner',
      state.screenshots.length || galleryItems.length ? null : 'Screenshots or gallery',
      state.videoUrl ? null : 'Video optional',
    ].filter(Boolean);
    return missing.length ? `${missing.join(', ')} needed for a complete media set.` : 'Media validates against the store preview.';
  }, [galleryItems.length, state.bannerUrl, state.logoUrl, state.screenshots.length, state.videoUrl]);

  async function publish(publishState?: 'draft' | 'submitted' | 'published' | 'update_pending' | 'unpublished') {
    setSaving(true);
    setMessage('');
    try {
      const commands = JSON.parse(state.commands || '[]');
      const effectiveVisibility = publishState === 'published'
        ? 'public'
        : publishState === 'unpublished'
          ? 'private'
          : state.visibility;
      const payload = {
        name: state.name,
        slug: state.slug || undefined,
        category: state.category,
        description: state.description,
        longDescription: state.longDescription,
        logoUrl: state.logoUrl || undefined,
        bannerUrl: state.bannerUrl || undefined,
        videoUrl: state.videoUrl || undefined,
        version: state.version,
        websiteUrl: state.websiteUrl || undefined,
        documentationUrl: state.documentationUrl || undefined,
        supportUrl: state.supportUrl || undefined,
        privacyPolicyUrl: state.privacyPolicyUrl || undefined,
        termsUrl: state.termsUrl || undefined,
        appUrl: state.appUrl || undefined,
        repositoryUrl: state.repositoryUrl || undefined,
        pricing: { model: state.pricing },
        releaseNotes: state.releaseNotes || undefined,
        changelog: state.changelog.split('\n').map(item => item.trim()).filter(Boolean),
        tags: state.tags.split(',').map(item => item.trim()).filter(Boolean),
        keywords: state.tags.split(',').map(item => item.trim()).filter(Boolean),
        features: state.features.split('\n').map(item => item.trim()).filter(Boolean),
        platforms: state.platforms.split(',').map(item => item.trim()).filter(Boolean),
        publisherName: state.developer || undefined,
        device_targets: state.deviceTargets.split(',').map(item => item.trim()).filter(Boolean),
        visibility: effectiveVisibility,
        publish_state: publishState,
        manifest: {
          schemaVersion: 'agentos.app.v1',
          version: state.version,
          runtime: state.runtime,
          entrypoint: state.entrypoint,
          distribution: {
            webUrl: state.appUrl || null,
            androidUrl: state.androidBuildUrl || null,
            iosUrl: state.iosBuildUrl || null,
            desktopUrl: state.desktopBuildUrl || null,
            repositoryUrl: state.repositoryUrl || null,
          },
          primitives: state.primitives.split(',').map(item => item.trim()).filter(Boolean),
          skills: state.skills.split(',').map(item => item.trim()).filter(Boolean),
          permissions: state.permissions.split(',').map(item => item.trim()).filter(Boolean),
          requiredSecrets: state.requiredSecrets.split(',').map(item => item.trim()).filter(Boolean),
          commands,
        },
        permissionsRequired: state.permissions.split(',').map(item => item.trim()).filter(Boolean),
        requiredSecrets: state.requiredSecrets.split(',').map(item => item.trim()).filter(Boolean),
        screenshots: state.screenshots,
        gallery: state.gallery.split('\n').map(item => item.trim()).filter(Boolean),
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

  async function deleteScreenshot(path: string) {
    if (!state.slug) return;
    const response = await fetch(`/api/apps/${state.slug}/screenshots?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      setState(current => ({ ...current, screenshots: payload.screenshots ?? current.screenshots.filter(item => item !== path) }));
    } else {
      setMessage(payload.error ?? 'Screenshot delete failed');
    }
  }

  function moveScreenshot(path: string, direction: -1 | 1) {
    setState(current => {
      const index = current.screenshots.indexOf(path);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.screenshots.length) return current;
      const screenshots = [...current.screenshots];
      const [item] = screenshots.splice(index, 1);
      screenshots.splice(nextIndex, 0, item);
      return { ...current, screenshots };
    });
  }

  function moveGalleryItem(path: string, direction: -1 | 1) {
    setState(current => {
      const gallery = current.gallery.split('\n').map(item => item.trim()).filter(Boolean);
      const index = gallery.indexOf(path);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= gallery.length) return current;
      const [item] = gallery.splice(index, 1);
      gallery.splice(nextIndex, 0, item);
      return { ...current, gallery: gallery.join('\n') };
    });
  }

  function deleteGalleryItem(path: string) {
    setState(current => ({
      ...current,
      gallery: current.gallery.split('\n').map(item => item.trim()).filter(Boolean).filter(item => item !== path).join('\n'),
    }));
  }

  async function confirmDestructive() {
    const action = pendingDestructive;
    if (!action) return;
    if (action.type === 'unpublish') {
      await publish('unpublished');
    } else if (action.type === 'delete-screenshot' && action.path) {
      await deleteScreenshot(action.path);
    } else if (action.type === 'delete-gallery' && action.path) {
      deleteGalleryItem(action.path);
    }
    setPendingDestructive(null);
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/developer" />
      <WorkspaceShell
        activePath="/developer"
        extraSidebar={accessState === 'allowed' ? (
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Publish</div>
            <Tabs tabs={STEPS.map(item => ({ key: item, label: item }))} active={step} onChange={setStep} />
          </Card>
        ) : undefined}
        aside={accessState === 'allowed' ? (
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Preview</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Badge tone="accent">{state.runtime}</Badge>
              <div className="os-entity-title">{state.name || 'Untitled app'}</div>
              <div className="os-entity-copy">{state.description || 'Short description preview'}</div>
              <Badge tone={state.visibility === 'public' ? 'success' : state.visibility === 'workspace' ? 'accent' : 'default'}>{state.visibility}</Badge>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Access</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <Badge tone={accessState === 'forbidden' ? 'warning' : 'default'}>
                {accessState === 'loading'
                  ? 'Checking publish access'
                  : accessState === 'signed_out'
                    ? 'Sign in required'
                    : accessState === 'expired'
                      ? 'Session expired'
                      : 'Enterprise publishing required'}
              </Badge>
              <div className="os-entity-copy">
                {accessState === 'signed_out'
                  ? 'Sign in with an enterprise workspace to create or publish apps.'
                  : accessState === 'expired'
                    ? 'Sign in again with an enterprise workspace to create or publish apps.'
                    : accessState === 'forbidden'
                    ? 'App creation and publishing stay gated to Enterprise Plus and Enterprise Max.'
                    : 'Validating publishing permissions.'}
              </div>
            </div>
          </Card>
        )}
      >
        {accessState === 'allowed' ? (
          <PageHeader
            eyebrow="Publish App"
            title={slug ? 'Edit app listing' : 'Publish App'}
            subtitle="Build, configure, preview, and publish an App Store listing."
            actions={<Button onClick={() => void publish('published')} loading={saving} disabled={!canPublishLive || Boolean(publishBlockedReason)} disabledReason={!canPublishLive ? 'Live publishing requires Enterprise publish permission.' : publishBlockedReason}>Publish</Button>}
          />
        ) : accessState === 'signed_out' ? (
          <PageHeader
            eyebrow="Publishing Access"
            title="Sign in required"
            subtitle="App publishing is available only after sign-in and workspace validation."
          />
        ) : accessState === 'forbidden' ? (
          <PageHeader
            eyebrow="Publishing Access"
            title="Enterprise access required"
            subtitle="Free and Pro plans cannot create, publish, or manage app listings."
          />
        ) : (
          <PageHeader
            eyebrow="Publishing Access"
            title="Checking access"
            subtitle="Validating publishing permissions for this workspace."
          />
        )}

        {sessionLoading || (accessState === 'allowed' && loading) ? <LoadingState label="Loading publishing access" /> : accessState === 'signed_out' ? (
          <EmptyState title="Sign in required" body="Sign in to create or edit app listings." action={<Button href="/signin">Sign in</Button>} />
        ) : accessState === 'expired' ? (
          <EmptyState title="Session expired" body="Sign in again to create or edit app listings." action={<Button href="/signin">Sign in again</Button>} />
        ) : !canPublishApp ? (
          <EmptyState title="Enterprise access required" body="App creation and publishing stay gated to Enterprise Plus and Enterprise Max workspaces." action={<Button href="/studio">Open Studio</Button>} />
        ) : (
          <>
            <Card>
              <Tabs tabs={STEPS.map(item => ({ key: item, label: item }))} active={step} onChange={setStep} />
            </Card>

            {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}

            {step === 'Build App' ? (
              <Card>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <Input value={state.name} onChange={event => setState(current => ({ ...current, name: event.target.value }))} placeholder="App name" />
                  <Input value={state.slug} onChange={event => setState(current => ({ ...current, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} placeholder="Slug" />
                  <Input value={state.category} onChange={event => setState(current => ({ ...current, category: event.target.value }))} placeholder="Category" />
                  <Input value={state.version} onChange={event => setState(current => ({ ...current, version: event.target.value }))} placeholder="Version" />
                  <Select value={state.runtime} onChange={event => setState(current => ({ ...current, runtime: event.target.value as WizardState['runtime'] }))}>
                    <option value="agentos-app">Internal app</option>
                    <option value="external-app">External SDK</option>
                    <option value="workspace-app">Workspace app</option>
                  </Select>
                </div>
                <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                  <Input value={state.entrypoint} onChange={event => setState(current => ({ ...current, entrypoint: event.target.value }))} placeholder="Entrypoint" />
                  <Input value={state.deviceTargets} onChange={event => setState(current => ({ ...current, deviceTargets: event.target.value }))} placeholder="Device targets" />
                  <Textarea value={state.commands} onChange={event => setState(current => ({ ...current, commands: event.target.value }))} placeholder="Commands JSON" />
                </div>
              </Card>
            ) : null}

            {step === 'Configure App' ? (
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

            {step === 'Store Listing' ? (
              <Card>
                <div style={{ display: 'grid', gap: 12 }}>
                  <Input value={state.description} onChange={event => setState(current => ({ ...current, description: event.target.value }))} placeholder="Short description" />
                  <Textarea value={state.longDescription} onChange={event => setState(current => ({ ...current, longDescription: event.target.value }))} placeholder="Long description" />
                  <Input value={state.developer} onChange={event => setState(current => ({ ...current, developer: event.target.value }))} placeholder="Developer" />
                  <Input value={state.logoUrl} onChange={event => setState(current => ({ ...current, logoUrl: event.target.value }))} placeholder="Icon URL" />
                  <Input value={state.bannerUrl} onChange={event => setState(current => ({ ...current, bannerUrl: event.target.value }))} placeholder="Banner URL" />
                  <Input value={state.videoUrl} onChange={event => setState(current => ({ ...current, videoUrl: event.target.value }))} placeholder="Video URL optional" />
                  <Input value={state.category} onChange={event => setState(current => ({ ...current, category: event.target.value }))} placeholder="Category" />
                  <Input value={state.tags} onChange={event => setState(current => ({ ...current, tags: event.target.value }))} placeholder="Tags" />
                  <Input value={state.websiteUrl} onChange={event => setState(current => ({ ...current, websiteUrl: event.target.value }))} placeholder="Website" />
                  <Input value={state.supportUrl} onChange={event => setState(current => ({ ...current, supportUrl: event.target.value }))} placeholder="Support" />
                  <Input value={state.privacyPolicyUrl} onChange={event => setState(current => ({ ...current, privacyPolicyUrl: event.target.value }))} placeholder="Privacy Policy" />
                  <Input value={state.termsUrl} onChange={event => setState(current => ({ ...current, termsUrl: event.target.value }))} placeholder="Terms" />
                  <Input value={state.pricing} onChange={event => setState(current => ({ ...current, pricing: event.target.value }))} placeholder="Pricing" />
                  <Input value={state.documentationUrl} onChange={event => setState(current => ({ ...current, documentationUrl: event.target.value }))} placeholder="Documentation" />
                  <Input value={state.appUrl} onChange={event => setState(current => ({ ...current, appUrl: event.target.value }))} placeholder="Web app URL" />
                  <Input value={state.repositoryUrl} onChange={event => setState(current => ({ ...current, repositoryUrl: event.target.value }))} placeholder="Repository or build source URL" />
                  <Input value={state.androidBuildUrl} onChange={event => setState(current => ({ ...current, androidBuildUrl: event.target.value }))} placeholder="Android build link optional" />
                  <Input value={state.iosBuildUrl} onChange={event => setState(current => ({ ...current, iosBuildUrl: event.target.value }))} placeholder="iOS build link optional" />
                  <Input value={state.desktopBuildUrl} onChange={event => setState(current => ({ ...current, desktopBuildUrl: event.target.value }))} placeholder="Desktop build link optional" />
                  <Input value={state.platforms} onChange={event => setState(current => ({ ...current, platforms: event.target.value }))} placeholder="Platforms" />
                  <Textarea value={state.features} onChange={event => setState(current => ({ ...current, features: event.target.value }))} placeholder="Features, one per line" />
                  <Textarea value={state.gallery} onChange={event => setState(current => ({ ...current, gallery: event.target.value }))} placeholder="Gallery URLs, one per line" />
                  <Textarea value={state.releaseNotes} onChange={event => setState(current => ({ ...current, releaseNotes: event.target.value }))} placeholder="Release notes" />
                  <Textarea value={state.changelog} onChange={event => setState(current => ({ ...current, changelog: event.target.value }))} placeholder="Changelog, one entry per line" />
                  <div className="os-entity-title">Screenshots and design attachments</div>
                  <input aria-label="Upload screenshots or design attachments" type="file" multiple accept="image/png,image/jpeg,image/webp" disabled={!state.slug} onChange={event => void uploadScreenshots(event.target.files)} />
                  {state.slug ? null : <div className="os-entity-copy">Save the app first to upload screenshots.</div>}
                  <Badge tone={mediaValidation.includes('validates') ? 'success' : 'warning'}>{mediaValidation}</Badge>
                  {state.screenshots.length ? state.screenshots.map((path, index) => (
                    <div key={path} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', gap: 8, alignItems: 'center' }}>
                      <SearchBar value={path} readOnly />
                      <Button variant="secondary" onClick={() => moveScreenshot(path, -1)} disabled={index === 0}>Up</Button>
                      <Button variant="secondary" onClick={() => moveScreenshot(path, 1)} disabled={index === state.screenshots.length - 1}>Down</Button>
                      <Button variant="danger" onClick={() => setPendingDestructive({ type: 'delete-screenshot', path })}>Delete</Button>
                    </div>
                  )) : null}
                  {galleryItems.length ? galleryItems.map((path, index) => (
                    <div key={path} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', gap: 8, alignItems: 'center' }}>
                      <SearchBar value={path} readOnly />
                      <Button variant="secondary" onClick={() => moveGalleryItem(path, -1)} disabled={index === 0}>Up</Button>
                      <Button variant="secondary" onClick={() => moveGalleryItem(path, 1)} disabled={index === galleryItems.length - 1}>Down</Button>
                      <Button variant="danger" onClick={() => setPendingDestructive({ type: 'delete-gallery', path })}>Delete</Button>
                    </div>
                  )) : null}
                  <div className="market-shell" data-surface="app-media-preview">
                    <article className="market-store-card">
                      <div className="market-card-banner">{state.bannerUrl ? <img src={state.bannerUrl} alt="" /> : state.name || 'Banner'}</div>
                      <div className="market-store-card-main">
                        <div className="market-listing-mark">{state.logoUrl ? <img src={state.logoUrl} alt="" /> : (state.name || 'AP').slice(0, 2).toUpperCase()}</div>
                        <div>
                          <h3>{state.name || 'Untitled app'}</h3>
                          <p>{state.description || 'Short description preview'}</p>
                        </div>
                      </div>
                      <div className="market-card-actions">
                        <Button variant="secondary">Preview</Button>
                        <Button>Install</Button>
                      </div>
                    </article>
                    <section className="market-detail-hero compact">
                      <div className="market-detail-backdrop market-card-banner">{state.bannerUrl ? <img src={state.bannerUrl} alt="" /> : <span>{state.name || 'Banner'}</span>}</div>
                      <div className="market-detail-logo">{state.logoUrl ? <img src={state.logoUrl} alt="" /> : (state.name || 'AP').slice(0, 2).toUpperCase()}</div>
                      <div className="market-detail-copy">
                        <span>Appstore Detail Preview</span>
                        <h2>{state.name || 'Untitled app'}</h2>
                        <p>{state.longDescription || state.description || 'Long description preview'}</p>
                        <div className="market-hero-meta">
                          <span>Version {state.version}</span>
                          <span>{state.platforms}</span>
                          <span>{state.pricing}</span>
                        </div>
                      </div>
                      <div className="market-detail-actions">
                        <Button variant="secondary">Preview</Button>
                        <Button>Install</Button>
                      </div>
                    </section>
                  </div>
                </div>
              </Card>
            ) : null}

            {step === 'Publish' ? (
              <Card>
                <div style={{ display: 'grid', gap: 12 }}>
                  <Select value={state.visibility} onChange={event => setState(current => ({ ...current, visibility: event.target.value as WizardState['visibility'] }))}>
                    <option value="private">Private</option>
                    <option value="workspace">Workspace</option>
                    <option value="public">Public</option>
                  </Select>
                  <div className="os-entity-copy">Internal apps default to private. Change to workspace for team testing or public only when the listing is approved for Appstore visibility.</div>
                  <div className="os-state-panel disabled">
                    <div className="os-entity-title">Review readiness</div>
                    <div className="os-entity-copy">{requiredPublishingFields.length ? `Complete these fields first: ${requiredPublishingFields.join(', ')}.` : 'Required listing, manifest, permission, and media fields are present.'}</div>
                    <div className="os-entity-copy">{reviewBackendMessage}</div>
                    <div className="os-inline-actions">
                      <Badge tone={requiredPublishingFields.length ? 'warning' : 'success'}>{requiredPublishingFields.length ? 'Needs metadata' : 'Ready to save'}</Badge>
                      <Badge tone={reviewBackendReady ? 'success' : 'warning'}>{reviewBackendReady ? 'Review backend live' : 'Review backend disabled'}</Badge>
                      <Badge tone={canPublishLive ? 'success' : 'warning'}>{canPublishLive ? 'Live publish permission' : 'Publish permission missing'}</Badge>
                    </div>
                  </div>
                  <Textarea value={manifestPreview} readOnly aria-label="App manifest preview" />
                  <div className="os-inline-actions">
                    <Button variant="secondary" onClick={() => void publish('draft')} loading={saving} disabled={Boolean(draftBlockedReason)} disabledReason={draftBlockedReason}>Save draft</Button>
                    <Button variant="secondary" onClick={() => void publish('submitted')} loading={saving} disabled={Boolean(publishBlockedReason)} disabledReason={publishBlockedReason}>Submit Review</Button>
                    <Button variant="secondary" onClick={() => void publish('update_pending')} loading={saving} disabled={!slug || Boolean(publishBlockedReason)} disabledReason={!slug ? 'Save this app before submitting an update.' : publishBlockedReason}>Submit Update</Button>
                    <Button variant="secondary" disabled disabledReason={reviewBackendReady ? undefined : 'Automated approve/reject review actions are not connected yet.'}>Approve Review</Button>
                    <Button variant="danger" onClick={() => setPendingDestructive({ type: 'unpublish' })} disabled={!slug} disabledReason={!slug ? 'Save this app before unpublishing.' : undefined}>Unpublish</Button>
                    <Button onClick={() => void publish('published')} loading={saving} disabled={!canPublishLive || Boolean(publishBlockedReason)} disabledReason={!canPublishLive ? 'Live publishing requires Enterprise publish permission.' : publishBlockedReason}>Publish public</Button>
                  </div>
                </div>
              </Card>
            ) : null}
          </>
        )}
      </WorkspaceShell>
      <ConfirmationDialog
        open={Boolean(pendingDestructive)}
        title={pendingDestructive?.type === 'unpublish' ? 'Unpublish app' : 'Delete media'}
        body={pendingDestructive?.type === 'unpublish' ? 'Move this app out of public availability?' : 'Delete this media reference from the listing?'}
        confirmLabel={pendingDestructive?.type === 'unpublish' ? 'Unpublish' : 'Delete'}
        busy={saving}
        onCancel={() => setPendingDestructive(null)}
        onConfirm={() => void confirmDestructive()}
      />
    </div>
  );
}
