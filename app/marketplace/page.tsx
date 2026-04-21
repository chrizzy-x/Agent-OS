'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Badge from '@/components/Badge';
import ResponsiveSidebar from '@/components/ResponsiveSidebar';
import { MARKETPLACE_CATEGORIES, getOfficialSkillCount } from '@/src/skills/official-catalog';

interface SecurityScore {
  skill_id: string;
  aggregate_score: number | null;
  risk_flags: string[];
  llm_summary: string | null;
}

interface Skill {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  icon: string;
  pricing_model: string;
  price_per_call: number;
  free_tier_calls: number;
  total_installs: number;
  rating: number;
  review_count: number;
  author_name: string;
  verified: boolean;
  tags: string[];
  security_score?: SecurityScore | null;
}

const OFFICIAL_COUNT = getOfficialSkillCount();

const SORT_OPTIONS = [
  { value: 'popular', label: 'Most Popular' },
  { value: 'recent', label: 'Newest' },
  { value: 'rating', label: 'Highest Rated' },
];

export default function MarketplacePage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('popular');
  const [total, setTotal] = useState(0);
  const [scoreModal, setScoreModal] = useState<SecurityScore | null>(null);

  const fetchSkills = useCallback(async (searchTerm?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort, limit: '50' });
      if (category !== 'All') params.set('category', category);
      const term = searchTerm !== undefined ? searchTerm : search;
      if (term) params.set('search', term);
      const res = await fetch(`/api/skills?${params}`);
      const data = await res.json();
      setSkills(data.skills ?? []);
      setTotal(data.pagination?.total ?? 0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [category, sort, search]);

  useEffect(() => { void fetchSkills(); }, [fetchSkills]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchSkills(search);
  };

  const pricingLabel = (skill: Skill) => {
    if (skill.pricing_model === 'free') return 'Free';
    return `$${skill.price_per_call}/call`;
  };

  return (
    <>
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      <Nav activePath="/marketplace" />

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
        <div className="sidebar-layout" style={{ paddingTop: '40px' }}>

          {/* Left sidebar */}
          <ResponsiveSidebar
            label="Categories"
            panelClassName="marketplace-sidebar-panel"
            panelStyle={{
              width: '200px',
              flexShrink: 0,
              position: 'sticky',
              top: '72px',
              alignSelf: 'flex-start',
              maxHeight: 'calc(100vh - 80px)',
              overflowY: 'auto',
              borderRight: '1px solid var(--border)',
              paddingRight: '24px',
              marginRight: '32px',
            }}
          >
            <div style={{
              fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
              fontSize: '10px',
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '8px',
            }}>Categories</div>
            {MARKETPLACE_CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  borderLeft: category === cat ? '2px solid var(--accent)' : '2px solid transparent',
                  padding: '7px 12px',
                  fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                  fontSize: '13px',
                  color: category === cat ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'color 150ms, border-color 150ms',
                  marginBottom: '1px',
                }}
                onMouseEnter={e => {
                  if (cat !== category) {
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                    (e.currentTarget as HTMLButtonElement).style.borderLeftColor = 'var(--border-active)';
                  }
                }}
                onMouseLeave={e => {
                  if (cat !== category) {
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                    (e.currentTarget as HTMLButtonElement).style.borderLeftColor = 'transparent';
                  }
                }}
              >
                {cat}
              </button>
            ))}

            <div style={{
              borderTop: '1px solid var(--border)',
              marginTop: '24px',
              paddingTop: '24px',
            }}>
              <Link href="/developer" className="btn-ghost" style={{
                display: 'block',
                textAlign: 'center',
                padding: '8px 12px',
                fontSize: '12px',
                textDecoration: 'none',
              }}>
                Publish a skill â†’
              </Link>
            </div>
          </ResponsiveSidebar>

          {/* Main content */}
          <main style={{ flex: 1, minWidth: 0, paddingBottom: '80px' }}>
            {/* Header */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                <div>
                  <Badge variant="accent" style={{ marginBottom: '12px' }}>Community Skills</Badge>
                  <h1 style={{
                    fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                    fontSize: '28px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: '8px',
                    marginTop: '8px',
                    lineHeight: 1.2,
                  }}>Skills Marketplace</h1>
                  <p style={{
                    fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                    fontSize: '14px',
                    color: 'var(--text-secondary)',
                    margin: 0,
                  }}>
                    {OFFICIAL_COUNT} official skills Â· {total > 0 ? `${total} total available` : 'community-built and verified'}
                  </p>
                </div>
              </div>
            </div>

            {/* Search + sort */}
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <svg
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                  width="14" height="14" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" viewBox="0 0 24 24"
                >
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search skills..."
                  className="input-dark"
                  style={{ paddingLeft: '36px' }}
                />
              </div>
              <button type="submit" className="btn-primary" style={{ padding: '10px 20px', flexShrink: 0 }}>Search</button>
            </form>

            {/* Sort tabs */}
            <div style={{
              display: 'flex',
              gap: '0',
              borderBottom: '1px solid var(--border)',
              marginBottom: '24px',
            }}>
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSort(opt.value)}
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: sort === opt.value ? '2px solid var(--accent)' : '2px solid transparent',
                    padding: '10px 16px',
                    fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: sort === opt.value ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'color 150ms, border-color 150ms',
                    marginBottom: '-1px',
                  }}
                  onMouseEnter={e => { if (opt.value !== sort) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
                  onMouseLeave={e => { if (opt.value !== sort) (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Skills grid */}
            {loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1px', border: '1px solid var(--border)', backgroundColor: 'var(--border)' }}>
                {[...Array(6)].map((_, i) => (
                  <div key={i} style={{ padding: '24px', backgroundColor: 'var(--bg-secondary)' }}>
                    <div style={{ width: '40px', height: '40px', background: 'var(--bg-tertiary)', marginBottom: '12px' }} />
                    <div style={{ height: '14px', background: 'var(--bg-tertiary)', width: '75%', marginBottom: '8px' }} />
                    <div style={{ height: '12px', background: 'var(--border)', width: '100%', marginBottom: '6px' }} />
                    <div style={{ height: '12px', background: 'var(--border)', width: '60%' }} />
                  </div>
                ))}
              </div>
            ) : skills.length === 0 ? (
              <div style={{
                padding: '80px 40px',
                textAlign: 'center',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-secondary)',
              }}>
                <p style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '14px', color: 'var(--text-primary)', marginBottom: '8px', fontWeight: 600 }}>No skills found</p>
                <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', color: 'var(--text-secondary)' }}>Try a different search or category.</p>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '1px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--border)',
              }}>
                {skills.map(skill => (
                  <Link
                    key={skill.id}
                    href={`/marketplace/${skill.slug}`}
                    style={{
                      display: 'block',
                      padding: '24px',
                      backgroundColor: 'var(--bg-secondary)',
                      textDecoration: 'none',
                      transition: 'background-color 200ms',
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLAnchorElement;
                      el.style.backgroundColor = 'var(--bg-tertiary)';
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLAnchorElement;
                      el.style.backgroundColor = 'var(--bg-secondary)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px', gap: '8px' }}>
                      <span style={{ fontSize: '28px', lineHeight: 1 }}>{skill.icon || '[]'}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {skill.verified && <Badge variant="accent">Official</Badge>}
                        <Badge variant="dim">{skill.category}</Badge>
                        {(() => {
                          const sc = skill.security_score;
                          const score = sc?.aggregate_score;
                          if (score == null) return (
                            <button onClick={e => { e.preventDefault(); }}
                              style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.3)', cursor: 'default' }}>
                              unscored
                            </button>
                          );
                          const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
                          const bg = score >= 80 ? 'rgba(34,197,94,0.12)' : score >= 50 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';
                          const border = score >= 80 ? 'rgba(34,197,94,0.3)' : score >= 50 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)';
                          const dot = score >= 80 ? '🟢' : score >= 50 ? '🟡' : '🔴';
                          return (
                            <button onClick={e => { e.preventDefault(); if (sc) setScoreModal(sc); }}
                              style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: bg, color, border: `1px solid ${border}`, cursor: 'pointer', fontWeight: 600 }}>
                              {dot} {Math.round(score)}
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                    {skill.security_score?.aggregate_score != null && skill.security_score.aggregate_score < 40 && (
                      <div style={{ marginBottom: '8px', padding: '6px 10px', borderRadius: '6px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', fontSize: '11px', color: '#fcd34d' }}>
                        ⚠ Pending security review
                      </div>
                    )}

                    <h3 style={{
                      fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      marginBottom: '8px',
                      marginTop: 0,
                    }}>{skill.name}</h3>

                    <p style={{
                      fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.6,
                      marginBottom: '16px',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>{skill.description}</p>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{
                        fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                        fontSize: '12px',
                        color: 'var(--text-tertiary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}>
                        {skill.rating > 0 && <span>â˜… {Number(skill.rating).toFixed(1)}</span>}
                        <span>{skill.total_installs.toLocaleString()} installs</span>
                      </div>
                      <span style={{
                        fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: skill.pricing_model === 'free' ? 'var(--accent)' : 'var(--text-primary)',
                      }}>{pricingLabel(skill)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>

      {scoreModal && (
        <div
          onClick={() => setScoreModal(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '28px', maxWidth: '420px', width: '100%' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, margin: 0 }}>Security Score</h3>
              <button onClick={() => setScoreModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
            </div>
            {(() => {
              const score = scoreModal.aggregate_score ?? 0;
              const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
              return (
                <>
                  <div style={{ fontSize: '48px', fontWeight: 900, color, marginBottom: '16px', fontFamily: 'var(--font-mono)' }}>
                    {Math.round(score)}
                    <span style={{ fontSize: '18px', color: 'var(--text-muted)', fontWeight: 400 }}>/100</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                    {[
                      { label: 'Static Analysis', key: 'static_score' },
                      { label: 'Sandbox Run', key: 'sandbox_score' },
                      { label: 'LLM Review', key: 'llm_score' },
                    ].map(item => {
                      const val = (scoreModal as unknown as Record<string, number | null>)[item.key];
                      return (
                        <div key={item.key} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{item.label}</div>
                          <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                            {val != null ? Math.round(val * 100) : '—'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {scoreModal.risk_flags && scoreModal.risk_flags.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Flags</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {scoreModal.risk_flags.map(flag => (
                          <span key={flag} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)' }}>
                            {flag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {scoreModal.llm_summary && (
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>LLM Review</div>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{scoreModal.llm_summary}</p>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}
