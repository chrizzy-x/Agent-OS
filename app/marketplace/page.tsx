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
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono font-bold text-lg text-gray-900">Agent OS</Link>
          <div className="flex items-center gap-6">
            <Link href="/marketplace" className="text-sm font-medium text-blue-600">Marketplace</Link>
            <Link href="/developer" className="text-sm text-gray-500 hover:text-gray-900">Developer</Link>
            <Link href="/signup" className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Skills Marketplace</h1>
          <p className="text-gray-500">
            Extend Agent OS with community-built skills.
            {total > 0 && <span className="ml-1 text-gray-400">{total} skills available.</span>}
          </p>
        </div>

        {/* Search + Sort */}
        <form onSubmit={handleSearch} className="flex gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search skills..."
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="submit"
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Search
          </button>
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                category === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Skills grid */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
                <div className="w-10 h-10 bg-gray-200 rounded-lg mb-3" />
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-full mb-1" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : skills.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <div className="text-4xl mb-3">🔍</div>
            <p className="font-medium">No skills found</p>
            <p className="text-sm mt-1">Try a different search or category.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {skills.map(skill => (
              <Link
                key={skill.id}
                href={`/marketplace/${skill.slug}`}
                className="group bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-3xl">{skill.icon || '📦'}</span>
                  <div className="flex items-center gap-1.5">
                    {skill.verified && (
                      <span title="Verified by Agent OS" className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                        ✓ Official
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">
                      {skill.category}
                    </span>
                  </div>
                </div>

                <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                  {skill.name}
                </h3>
                <p className="text-sm text-gray-500 mb-3 line-clamp-2 leading-relaxed">
                  {skill.description}
                </p>

                <div className="flex items-center justify-between text-xs text-gray-400">
                  <div className="flex items-center gap-3">
                    {skill.rating > 0 && (
                      <span className="flex items-center gap-0.5">
                        ⭐ {Number(skill.rating).toFixed(1)}
                        {skill.review_count > 0 && <span className="text-gray-300 ml-0.5">({skill.review_count})</span>}
                      </span>
                    )}
                    <span>{skill.total_installs.toLocaleString()} installs</span>
                  </div>
                  <span className={`font-semibold ${skill.pricing_model === 'free' ? 'text-green-600' : 'text-blue-600'}`}>
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
