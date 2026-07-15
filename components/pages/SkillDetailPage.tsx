'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import SurfaceShell from '@/components/os/surface-shell';
import { ConfirmationDialog } from '@/components/os/ui';
import { formatCountLabel, formatMetricCount, formatRatingLabel } from '@/src/data/discipline';
import type { SkillMarketplaceRecord } from '@/src/skills/marketplace';
import { ListingBanner, ListingMark } from '@/components/marketplace/MarketplacePrimitives';

export type SkillDetailRecord = SkillMarketplaceRecord & {
  reviews?: Array<Record<string, unknown>>;
};

type SkillPreview = {
  dataState?: 'published_example' | 'schema_only';
  inputExample?: unknown;
  outputExample?: unknown;
  executionExample?: unknown;
  expectedResults?: unknown;
};

function stringList(values: string[]): string {
  return values.length ? values.join(', ') : 'None';
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function pricingLabel(skill: Pick<SkillMarketplaceRecord, 'pricing_model' | 'price_per_call'>): string {
  const model = textValue(skill.pricing_model) || 'free';
  const price = Number(skill.price_per_call ?? 0);
  if (model === 'free') return 'Free';
  if (model === 'per_call' && Number.isFinite(price) && price > 0) return `$${price.toFixed(2)}/call`;
  if (!Number.isFinite(price) || price <= 0) return 'Usage priced';
  return model.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function mediaUrls(skill: SkillMarketplaceRecord): string[] {
  const gallery = skill.gallery ?? [];
  const assets = (skill.media_assets ?? [])
    .map(asset => textValue(asset.url ?? asset.src ?? asset.href))
    .filter(Boolean);
  return [...new Set([...gallery, ...assets])];
}

function exampleTaskLabels(skill: SkillMarketplaceRecord): string[] {
  return (skill.examples ?? [])
    .map(example => textValue(example.title ?? example.task ?? example.prompt ?? example.description ?? example.name))
    .filter(Boolean);
}

function schemaSummary(records: Array<Record<string, unknown>>, fallback: unknown): string[] {
  const source = records.length ? records : Array.isArray(fallback) ? fallback.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>> : [];
  return source.map((item, index) => {
    const name = textValue(item.name ?? item.key ?? item.field ?? item.type) || `Field ${index + 1}`;
    const description = textValue(item.description ?? item.label ?? item.summary);
    const required = item.required === true ? 'Required' : item.required === false ? 'Optional' : '';
    return [name, description, required].filter(Boolean).join(' - ');
  });
}

function compatibilityGroup(skill: SkillMarketplaceRecord, names: string[]): string[] {
  const values = skill.compatibility ?? [];
  return values.filter(item => names.some(name => item.toLowerCase().includes(name.toLowerCase())));
}

function CapabilityList({ skill }: { skill: SkillMarketplaceRecord }) {
  const capabilities = skill.capabilities ?? [];
  if (capabilities.length === 0) {
    return <div className="market-empty compact"><p>No capabilities published.</p></div>;
  }
  return (
    <div className="market-capability-list">
      {capabilities.map((capability, index) => (
        <article key={String(capability.name ?? index)}>
          <h3>{String(capability.name ?? 'Capability')}</h3>
          <p>{String(capability.description ?? 'No description published.')}</p>
          {capability.params ? <span>Inputs: {Object.keys(capability.params as Record<string, unknown>).join(', ') || 'None'}</span> : null}
          {capability.returns ? <span>Output: {String(capability.returns)}</span> : null}
        </article>
      ))}
    </div>
  );
}

export default function SkillDetailPage({ initialSkill = null }: { initialSkill?: SkillDetailRecord | null }) {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const [skill, setSkill] = useState<SkillDetailRecord | null>(initialSkill);
  const [preview, setPreview] = useState<SkillPreview | null>(null);
  const [loading, setLoading] = useState(initialSkill === null);
  const [installing, setInstalling] = useState(false);
  const [working, setWorking] = useState('');
  const [message, setMessage] = useState('');
  const [approvedPermissions, setApprovedPermissions] = useState<string[]>(initialSkill?.permissions_required ?? []);
  const [optionalDependencies, setOptionalDependencies] = useState<string[]>([]);
  const [dependencyRecords, setDependencyRecords] = useState<SkillMarketplaceRecord[]>([]);
  const [dependencyPermissions, setDependencyPermissions] = useState<Record<string, string[]>>({});
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const loadDependencyRecords = useCallback(async (nextSkill: SkillMarketplaceRecord | null) => {
    if (!nextSkill) {
      setDependencyRecords([]);
      setDependencyPermissions({});
      return;
    }
    const refs = [...new Set([...(nextSkill.required_skills ?? []), ...(nextSkill.optional_skills ?? [])])];
    const dependencies = await Promise.all(refs.map(async ref => {
      const res = await fetch(`/api/skills/${encodeURIComponent(ref)}`, { cache: 'no-store' }).catch(() => null);
      const data = res?.ok ? await res.json().catch(() => ({})) : {};
      return data.skill ?? null;
    }));
    const records = dependencies.filter((item): item is SkillMarketplaceRecord => Boolean(item));
    setDependencyRecords(records);
    setDependencyPermissions(Object.fromEntries(records.map(item => [item.slug, item.permissions_required ?? []])));
  }, []);

  const load = useCallback(async (withLoading = true) => {
    if (!slug) return;
    if (withLoading) setLoading(true);
    try {
      const skillRes = await fetch(`/api/skills/${slug}`, { cache: 'no-store' });
      const skillData = await skillRes.json().catch(() => ({}));
      const nextSkill = skillData.skill ?? null;
      setSkill(nextSkill);
      setPreview(null);
      if (nextSkill) setApprovedPermissions(nextSkill.permissions_required ?? []);
      await loadDependencyRecords(nextSkill);
    } catch {
      setSkill(null);
      setPreview(null);
    } finally {
      if (withLoading) setLoading(false);
    }
  }, [loadDependencyRecords, slug]);

  useEffect(() => {
    if (initialSkill && initialSkill.slug === slug) {
      setSkill(initialSkill);
      setApprovedPermissions(initialSkill.permissions_required ?? []);
      setPreview(null);
      setLoading(false);
      void loadDependencyRecords(initialSkill);
      return;
    }
    void load(true);
  }, [initialSkill, load, loadDependencyRecords, slug]);

  const versionHistory = useMemo(() => {
    if (!skill) return [];
    const raw = skill.dependencies?.versionHistory;
    if (Array.isArray(raw)) return raw.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>;
    return [];
  }, [skill]);

  const screenshots = useMemo(() => skill ? mediaUrls(skill) : [], [skill]);
  const requiredSecrets = useMemo(() => skill?.required_secrets ?? [], [skill]);
  const permissions = useMemo(() => skill?.permissions_required ?? [], [skill]);
  const inputSummaries = useMemo(() => schemaSummary(skill?.inputs ?? [], preview?.inputExample), [preview?.inputExample, skill?.inputs]);
  const outputSummaries = useMemo(() => schemaSummary(skill?.outputs ?? [], preview?.outputExample), [preview?.outputExample, skill?.outputs]);
  const exampleTasks = useMemo(() => skill ? exampleTaskLabels(skill) : [], [skill]);

  function togglePermission(permission: string) {
    setApprovedPermissions(current => current.includes(permission)
      ? current.filter(item => item !== permission)
      : [...current, permission]);
  }

  function toggleOptionalDependency(ref: string) {
    setOptionalDependencies(current => current.includes(ref)
      ? current.filter(item => item !== ref)
      : [...current, ref]);
  }

  function toggleDependencyPermission(ref: string, permission: string) {
    setDependencyPermissions(current => {
      const approved = current[ref] ?? [];
      return {
        ...current,
        [ref]: approved.includes(permission)
          ? approved.filter(item => item !== permission)
          : [...approved, permission],
      };
    });
  }

  async function install() {
    if (!skill) return;
    setInstalling(true);
    setMessage('');
    try {
      const response = await fetch('/api/skills/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: skill.slug,
          permissionsApproved: approvedPermissions,
          installDependencies: true,
          optionalDependencies,
          dependencyPermissionsApproved: dependencyPermissions,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok
        ? `${skill.name} installed. ${payload.dependenciesInstalled?.length ?? 0} dependencies resolved.`
        : payload.error ?? payload.message ?? 'Add skill failed');
    } finally {
      setInstalling(false);
    }
  }

  async function saveAccess() {
    if (!skill) return;
    setWorking('save');
    setMessage('');
    try {
      const response = await fetch(`/api/skills/${skill.slug}/installation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionsApproved: approvedPermissions, status: 'active' }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? 'Access updated.' : payload.error ?? payload.message ?? 'Access update failed');
    } finally {
      setWorking('');
    }
  }

  async function revokeAccess() {
    if (!skill) return;
    setWorking('revoke');
    setMessage('');
    try {
      const response = await fetch(`/api/skills/${skill.slug}/installation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionsApproved: [], status: 'disabled' }),
      });
      const payload = await response.json().catch(() => ({}));
      setApprovedPermissions([]);
      setMessage(response.ok ? 'Access revoked. Execution is blocked until permissions are approved again.' : payload.error ?? payload.message ?? 'Revoke failed');
    } finally {
      setWorking('');
    }
  }

  async function useSkill() {
    if (!skill) return;
    const capability = String((skill.capabilities ?? [])[0]?.name ?? '');
    if (!capability) {
      setMessage('No executable capability is published for this skill.');
      return;
    }
    setWorking('use');
    setMessage('');
    try {
      const response = await fetch('/api/skills/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_slug: skill.slug, capability, params: {} }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? 'Skill executed.' : payload.error ?? payload.message ?? 'Skill execution failed');
    } finally {
      setWorking('');
    }
  }

  return (
    <SurfaceShell activePath="/skillstore" title={skill?.name ?? 'Skill'} subtitle={skill?.description}>
      <div className="market-shell" data-surface="skill-detail">
        {loading ? (
          <div className="market-skeleton market-detail-skeleton" />
        ) : !skill ? (
          <div className="market-empty">
            <h2>Skill not found</h2>
            <p>This capability is private, unavailable, or unpublished.</p>
            <Link href="/skillstore" className="market-secondary-action" data-action="back">Back to Skill Store</Link>
          </div>
        ) : (
          <>
            <section className="market-detail-hero compact">
              <ListingBanner name={skill.name} imageUrl={skill.banner_url} className="market-detail-backdrop" />
              <ListingMark name={skill.name} imageUrl={skill.icon_url} className="market-detail-logo" />
              <div className="market-detail-copy">
                <Link href={`/developer/${skill.developer_handle}`} className="market-developer-link">{skill.author_name}</Link>
                <h2>{skill.name}</h2>
                <p>{skill.long_description || skill.description}</p>
                <div className="market-hero-meta">
                  <span>{skill.category}</span>
                  <span>Version {skill.version}</span>
                  <span>{pricingLabel(skill)}</span>
                  <span>{skill.verified ? 'SDK verified' : 'Verification not published'}</span>
                  <span>{(skill.compatibility ?? []).join(' / ')}</span>
                  <span>Updated {new Date(skill.updated_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="market-detail-actions">
                <button type="button" className="market-primary-action" data-action="add" disabled={installing} onClick={() => void install()}>
                  {installing ? 'Adding...' : 'Add skill'}
                </button>
                <button
                  type="button"
                  className="market-secondary-action"
                  data-action="open"
                  disabled={working === 'use' || !(skill.capabilities ?? [])[0]?.name}
                  title={!(skill.capabilities ?? [])[0]?.name ? 'No executable capability is published for this skill.' : undefined}
                  onClick={() => void useSkill()}
                >
                  {working === 'use' ? 'Running...' : 'Run skill'}
                </button>
                <button type="button" className="market-secondary-action" data-action="save" disabled={working === 'save'} onClick={() => void saveAccess()}>
                  {working === 'save' ? 'Saving...' : 'Save access'}
                </button>
                <button type="button" className="market-secondary-action danger" data-action="remove" disabled={working === 'revoke'} onClick={() => setConfirmRevoke(true)}>
                  {working === 'revoke' ? 'Revoking...' : 'Revoke access'}
                </button>
              </div>
            </section>

            {message ? <div className="market-notice">{message}</div> : null}

            <section className="market-section">
              <div className="market-section-head">
                <h2>Install Review</h2>
                <p>Review pricing, permissions, Vault needs, and supported surfaces before adding this skill to Library.</p>
              </div>
              <div className="market-info-grid">
                <div><span>Pricing</span><strong>{pricingLabel(skill)}</strong></div>
                <div><span>Permissions</span><strong>{permissions.length ? `${permissions.length} requested` : 'No special permissions requested'}</strong></div>
                <div><span>Vault</span><strong>{requiredSecrets.length ? `${requiredSecrets.length} secret ${requiredSecrets.length === 1 ? 'required' : 'requirements'}` : 'No Vault secret required'}</strong></div>
                <div><span>Supported Surfaces</span><strong>{stringList(skill.compatibility ?? [])}</strong></div>
                <div><span>Status</span><strong>{skill.published ? 'Published' : 'Unavailable'}</strong></div>
                <div><span>Verification</span><strong>{skill.verified ? 'SDK verified' : 'Verification not published'}</strong></div>
              </div>
            </section>

            <section className="market-section">
              <div className="market-info-grid">
                <div><span>Calls</span><strong>{formatMetricCount(skill.total_calls, 'No calls yet')}</strong></div>
                <div><span>Installs</span><strong>{formatCountLabel(skill.total_installs, 'install', 'installs')}</strong></div>
                <div><span>Rating</span><strong>{formatRatingLabel(skill.rating, skill.review_count)}</strong></div>
                <div><span>Reviews</span><strong>{formatCountLabel(skill.review_count, 'review', 'reviews')}</strong></div>
              </div>
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Overview</h2></div>
              <div className="market-info-grid">
                <div><span>Developer</span><strong>{skill.author_name}</strong></div>
                <div><span>Developer Handle</span><strong>@{skill.developer_handle}</strong></div>
                <div><span>Category</span><strong>{skill.category}</strong></div>
                <div><span>Version</span><strong>{skill.version}</strong></div>
                <div><span>Pricing</span><strong>{pricingLabel(skill)}</strong></div>
                <div><span>Last Updated</span><strong>{new Date(skill.updated_at).toLocaleDateString()}</strong></div>
                <div><span>Website</span><strong>{skill.website_url ? <a href={skill.website_url} target="_blank" rel="noreferrer">Open</a> : 'Not published'}</strong></div>
                <div><span>Documentation</span><strong>{skill.documentation_url ? <a href={skill.documentation_url} target="_blank" rel="noreferrer">Open</a> : 'Not published'}</strong></div>
              </div>
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Screenshots</h2><p>Published visuals and design attachments for this skill.</p></div>
              {screenshots.length ? (
                <div className="market-screenshot-row">
                  {screenshots.map((url, index) => (
                    <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" aria-label={`Open screenshot ${index + 1}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`${skill.name} screenshot ${index + 1}`} />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="market-empty compact"><p>No screenshots or design attachments published.</p></div>
              )}
            </section>

            {skill.video_url ? (
              <section className="market-section">
                <div className="market-section-head"><h2>Video</h2></div>
                <div className="market-video-frame">
                  <a href={skill.video_url} target="_blank" rel="noreferrer">Open skill video</a>
                </div>
              </section>
            ) : null}

            <section className="market-section">
              <div className="market-section-head"><h2>Capabilities</h2></div>
              <CapabilityList skill={skill} />
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Permissions</h2><p>Review access before installation or execution.</p></div>
              <div className="market-permission-grid">
                {['Internet', 'Browser', 'Filesystem', 'External APIs', 'Wallet Access', 'MCP Access'].map(permission => {
                  const requiredPermissions = permissions;
                  const actualPermission = requiredPermissions.find(item => item.toLowerCase() === permission.toLowerCase()) ?? permission;
                  const declared = actualPermission !== permission || requiredPermissions.includes(permission);
                  return (
                    <label key={permission} className={declared ? 'required' : ''}>
                      <input
                        type="checkbox"
                        checked={approvedPermissions.includes(actualPermission)}
                        onChange={() => togglePermission(actualPermission)}
                        disabled={!declared}
                      />
                      <span>{permission}</span>
                      <small>{declared ? 'Required' : 'Not requested'}</small>
                    </label>
                  );
                })}
                {permissions.filter(permission => !['internet', 'browser', 'filesystem', 'external apis', 'wallet access', 'mcp access'].includes(permission.toLowerCase())).map(permission => (
                  <label key={permission} className="required">
                    <input type="checkbox" checked={approvedPermissions.includes(permission)} onChange={() => togglePermission(permission)} />
                    <span>{permission}</span>
                    <small>Required</small>
                  </label>
                ))}
              </div>
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Vault Requirements</h2><p>Secrets stay in Vault and are never copied into normal skill context.</p></div>
              {requiredSecrets.length ? (
                <div className="market-skill-tags">
                  {requiredSecrets.map(secret => <span key={secret}>{secret}</span>)}
                </div>
              ) : (
                <div className="market-empty compact"><p>No Vault secret required.</p></div>
              )}
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Inputs & Outputs</h2></div>
              {(inputSummaries.length || outputSummaries.length) ? (
                <div className="market-info-grid">
                  <div><span>Inputs</span><strong>{inputSummaries.length ? inputSummaries.join(', ') : 'No input schema published.'}</strong></div>
                  <div><span>Outputs</span><strong>{outputSummaries.length ? outputSummaries.join(', ') : 'No output schema published.'}</strong></div>
                </div>
              ) : (
                <div className="market-empty compact"><p>No input or output schema published.</p></div>
              )}
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Execution Preview</h2></div>
              {preview?.executionExample || preview?.expectedResults ? (
                <div className="market-info-grid">
                  <div><span>Request Example</span><strong>{preview?.executionExample ? 'Published' : 'Not published'}</strong></div>
                  <div><span>Expected Result</span><strong>{preview?.expectedResults ? 'Published' : 'Run the skill to produce real output.'}</strong></div>
                </div>
              ) : (
                <div className="market-empty compact"><p>No execution preview published. Run the skill after install to produce real output.</p></div>
              )}
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Example Tasks</h2></div>
              {exampleTasks.length ? (
                <div className="market-info-grid">
                  {exampleTasks.map((example, index) => (
                    <div key={`${example}-${index}`}><span>Task {index + 1}</span><strong>{example}</strong></div>
                  ))}
                </div>
              ) : (
                <div className="market-empty compact"><p>No example tasks published.</p></div>
              )}
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Dependencies</h2></div>
              <div className="market-dependency-grid">
                <div><span>Required Skills</span><strong>{stringList(skill.required_skills ?? [])}</strong></div>
                <div>
                  <span>Optional Skills</span>
                  {(skill.optional_skills ?? []).length ? (skill.optional_skills ?? []).map(ref => (
                    <label key={ref}>
                      <input type="checkbox" checked={optionalDependencies.includes(ref)} onChange={() => toggleOptionalDependency(ref)} />
                      {ref}
                    </label>
                  )) : <strong>None</strong>}
                </div>
                <div><span>Automatic Resolution</span><strong>Required dependencies install with this skill.</strong></div>
              </div>
              {dependencyRecords.length ? (
                <div className="market-dependency-review">
                  {dependencyRecords.map(dependency => {
                    const active = (skill.required_skills ?? []).includes(dependency.slug) || optionalDependencies.includes(dependency.slug) || optionalDependencies.includes(dependency.id);
                    return (
                      <article key={dependency.id}>
                        <div>
                          <strong>{dependency.name}</strong>
                          <p>{dependency.description}</p>
                        </div>
                        <div>
                          {(dependency.permissions_required ?? []).length ? (dependency.permissions_required ?? []).map(permission => (
                            <label key={`${dependency.slug}-${permission}`}>
                              <input
                                type="checkbox"
                                checked={(dependencyPermissions[dependency.slug] ?? []).includes(permission)}
                                disabled={!active}
                                onChange={() => toggleDependencyPermission(dependency.slug, permission)}
                              />
                              {permission}
                            </label>
                          )) : <span>No permissions requested</span>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Supported Surfaces</h2></div>
              {(skill.compatibility ?? []).length ? (
                <div className="market-skill-tags">
                  {(skill.compatibility ?? []).map(item => <span key={item}>{item}</span>)}
                </div>
              ) : (
                <div className="market-empty compact"><p>No supported surfaces published.</p></div>
              )}
            </section>

            {[
              ['Compatible Apps', compatibilityGroup(skill, ['app'])],
              ['Compatible Agents', compatibilityGroup(skill, ['agent', 'subagent', 'super agentos'])],
              ['Compatible Workflows', compatibilityGroup(skill, ['workflow'])],
            ].map(([title, values]) => (
              <section key={String(title)} className="market-section">
                <div className="market-section-head"><h2>{String(title)}</h2></div>
                {(values as string[]).length ? (
                  <div className="market-skill-tags">
                    {(values as string[]).map(item => <span key={`${title}-${item}`}>{item}</span>)}
                  </div>
                ) : (
                  <div className="market-empty compact"><p>No compatibility records published.</p></div>
                )}
              </section>
            ))}

            <section className="market-section">
              <div className="market-section-head"><h2>Release Notes</h2></div>
              <div className="market-release-panel">
                <p>{skill.release_notes || 'Release notes not provided.'}</p>
              </div>
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Version History</h2></div>
              {((skill.changelog ?? []).length || versionHistory.length) ? (
                <div className="market-timeline">
                  {((skill.changelog ?? []).length ? (skill.changelog ?? []).map((item, index) => ({
                    version: skill.version,
                    notes: item,
                    createdAt: skill.updated_at,
                    id: `${skill.id}-changelog-${index}`,
                  })) : versionHistory).map((entry, index) => (
                    <article key={String(entry.id ?? `${entry.version ?? skill.version}-${index}`)}>
                      <strong>Version {String(entry.version ?? skill.version)}</strong>
                      <p>{String(entry.notes ?? ('changeSummary' in entry ? entry.changeSummary : undefined) ?? 'Release notes not provided.')}</p>
                      <span>{new Date(String(entry.createdAt ?? skill.updated_at)).toLocaleDateString()}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="market-empty compact"><p>No version history published.</p></div>
              )}
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Reviews</h2></div>
              {(skill.reviews ?? []).length ? (
                <div className="market-timeline">
                  {(skill.reviews ?? []).map((review, index) => (
                    <article key={String(review.id ?? `${skill.slug}-review-${index}`)}>
                      <strong>{textValue(review.author ?? review.user ?? 'Reviewer')}</strong>
                      <p>{textValue(review.body ?? review.comment ?? review.summary) || 'No review text published.'}</p>
                      <span>{textValue(review.rating) ? `${textValue(review.rating)} rating` : 'Rating not published'}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="market-empty compact"><p>No public reviews yet.</p></div>
              )}
            </section>
          </>
        )}
      </div>
      <ConfirmationDialog
        open={confirmRevoke}
        title="Revoke skill access"
        body={`Revoke all approved permissions for ${skill?.name ?? 'this skill'}?`}
        confirmLabel="Revoke"
        busy={working === 'revoke'}
        onCancel={() => setConfirmRevoke(false)}
        onConfirm={() => {
          setConfirmRevoke(false);
          void revokeAccess();
        }}
      />
    </SurfaceShell>
  );
}
