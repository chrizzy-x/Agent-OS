'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Badge from '@/components/Badge';
import ResponsiveSidebar from '@/components/ResponsiveSidebar';
import { MARKETPLACE_CATEGORIES, getOfficialSkillCount } from '@/src/skills/official-catalog';

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
                Publish a skill →
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
                    {OFFICIAL_COUNT} official skills · {total > 0 ? `${total} total available` : 'community-built and verified'}
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
                      </div>
                    </div>

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
                        {skill.rating > 0 && <span>★ {Number(skill.rating).toFixed(1)}</span>}
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
  );
}

