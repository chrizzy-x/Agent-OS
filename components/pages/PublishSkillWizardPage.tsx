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
  pricePerCall: string;
  freeTierCalls: string;
  releaseNotes: string;
  changelog: string;
  testCapability: string;
  testParams: string;
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
  pricing: 'free',
  pricePerCall: '0',
  freeTierCalls: '100',
  releaseNotes: '',
  changelog: '',
  testCapability: 'run',
  testParams: JSON.stringify({ input: '' }, null, 2),
  visibility: 'private',
};

function csv(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function jsonArray(value: string): Array<Record<string, unknown>> {
  const parsed = JSON.parse(value || '[]');
  return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object' && !Array.isArray(item)) : [];
}

function safeJsonArray(value: string): { items: Array<Record<string, unknown>>; error: string | null } {
  try {
    return { items: jsonArray(value), error: null };
  } catch {
    return { items: [], error: 'Invalid JSON array' };
  }
}

function pricingLabel(value: string, pricePerCall: string): string {
  if (value === 'per_call') return `$${Number(pricePerCall || 0).toFixed(2)}/call`;
  if (value === 'coming_soon') return 'Coming soon';
  return 'Free';
}

export default function PublishSkillWizardPage({ initialSlug }: { initialSlug?: string | null }) {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [sessionLoading, setSessionLoading] = useState(true);
  const [loading, setLoading] = useState(Boolean(initialSlug));
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(STEPS[0]);
  const [message, setMessage] = useState('');
  const [testResult, setTestResult] = useState('');
  const [testingInvocation, setTestingInvocation] = useState(false);
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
        const capabilities = Array.isArray(skill.capabilities) ? skill.capabilities : [];
        const examples = Array.isArray(skill.examples) ? skill.examples : [];
        const firstCapability = capabilities.find((item: unknown): item is { name?: string } => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
        const firstExample = examples.find((item: unknown): item is { input?: unknown } => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
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
          pricing: typeof skill.pricing_model === 'string' ? skill.pricing_model : 'free',
          pricePerCall: String(skill.price_per_call ?? 0),
          freeTierCalls: String(skill.free_tier_calls ?? 100),
          releaseNotes: skill.release_notes ?? '',
          changelog: (skill.changelog ?? []).join('\n'),
          testCapability: firstCapability?.name ?? 'run',
          testParams: JSON.stringify(firstExample?.input ?? {}, null, 2),
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

  const parsedCapabilities = useMemo(() => safeJsonArray(state.capabilities), [state.capabilities]);
  const parsedInputs = useMemo(() => safeJsonArray(state.inputs), [state.inputs]);
  const parsedOutputs = useMemo(() => safeJsonArray(state.outputs), [state.outputs]);
  const parsedExamples = useMemo(() => safeJsonArray(state.examples), [state.examples]);

  const manifestPreview = useMemo(() => JSON.stringify({
    schemaVersion: 'agentos.skill.v1',
    name: state.name || null,
    slug: state.slug || null,
    version: state.version,
    category: state.category,
    pricing: {
      model: state.pricing,
      pricePerCall: Number(state.pricePerCall || 0),
      freeTierCalls: Number(state.freeTierCalls || 0),
    },
    capabilities: parsedCapabilities.items.map(item => item.name ?? 'unnamed'),
    inputs: parsedInputs.items.map(item => item.name ?? 'input'),
    outputs: parsedOutputs.items.map(item => item.name ?? 'output'),
    examples: parsedExamples.items.length,
    permissions: csv(state.permissions),
    requiredSecrets: csv(state.requiredSecrets),
    requiredSkills: csv(state.dependenciesRequired),
    optionalSkills: csv(state.dependenciesOptional),
    compatibility: csv(state.compatibility),
  }, null, 2), [parsedCapabilities.items, parsedExamples.items.length, parsedInputs.items, parsedOutputs.items, state]);

  const draftRequiredFields = useMemo(() => [
    state.name.trim() ? null : 'Skill name',
    state.slug.trim() || state.name.trim() ? null : 'Slug or skill name',
    state.category.trim() ? null : 'Category',
    state.description.trim() ? null : 'Short description',
    parsedCapabilities.error ? 'Valid capabilities JSON' : null,
    parsedCapabilities.items.length ? null : 'At least one capability',
  ].filter(Boolean) as string[], [parsedCapabilities, state]);

  const requiredPublishingFields = useMemo(() => [
    ...draftRequiredFields,
    state.longDescription.trim() ? null : 'Full description',
    state.version.trim() ? null : 'Version',
    parsedInputs.error ? 'Valid inputs JSON' : null,
    parsedOutputs.error ? 'Valid outputs JSON' : null,
    parsedExamples.error ? 'Valid examples JSON' : null,
    parsedExamples.items.length ? null : 'At least one example',
    state.releaseNotes.trim() ? null : 'Release notes',
  ].filter(Boolean) as string[], [draftRequiredFields, parsedExamples, parsedInputs.error, parsedOutputs.error, state]);

  const draftBlockedReason = draftRequiredFields.length ? `Missing: ${draftRequiredFields.join(', ')}` : undefined;
  const publishBlockedReason = requiredPublishingFields.length ? `Missing: ${requiredPublishingFields.join(', ')}` : undefined;
  const canPublishLive = session?.capabilities?.includes('publish_skill') === true;
  const reviewBackendReady = false;
  const reviewBackendMessage = 'Automated skill reviewer decisions are not connected yet. Submit Review records a submitted listing state for enterprise review; approval must happen outside this UI.';
  const testBlockedReason = !state.id
    ? 'Save this skill draft before generating a backend invocation preview.'
    : parsedCapabilities.items.length === 0
      ? 'Add at least one capability before testing.'
      : undefined;

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

  async function testInvocationPreview() {
    if (testBlockedReason) return;
    setTestingInvocation(true);
    setTestResult('');
    try {
      const params = JSON.parse(state.testParams || '{}');
      const response = await fetch(`/api/skills/${encodeURIComponent(state.id || state.slug)}/preview`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      setTestResult(response.ok
        ? JSON.stringify({
          capability: state.testCapability,
          params,
          preview: data.preview,
          liveRuntime: 'Disabled until the saved skill is installed from Skill Store.',
        }, null, 2)
        : data.error ?? data.message ?? 'Preview failed');
    } catch {
      setTestResult('Test params must be valid JSON.');
    } finally {
      setTestingInvocation(false);
    }
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
      const effectiveVisibility = publishState === 'published'
        ? 'public'
        : publishState === 'unpublished'
          ? 'private'
          : state.visibility;
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
        price_per_call: Number(state.pricePerCall || 0),
        free_tier_calls: Number(state.freeTierCalls || 0),
        release_notes: state.releaseNotes,
        changelog: state.changelog.split('\n').map(item => item.trim()).filter(Boolean),
        publish_state: publishState ?? (state.visibility === 'public' ? 'published' : 'draft'),
        published: (publishState ?? (state.visibility === 'public' ? 'published' : 'draft')) === 'published',
        visibility: effectiveVisibility,
      };
      const endpoint = state.id ? `/api/skills/${encodeURIComponent(state.id)}` : '/api/skills';
      const res = await fetch(endpoint, {
        method: state.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const savedSkill = data.skill ?? data;
      setMessage(res.ok ? `Saved ${savedSkill.name ?? savedSkill.slug ?? state.name}` : data.error ?? data.message ?? 'Save failed');
      if (res.ok && savedSkill.id && !state.id) setState(current => ({ ...current, id: savedSkill.id, slug: savedSkill.slug ?? current.slug }));
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
            actions={(
              <>
                <Button variant="secondary" onClick={() => void publish('draft')} loading={saving} disabled={Boolean(draftBlockedReason)} disabledReason={draftBlockedReason}>Save draft</Button>
                <Button onClick={() => void publish('published')} loading={saving} disabled={!canPublishLive || Boolean(publishBlockedReason)} disabledReason={!canPublishLive ? 'Live publishing requires Enterprise publish permission.' : publishBlockedReason}>Publish public</Button>
              </>
            )}
          />
        ) : (
          <PageHeader eyebrow="Publishing Access" title="Enterprise access required" subtitle="Skill creation and publishing require an enterprise-capable workspace." />
        )}

        {sessionLoading || (accessState === 'allowed' && loading) ? <LoadingState label="Loading skill publishing" /> : !session ? (
          <EmptyState title="Sign in required" body="Sign in to publish skills." action={<Button href="/signin">Sign in</Button>} />
        ) : !canPublishSkill ? (
          <EmptyState title="Enterprise access required" body="Skill creation and publishing stay gated to Enterprise Plus and Enterprise Max workspaces." action={<Button href="/studio">Open Studio</Button>} />
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
                  <div className="os-entity-title">Test invocation</div>
                  <div className="os-entity-copy">Validate the saved skill preview from the backend. Live runtime tests stay disabled until this skill is installed from Skill Store.</div>
                  <Select value={state.testCapability} onChange={event => setState(current => ({ ...current, testCapability: event.target.value }))} aria-label="Test capability">
                    {parsedCapabilities.items.length ? parsedCapabilities.items.map((capability, index) => {
                      const name = typeof capability.name === 'string' ? capability.name : `capability-${index + 1}`;
                      return <option key={name} value={name}>{name}</option>;
                    }) : <option value="run">run</option>}
                  </Select>
                  <Textarea value={state.testParams} onChange={event => setState(current => ({ ...current, testParams: event.target.value }))} placeholder="Test params JSON" />
                  <div className="os-inline-actions">
                    <Button variant="secondary" onClick={() => void testInvocationPreview()} loading={testingInvocation} disabled={Boolean(testBlockedReason)} disabledReason={testBlockedReason}>Test invocation preview</Button>
                    <Button variant="secondary" disabled disabledReason="Live runtime tests require installing the saved skill from Skill Store.">Run live test</Button>
                  </div>
                  {testResult ? <pre className="os-code-block">{testResult}</pre> : null}
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
                    <option value="free">Free</option>
                    <option value="per_call">Paid per call</option>
                    <option value="coming_soon">Coming Soon</option>
                  </Select>
                  <Input value={state.pricePerCall} onChange={event => setState(current => ({ ...current, pricePerCall: event.target.value }))} placeholder="Price per call" inputMode="decimal" />
                  <Input value={state.freeTierCalls} onChange={event => setState(current => ({ ...current, freeTierCalls: event.target.value }))} placeholder="Free tier calls" inputMode="numeric" />
                  <Textarea value={state.screenshots} onChange={event => setState(current => ({ ...current, screenshots: event.target.value }))} placeholder="Screenshot URLs, one per line" />
                  <Textarea value={state.gallery} onChange={event => setState(current => ({ ...current, gallery: event.target.value }))} placeholder="Gallery URLs, one per line" />
                  <div className="os-entity-title">Visual upload</div>
                  <input aria-label="Upload skill visuals" type="file" multiple accept="image/png,image/jpeg,image/webp" disabled />
                  <div className="os-entity-copy">Binary visual upload is disabled until durable media storage is connected. Use icon, banner, screenshot, and gallery URLs for now.</div>
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
                          <span>{pricingLabel(state.pricing, state.pricePerCall)}</span>
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
                  <p className="muted">Skill drafts stay private by default. Public discovery opens only after the skill has complete metadata, review readiness, and live publish permission.</p>
                  <Select value={state.visibility} onChange={event => setState(current => ({ ...current, visibility: event.target.value as SkillWizardState['visibility'] }))}>
                    <option value="private">Private</option>
                    <option value="workspace">Workspace</option>
                    <option value="public">Public</option>
                  </Select>
                  <div className="publish-review-readiness">
                    <div>
                      <strong>Review readiness</strong>
                      <p className="muted">{requiredPublishingFields.length ? `Missing: ${requiredPublishingFields.join(', ')}` : 'Ready to submit for review.'}</p>
                      <p className="muted">{reviewBackendMessage}</p>
                    </div>
                    <div className="os-inline-actions">
                      <Badge tone={draftBlockedReason ? 'warning' : 'success'}>{draftBlockedReason ? 'Needs metadata' : 'Ready to save'}</Badge>
                      <Badge tone="warning">Review backend disabled</Badge>
                      <Badge tone={canPublishLive ? 'success' : 'warning'}>{canPublishLive ? 'Live publish permission' : 'Live publish gated'}</Badge>
                    </div>
                  </div>
                  <Textarea value={manifestPreview} readOnly aria-label="Skill manifest preview" />
                  <div className="os-inline-actions">
                    <Button variant="secondary" onClick={() => void publish('draft')} loading={saving} disabled={Boolean(draftBlockedReason)} disabledReason={draftBlockedReason || undefined}>Save draft</Button>
                    <Button variant="secondary" onClick={() => void publish('submitted')} loading={saving} disabled={Boolean(publishBlockedReason)} disabledReason={publishBlockedReason || undefined}>Submit Review</Button>
                    <Button variant="secondary" onClick={() => void publish('update_pending')} loading={saving} disabled={!state.id || Boolean(publishBlockedReason)} disabledReason={!state.id ? 'Save the skill before submitting an update.' : publishBlockedReason || undefined}>Submit Update</Button>
                    <Button variant="secondary" disabled disabledReason={reviewBackendReady ? undefined : 'Automated review decisions are not connected yet.'}>Approve Review</Button>
                    <Button variant="danger" onClick={() => setPendingDestructive({ type: 'unpublish' })} disabled={!state.id} disabledReason={!state.id ? 'Save the skill before unpublishing.' : undefined}>Unpublish</Button>
                    <Button onClick={() => void publish('published')} loading={saving} disabled={!canPublishLive || Boolean(publishBlockedReason)} disabledReason={!canPublishLive ? 'Live publishing requires enterprise publish permission.' : publishBlockedReason || undefined}>Publish public</Button>
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
