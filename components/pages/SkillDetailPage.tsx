'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import SurfaceShell from '@/components/os/surface-shell';
import { ConfirmationDialog } from '@/components/os/ui';
import type { SkillMarketplaceRecord } from '@/src/skills/marketplace';
import { ListingBanner, ListingMark } from '@/components/marketplace/MarketplacePrimitives';

export type SkillDetailRecord = SkillMarketplaceRecord;

type SkillPreview = {
  inputExample: unknown;
  outputExample: unknown;
  executionExample: unknown;
  expectedResults: unknown;
};

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function stringList(values: string[]): string {
  return values.length ? values.join(', ') : 'None';
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
  const [skill, setSkill] = useState<SkillMarketplaceRecord | null>(initialSkill);
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

  const load = useCallback(async (withLoading = true) => {
    if (!slug) return;
    if (withLoading) setLoading(true);
    try {
      const [skillRes, previewRes] = await Promise.all([
        fetch(`/api/skills/${slug}`, { cache: 'no-store' }),
        fetch(`/api/skills/${slug}/preview`, { cache: 'no-store' }).catch(() => null),
      ]);
      const skillData = await skillRes.json().catch(() => ({}));
      const nextSkill = skillData.skill ?? null;
      const previewData = previewRes ? await previewRes.json().catch(() => ({})) : {};
      setSkill(nextSkill);
      setPreview(previewData.preview ?? null);
      if (nextSkill) setApprovedPermissions(nextSkill.permissions_required ?? []);
      if (nextSkill) {
        const refs = [...new Set([...(nextSkill.required_skills ?? []), ...(nextSkill.optional_skills ?? [])])];
        const dependencies = await Promise.all(refs.map(async ref => {
          const res = await fetch(`/api/skills/${encodeURIComponent(ref)}`, { cache: 'no-store' }).catch(() => null);
          const data = res?.ok ? await res.json().catch(() => ({})) : {};
          return data.skill ?? null;
        }));
        const records = dependencies.filter((item): item is SkillMarketplaceRecord => Boolean(item));
        setDependencyRecords(records);
        setDependencyPermissions(Object.fromEntries(records.map(item => [item.slug, item.permissions_required ?? []])));
      } else {
        setDependencyRecords([]);
        setDependencyPermissions({});
      }
    } catch {
      setSkill(null);
      setPreview(null);
    } finally {
      if (withLoading) setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (initialSkill && initialSkill.slug === slug) {
      setSkill(initialSkill);
      setApprovedPermissions(initialSkill.permissions_required ?? []);
      setLoading(false);
      void load(false);
      return;
    }
    void load(true);
  }, [initialSkill, load, slug]);

  const versionHistory = useMemo(() => {
    if (!skill) return [];
    const raw = skill.dependencies?.versionHistory;
    if (Array.isArray(raw)) return raw.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>;
    return [{ version: skill.version, notes: 'Current production release.', createdAt: skill.updated_at }];
  }, [skill]);

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
        : payload.error ?? payload.message ?? 'Install failed');
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
            <Link href="/skillstore" className="market-secondary-action">Back to Skill Store</Link>
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
                  <span>{(skill.compatibility ?? []).join(' / ')}</span>
                </div>
              </div>
              <div className="market-detail-actions">
                <button type="button" className="market-primary-action" disabled={installing} onClick={() => void install()}>
                  {installing ? 'Installing' : 'Install'}
                </button>
                <button type="button" className="market-secondary-action" disabled={working === 'use'} onClick={() => void useSkill()}>
                  {working === 'use' ? 'Using' : 'Use'}
                </button>
                <button type="button" className="market-secondary-action" disabled={working === 'save'} onClick={() => void saveAccess()}>
                  {working === 'save' ? 'Saving' : 'Manage'}
                </button>
                <button type="button" className="market-secondary-action danger" disabled={working === 'revoke'} onClick={() => setConfirmRevoke(true)}>
                  {working === 'revoke' ? 'Revoking' : 'Revoke Access'}
                </button>
              </div>
            </section>

            {message ? <div className="market-notice">{message}</div> : null}

            <section className="market-section">
              <div className="market-section-head"><h2>Overview</h2></div>
              <div className="market-info-grid">
                <div><span>Developer</span><strong>{skill.author_name}</strong></div>
                <div><span>Category</span><strong>{skill.category}</strong></div>
                <div><span>Installs</span><strong>{skill.total_installs.toLocaleString()}</strong></div>
                <div><span>Rating</span><strong>{skill.rating > 0 ? skill.rating.toFixed(1) : 'New'}</strong></div>
                <div><span>Website</span><strong>{skill.website_url ? <a href={skill.website_url} target="_blank" rel="noreferrer">Open</a> : 'Not published'}</strong></div>
                <div><span>Documentation</span><strong>{skill.documentation_url ? <a href={skill.documentation_url} target="_blank" rel="noreferrer">Open</a> : 'Not published'}</strong></div>
              </div>
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
                  const requiredPermissions = skill.permissions_required ?? [];
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
                {(skill.permissions_required ?? []).filter(permission => !['internet', 'browser', 'filesystem', 'external apis', 'wallet access', 'mcp access'].includes(permission.toLowerCase())).map(permission => (
                  <label key={permission} className="required">
                    <input type="checkbox" checked={approvedPermissions.includes(permission)} onChange={() => togglePermission(permission)} />
                    <span>{permission}</span>
                    <small>Required</small>
                  </label>
                ))}
              </div>
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Inputs & Outputs</h2></div>
              <div className="market-code-grid">
                <pre>{pretty((skill.inputs ?? []).length ? skill.inputs : preview?.inputExample ?? {})}</pre>
                <pre>{pretty((skill.outputs ?? []).length ? skill.outputs : preview?.outputExample ?? {})}</pre>
              </div>
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Execution Preview</h2></div>
              <div className="market-code-grid">
                <pre>{pretty(preview?.executionExample ?? { skill: skill.slug, capability: (skill.capabilities ?? [])[0]?.name ?? 'run' })}</pre>
                <pre>{pretty(preview?.expectedResults ?? { result: `Expected output from ${skill.name}` })}</pre>
              </div>
            </section>

            <section className="market-section">
              <div className="market-section-head"><h2>Examples</h2></div>
              {(skill.examples ?? []).length ? (
                <div className="market-code-grid">
                  {(skill.examples ?? []).map((example, index) => <pre key={index}>{pretty(example)}</pre>)}
                </div>
              ) : (
                <div className="market-empty compact"><p>No examples published.</p></div>
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
              <div className="market-section-head"><h2>Compatibility</h2></div>
              <div className="market-skill-tags">
                {(skill.compatibility ?? []).map(item => <span key={item}>{item}</span>)}
              </div>
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
              <div className="market-timeline">
                {((skill.changelog ?? []).length ? (skill.changelog ?? []).map((item, index) => ({
                  version: skill.version,
                  notes: item,
                  createdAt: skill.updated_at,
                  id: `${skill.id}-changelog-${index}`,
                })) : versionHistory).map((entry, index) => (
                  <article key={String(entry.version ?? index)}>
                    <strong>Version {String(entry.version ?? skill.version)}</strong>
                    <p>{String(entry.notes ?? ('changeSummary' in entry ? entry.changeSummary : undefined) ?? 'Release notes not provided.')}</p>
                    <span>{new Date(String(entry.createdAt ?? skill.updated_at)).toLocaleDateString()}</span>
                  </article>
                ))}
              </div>
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
