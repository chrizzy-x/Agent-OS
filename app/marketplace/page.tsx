'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const CATEGORIES = [
  'All',
  'Documents',
  'Web & Browser',
  'AI & ML',
  'Finance & Crypto',
  'Communication',
  'Data & Analytics',
  'Cloud & Deploy',
  'Security',
];

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
      const params = new URLSearchParams({ sort });
      if (category !== 'All') params.set('category', category);
      if (searchTerm !== undefined ? searchTerm : search) {
        params.set('search', searchTerm !== undefined ? searchTerm : search);
      }
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

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSkills(search);
  };

  const pricingLabel = (skill: Skill) => {
    if (skill.pricing_model === 'free') return 'Free';
    return `$${skill.price_per_call}/call`;
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Nav */}
      <nav className="sticky top-0 z-40 backdrop-blur-md"
        style={{ background: 'rgba(10,10,20,0.85)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black font-mono text-xs"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 0 12px rgba(124,58,237,0.4)' }}>
              A
            </div>
            <span className="font-mono font-bold text-sm">Agent<span className="gradient-text">OS</span></span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/marketplace" className="text-sm font-medium" style={{ color: '#a855f7' }}>Marketplace</Link>
            <Link href="/developer" className="text-sm transition-colors hover:text-white" style={{ color: 'var(--text-muted)' }}>Developer</Link>
            <Link href="/docs" className="text-sm transition-colors hover:text-white" style={{ color: 'var(--text-muted)' }}>Docs</Link>
            <Link href="/signup" className="btn-primary text-xs px-4 py-2">Get Started</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="badge badge-purple mb-4">Community Skills</div>
          <h1 className="text-3xl font-black mb-2">
            Skills <span className="gradient-text">Marketplace</span>
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Extend Agent OS with community-built skills.
            {total > 0 && <span className="ml-1">{total} skills available.</span>}
          </p>
        </div>

        {/* Search + Sort */}
        <form onSubmit={handleSearch} className="flex gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search skills..."
            className="input-dark flex-1"
          />
          <button type="submit" className="btn-primary px-5">Search</button>
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="input-dark"
            style={{ width: 'auto', paddingRight: '2rem' }}
          >
            <option value="popular">Most Popular</option>
            <option value="recent">Newest</option>
            <option value="rating">Highest Rated</option>
          </select>
        </form>

        {/* Category filter */}
        <div className="flex gap-2 flex-wrap mb-8">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={category === cat ? {
                background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                color: 'white',
                border: '1px solid rgba(139,92,246,0.5)',
              } : {
                background: 'transparent',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-bright)',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Skills grid */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="w-10 h-10 rounded-lg mb-3" style={{ background: 'var(--surface-2)' }} />
                <div className="h-4 rounded w-3/4 mb-2" style={{ background: 'var(--surface-2)' }} />
                <div className="h-3 rounded w-full mb-1" style={{ background: 'var(--border)' }} />
                <div className="h-3 rounded w-2/3" style={{ background: 'var(--border)' }} />
              </div>
            ))}
          </div>
        ) : skills.length === 0 ? (
          <div className="card p-20 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <p className="font-medium mb-1">No skills found</p>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Try a different search or category.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {skills.map(skill => (
              <Link
                key={skill.id}
                href={`/marketplace/${skill.slug}`}
                className="card p-5 block group"
                style={{ textDecoration: 'none' }}
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-3xl">{skill.icon || '📦'}</span>
                  <div className="flex items-center gap-1.5">
                    {skill.verified && (
                      <span className="badge badge-green text-xs">✓ Official</span>
                    )}
                    <span className="badge badge-purple text-xs">{skill.category}</span>
                  </div>
                </div>

                <h3 className="font-semibold mb-1 transition-colors group-hover:text-purple-400">
                  {skill.name}
                </h3>
                <p className="text-sm mb-3 line-clamp-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {skill.description}
                </p>

                <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                  <div className="flex items-center gap-3">
                    {skill.rating > 0 && (
                      <span className="flex items-center gap-0.5">
                        ⭐ {Number(skill.rating).toFixed(1)}
                        {skill.review_count > 0 && <span className="ml-0.5">({skill.review_count})</span>}
                      </span>
                    )}
                    <span>{skill.total_installs.toLocaleString()} installs</span>
                  </div>
                  <span className="font-semibold" style={{ color: skill.pricing_model === 'free' ? '#22c55e' : '#a855f7' }}>
                    {pricingLabel(skill)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
