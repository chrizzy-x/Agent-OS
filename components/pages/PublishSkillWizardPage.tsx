'use client';

import { useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { resolveBrowserAccessState } from '@/src/auth/browser-access';
import { fetchBrowserSessionState, type BrowserSession, type BrowserSessionAuthState } from '@/src/auth/browser-session';
import { Badge, Button, Card, ConfirmationDialog, EmptyState, Input, LoadingState, PageHeader, Select, Tabs, Textarea } from '@/components/os/ui';

const STEPS = ['Create Skill', 'Configure Skill', 'Store Listing', 'Publish'];

type SkillWizardState = {
  id: string;
  name: string;
  slug: string;
  category: string;
  version: string;
  description: string;
  longDescription: string;
  iconUrl: string;
  bannerUrl: string;
  videoUrl: string;
  websiteUrl: string;
  documentationUrl: string;
  supportUrl: string;
  privacyPolicyUrl: string;
  termsUrl: string;
  tags: string;
  capabilities: string;
  inputs: string;
  outputs: string;
  examples: string;
  permissions: string;
  requiredSecrets: string;
  dependenciesRequired: string;
  dependenciesOptional: string;
  compatibility: string;
  compatibleApps: string;
  compatibleAgents: string;
  compatibleWorkflows: string;
  screenshots: string;
  gallery: string;
  pricing: string;
  releaseNotes: string;
  changelog: string;
  visibility: 'private' | 'workspace' | 'public';
};

const DEFAULT_STATE: SkillWizardState = {
  id: '',
  name: '',
  slug: '',
  category: 'Research',
  version: '1.0.0',
  description: '',
  longDescription: '',
  iconUrl: '',
  bannerUrl: '',
  videoUrl: '',
  websiteUrl: '',
  documentationUrl: '',
  supportUrl: '',
  privacyPolicyUrl: '',
  termsUrl: '',
  tags: '',
  capabilities: JSON.stringify([{ name: 'run', description: 'Run this capability', params: {}, returns: 'result' }], null, 2),
  inputs: JSON.stringify([{ name: 'input', type: 'string', required: true }], null, 2),
  outputs: JSON.stringify([{ name: 'result', type: 'object' }], null, 2),
  examples: JSON.stringify([{ input: {}, output: {} }], null, 2),
  permissions: '',
  requiredSecrets: '',
  dependenciesRequired: '',
  dependenciesOptional: '',
  compatibility: 'Super AgentOS, Workflows, Subagents, Apps',
  compatibleApps: '',
  compatibleAgents: '',
  compatibleWorkflows: '',
  screenshots: '',
  gallery: '',
  pricing: 'Free',
  releaseNotes: '',
  changelog: '',
  visibility: 'private',
};

function csv(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function jsonArray(value: string): Array<Record<string, unknown>> {
  const parsed = JSON.parse(value || '[]');
  return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object' && !Array.isArray(item)) : [];
}

export default function PublishSkillWizardPage({ initialSlug }: { initialSlug?: string | null }) {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [sessionLoading, setSessionLoading] = useState(true);
  const [loading, setLoading] = useState(Boolean(initialSlug));
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(STEPS[0]);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<SkillWizardState>(DEFAULT_STATE);
  const [pendingDestructive, setPendingDestructive] = useState<null | { type: 'unpublish' | 'delete-gallery'; path?: string }>(null);
  const canPublishSkill = session?.capabilities?.includes('create_skill') === true || session?.capabilities?.includes('publish_skill') === true;
  const accessState = resolveBrowserAccessState(session, sessionLoading, 'create_skill', authState);

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
      if (!initialSlug || !canPublishSkill) {
        if (active) setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/skills/${encodeURIComponent(initialSlug)}`, { cache: 'no-store' });
        const data = await res.json();
        const skill = data.skill;
        if (!active || !skill) return;
        setState({
          id: skill.id ?? '',
          name: skill.name ?? '',
          slug: skill.slug ?? '',
          category: skill.category ?? 'Research',
          version: skill.version ?? '1.0.0',
          description: skill.description ?? '',
          longDescription: skill.long_description ?? '',
          iconUrl: skill.icon_url ?? '',
          bannerUrl: skill.banner_url ?? '',
          videoUrl: skill.video_url ?? '',
          websiteUrl: skill.website_url ?? '',
          documentationUrl: skill.documentation_url ?? '',
          supportUrl: skill.support_url ?? '',
          privacyPolicyUrl: skill.privacy_policy_url ?? '',
          termsUrl: skill.terms_url ?? '',
          tags: (skill.tags ?? []).join(', '),
          capabilities: JSON.stringify(skill.capabilities ?? [], null, 2),
          inputs: JSON.stringify(skill.inputs ?? [], null, 2),
          outputs: JSON.stringify(skill.outputs ?? [], null, 2),
          examples: JSON.stringify(skill.examples ?? [], null, 2),
          permissions: (skill.permissions_required ?? []).join(', '),
          requiredSecrets: (skill.required_secrets ?? []).join(', '),
          dependenciesRequired: (skill.required_skills ?? []).join(', '),
          dependenciesOptional: (skill.optional_skills ?? []).join(', '),
          compatibility: (skill.compatibility ?? []).join(', '),
          compatibleApps: (skill.compatible_apps ?? []).join(', '),
          compatibleAgents: (skill.compatible_agents ?? []).join(', '),
          compatibleWorkflows: (skill.compatible_workflows ?? []).join(', '),
          screenshots: '',
          gallery: (skill.gallery ?? []).join('\n'),
          pricing: typeof skill.pricing_model === 'string' ? skill.pricing_model : 'Free',
          releaseNotes: skill.release_notes ?? '',
          changelog: (skill.changelog ?? []).join('\n'),
          visibility: skill.visibility ?? 'private',
        });
      } catch {
        setMessage('Failed to load skill listing');
      } finally {
        if (active) setLoading(false);
      }
    }
    if (!sessionLoading) void load();
    return () => { active = false; };
  }, [canPublishSkill, initialSlug, sessionLoading]);

  const preview = useMemo(() => ({
    name: state.name || 'Untitled skill',
    category: state.category,
    description: state.description || 'Short description preview',
    visibility: state.visibility,
  }), [state]);

  const galleryItems = useMemo(
    () => state.gallery.split('\n').map(item => item.trim()).filter(Boolean),
    [state.gallery],
  );
  const screenshotItems = useMemo(
    () => state.screenshots.split('\n').map(item => item.trim()).filter(Boolean),
    [state.screenshots],
  );

  const mediaValidation = useMemo(() => {
    const missing = [
      state.iconUrl ? null : 'Icon',
      state.bannerUrl ? null : 'Banner',
      screenshotItems.length ? null : 'Screenshots',
      galleryItems.length ? null : 'Gallery',
      state.videoUrl ? null : 'Video optional',
    ].filter(Boolean);
    return missing.length ? `${missing.join(', ')} needed for a complete media set.` : 'Media validates against the skill store preview.';
  }, [galleryItems.length, screenshotItems.length, state.bannerUrl, state.iconUrl, state.videoUrl]);

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
    } else if (action.type === 'delete-gallery' && action.path) {
      deleteGalleryItem(action.path);
    }
    setPendingDestructive(null);
  }

  async function publish(publishState?: 'draft' | 'submitted' | 'published' | 'update_pending' | 'unpublished') {
    setSaving(true);
    setMessage('');
    try {
      const payload = {
        name: state.name,
        slug: state.slug || state.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
        version: state.version,
        category: state.category,
        description: state.description,
        long_description: state.longDescription,
        icon_url: state.iconUrl || null,
        banner_url: state.bannerUrl || null,
        video_url: state.videoUrl || null,
        website_url: state.websiteUrl || null,
        documentation_url: state.documentationUrl || null,
        support_url: state.supportUrl || null,
        privacy_policy_url: state.privacyPolicyUrl || null,
        terms_url: state.termsUrl || null,
        tags: csv(state.tags),
        capabilities: jsonArray(state.capabilities),
        inputs: jsonArray(state.inputs),
        outputs: jsonArray(state.outputs),
        examples: jsonArray(state.examples),
        permissions_required: csv(state.permissions),
        required_secrets: csv(state.requiredSecrets),
        required_skills: csv(state.dependenciesRequired),
        optional_skills: csv(state.dependenciesOptional),
        dependencies: { required: csv(state.dependenciesRequired), optional: csv(state.dependenciesOptional) },
        compatibility: csv(state.compatibility),
        compatible_apps: csv(state.compatibleApps),
        compatible_agents: csv(state.compatibleAgents),
        compatible_workflows: csv(state.compatibleWorkflows),
        gallery: [...state.screenshots.split('\n').map(item => item.trim()).filter(Boolean), ...state.gallery.split('\n').map(item => item.trim()).filter(Boolean)],
        pricing_model: state.pricing,
        release_notes: state.releaseNotes,
        changelog: state.changelog.split('\n').map(item => item.trim()).filter(Boolean),
        publish_state: publishState ?? (state.visibility === 'public' ? 'published' : 'draft'),
        published: (publishState ?? (state.visibility === 'public' ? 'published' : 'draft')) === 'published',
        visibility: state.visibility,
      };
      const endpoint = state.id ? `/api/skills/${encodeURIComponent(state.id)}` : '/api/skills';
      const res = await fetch(endpoint, {
        method: state.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setMessage(res.ok ? `Saved ${data.skill?.name ?? data.slug ?? state.name}` : data.error ?? data.message ?? 'Save failed');
      if (res.ok && data.id && !state.id) setState(current => ({ ...current, id: data.id, slug: data.slug ?? current.slug }));
    } catch {
      setMessage('Skill listing validation failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/developer" />
      <WorkspaceShell
        activePath="/developer"
        extraSidebar={accessState === 'allowed' ? (
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Publish Skill</div>
            <Tabs tabs={STEPS.map(item => ({ key: item, label: item }))} active={step} onChange={setStep} />
          </Card>
        ) : undefined}
        aside={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Preview</div>
            <div className="os-drawer-stack">
              <Badge tone={preview.visibility === 'public' ? 'success' : preview.visibility === 'workspace' ? 'accent' : 'default'}>{preview.visibility}</Badge>
              <div className="os-entity-title">{preview.name}</div>
              <div className="os-entity-copy">{preview.description}</div>
              <div className="os-entity-copy">{preview.category}</div>
            </div>
          </Card>
        )}
      >
        {accessState === 'allowed' ? (
          <PageHeader
            eyebrow="Publish Skill"
            title={initialSlug ? 'Edit skill listing' : 'Publish Skill'}
            subtitle="Create, configure, preview, and publish a Skill Store capability."
            actions={<Button onClick={() => void publish('published')} loading={saving}>Publish</Button>}
          />
        ) : (
          <PageHeader eyebrow="Publishing Access" title="Enterprise access required" subtitle="Skill creation and publishing require an enterprise-capable workspace." />
        )}

        {sessionLoading || (accessState === 'allowed' && loading) ? <LoadingState label="Loading skill publishing" /> : !session ? (
          <EmptyState title="Sign in required" body="Sign in to publish skills." action={<Button href="/signin">Sign in</Button>} />
        ) : !canPublishSkill ? (
          <EmptyState title="Enterprise access required" body="Skill creation and publishing stay gated to Enterprise and Enterprise Max workspaces." action={<Button href="/studio">Open Studio</Button>} />
        ) : (
          <div className="os-drawer-stack">
            <Card>
              <Tabs tabs={STEPS.map(item => ({ key: item, label: item }))} active={step} onChange={setStep} />
            </Card>

            {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}

            {step === 'Create Skill' ? (
              <Card>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <Input value={state.name} onChange={event => setState(current => ({ ...current, name: event.target.value }))} placeholder="Skill name" />
                  <Input value={state.slug} onChange={event => setState(current => ({ ...current, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} placeholder="Slug" />
                  <Input value={state.category} onChange={event => setState(current => ({ ...current, category: event.target.value }))} placeholder="Category" />
                  <Input value={state.version} onChange={event => setState(current => ({ ...current, version: event.target.value }))} placeholder="Version" />
                </div>
                <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                  <Textarea value={state.capabilities} onChange={event => setState(current => ({ ...current, capabilities: event.target.value }))} placeholder="Capabilities JSON" />
                </div>
              </Card>
            ) : null}

            {step === 'Configure Skill' ? (
              <Card>
                <div style={{ display: 'grid', gap: 12 }}>
                  <Input value={state.permissions} onChange={event => setState(current => ({ ...current, permissions: event.target.value }))} placeholder="Permissions" />
                  <Input value={state.requiredSecrets} onChange={event => setState(current => ({ ...current, requiredSecrets: event.target.value }))} placeholder="Required Secrets" />
                  <Input value={state.dependenciesRequired} onChange={event => setState(current => ({ ...current, dependenciesRequired: event.target.value }))} placeholder="Required skills" />
                  <Input value={state.dependenciesOptional} onChange={event => setState(current => ({ ...current, dependenciesOptional: event.target.value }))} placeholder="Optional skills" />
                  <Input value={state.compatibility} onChange={event => setState(current => ({ ...current, compatibility: event.target.value }))} placeholder="Compatibility" />
                  <Input value={state.compatibleApps} onChange={event => setState(current => ({ ...current, compatibleApps: event.target.value }))} placeholder="Compatible Apps" />
                  <Input value={state.compatibleAgents} onChange={event => setState(current => ({ ...current, compatibleAgents: event.target.value }))} placeholder="Compatible Agents" />
                  <Input value={state.compatibleWorkflows} onChange={event => setState(current => ({ ...current, compatibleWorkflows: event.target.value }))} placeholder="Compatible Workflows" />
                  <Textarea value={state.inputs} onChange={event => setState(current => ({ ...current, inputs: event.target.value }))} placeholder="Inputs JSON" />
                  <Textarea value={state.outputs} onChange={event => setState(current => ({ ...current, outputs: event.target.value }))} placeholder="Outputs JSON" />
                  <Textarea value={state.examples} onChange={event => setState(current => ({ ...current, examples: event.target.value }))} placeholder="Examples JSON" />
                </div>
              </Card>
            ) : null}

            {step === 'Store Listing' ? (
              <Card>
                <div style={{ display: 'grid', gap: 12 }}>
                  <Input value={state.description} onChange={event => setState(current => ({ ...current, description: event.target.value }))} placeholder="Short description" />
                  <Textarea value={state.longDescription} onChange={event => setState(current => ({ ...current, longDescription: event.target.value }))} placeholder="Long description" />
                  <Input value={state.iconUrl} onChange={event => setState(current => ({ ...current, iconUrl: event.target.value }))} placeholder="Icon URL" />
                  <Input value={state.bannerUrl} onChange={event => setState(current => ({ ...current, bannerUrl: event.target.value }))} placeholder="Banner URL" />
                  <Input value={state.videoUrl} onChange={event => setState(current => ({ ...current, videoUrl: event.target.value }))} placeholder="Video URL optional" />
                  <Input value={state.tags} onChange={event => setState(current => ({ ...current, tags: event.target.value }))} placeholder="Tags" />
                  <Input value={state.websiteUrl} onChange={event => setState(current => ({ ...current, websiteUrl: event.target.value }))} placeholder="Website" />
                  <Input value={state.supportUrl} onChange={event => setState(current => ({ ...current, supportUrl: event.target.value }))} placeholder="Support" />
                  <Input value={state.privacyPolicyUrl} onChange={event => setState(current => ({ ...current, privacyPolicyUrl: event.target.value }))} placeholder="Privacy Policy" />
                  <Input value={state.termsUrl} onChange={event => setState(current => ({ ...current, termsUrl: event.target.value }))} placeholder="Terms" />
                  <Input value={state.documentationUrl} onChange={event => setState(current => ({ ...current, documentationUrl: event.target.value }))} placeholder="Documentation" />
                  <Select value={state.pricing} onChange={event => setState(current => ({ ...current, pricing: event.target.value }))}>
                    <option value="Free">Free</option>
                    <option value="Paid">Paid</option>
                    <option value="Coming Soon">Coming Soon</option>
                  </Select>
                  <Textarea value={state.screenshots} onChange={event => setState(current => ({ ...current, screenshots: event.target.value }))} placeholder="Screenshot URLs, one per line" />
                  <Textarea value={state.gallery} onChange={event => setState(current => ({ ...current, gallery: event.target.value }))} placeholder="Gallery URLs, one per line" />
                  <Badge tone={mediaValidation.includes('validates') ? 'success' : 'warning'}>{mediaValidation}</Badge>
                  {galleryItems.length ? galleryItems.map((path, index) => (
                    <div key={path} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', gap: 8, alignItems: 'center' }}>
                      <Input value={path} readOnly />
                      <Button variant="secondary" onClick={() => moveGalleryItem(path, -1)} disabled={index === 0}>Up</Button>
                      <Button variant="secondary" onClick={() => moveGalleryItem(path, 1)} disabled={index === galleryItems.length - 1}>Down</Button>
                      <Button variant="danger" onClick={() => setPendingDestructive({ type: 'delete-gallery', path })}>Delete</Button>
                    </div>
                  )) : null}
                  <div className="market-shell" data-surface="skill-media-preview">
                    <article className="market-store-card technical">
                      <div className="market-card-banner">{state.bannerUrl ? <img src={state.bannerUrl} alt="" /> : state.name || 'Banner'}</div>
                      <div className="market-store-card-main">
                        <div className="market-listing-mark">{state.iconUrl ? <img src={state.iconUrl} alt="" /> : (state.name || 'SK').slice(0, 2).toUpperCase()}</div>
                        <div>
                          <h3>{state.name || 'Untitled skill'}</h3>
                          <p>{state.description || 'Capability preview'}</p>
                        </div>
                      </div>
                      <div className="market-capability-tags">
                        {csv(state.compatibility).slice(0, 3).map(item => <span key={item}>{item}</span>)}
                      </div>
                      <div className="market-card-actions">
                        <Button variant="secondary">Use</Button>
                        <Button>Install</Button>
                      </div>
                    </article>
                    <section className="market-detail-hero compact">
                      <div className="market-detail-backdrop market-card-banner">{state.bannerUrl ? <img src={state.bannerUrl} alt="" /> : <span>{state.name || 'Banner'}</span>}</div>
                      <div className="market-detail-logo">{state.iconUrl ? <img src={state.iconUrl} alt="" /> : (state.name || 'SK').slice(0, 2).toUpperCase()}</div>
                      <div className="market-detail-copy">
                        <span>Skillstore Detail Preview</span>
                        <h2>{state.name || 'Untitled skill'}</h2>
                        <p>{state.longDescription || state.description || 'Long description preview'}</p>
                        <div className="market-hero-meta">
                          <span>{state.category}</span>
                          <span>Version {state.version}</span>
                          <span>{state.pricing}</span>
                        </div>
                      </div>
                      <div className="market-detail-actions">
                        <Button variant="secondary">Use</Button>
                        <Button>Install</Button>
                      </div>
                    </section>
                  </div>
                  <Textarea value={state.releaseNotes} onChange={event => setState(current => ({ ...current, releaseNotes: event.target.value }))} placeholder="Release notes" />
                  <Textarea value={state.changelog} onChange={event => setState(current => ({ ...current, changelog: event.target.value }))} placeholder="Changelog, one entry per line" />
                </div>
              </Card>
            ) : null}

            {step === 'Publish' ? (
              <Card>
                <div style={{ display: 'grid', gap: 12 }}>
                  <Select value={state.visibility} onChange={event => setState(current => ({ ...current, visibility: event.target.value as SkillWizardState['visibility'] }))}>
                    <option value="private">Private</option>
                    <option value="workspace">Workspace</option>
                    <option value="public">Public</option>
                  </Select>
                  <pre className="os-code-block">{JSON.stringify(preview, null, 2)}</pre>
                  <div className="os-inline-actions">
                    <Button variant="secondary" onClick={() => void publish('draft')}>{saving ? 'Saving...' : 'Draft'}</Button>
                    <Button variant="secondary" onClick={() => void publish('submitted')}>{saving ? 'Submitting...' : 'Submit Review'}</Button>
                    <Button variant="secondary" onClick={() => void publish('update_pending')}>{saving ? 'Updating...' : 'Update'}</Button>
                    <Button variant="danger" onClick={() => setPendingDestructive({ type: 'unpublish' })}>Unpublish</Button>
                    <Button onClick={() => void publish('published')} loading={saving}>Publish Skill</Button>
                  </div>
                </div>
              </Card>
            ) : null}
          </div>
        )}
      </WorkspaceShell>
      <ConfirmationDialog
        open={Boolean(pendingDestructive)}
        title={pendingDestructive?.type === 'unpublish' ? 'Unpublish skill' : 'Delete media'}
        body={pendingDestructive?.type === 'unpublish' ? 'Move this skill out of public availability?' : 'Delete this media reference from the listing?'}
        confirmLabel={pendingDestructive?.type === 'unpublish' ? 'Unpublish' : 'Delete'}
        busy={saving}
        onCancel={() => setPendingDestructive(null)}
        onConfirm={() => void confirmDestructive()}
      />
    </div>
  );
}
