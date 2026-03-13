'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Skill {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  icon: string;
  published: boolean;
  total_installs: number;
  total_calls: number;
  rating: number;
  review_count: number;
  created_at: string;
}

const EMPTY_SKILL = {
  name: '',
  slug: '',
  category: 'Data & Analytics',
  description: '',
  long_description: '',
  icon: '📦',
  pricing_model: 'free',
  price_per_call: 0,
  free_tier_calls: 100,
  capabilities: '[\n  {\n    "name": "run",\n    "description": "Describe what this capability does",\n    "params": { "input": "string" },\n    "returns": "string"\n  }\n]',
  source_code: '// Your skill code here\nclass Skill {\n  run(params) {\n    return { result: params.input };\n  }\n}',
  primitives_required: [],
  tags: '',
  repository_url: '',
};

const CATEGORIES = [
  'Documents', 'Web & Browser', 'AI & ML', 'Finance & Crypto',
  'Communication', 'Data & Analytics', 'Cloud & Deploy', 'Security',
];

export default function DeveloperPage() {
  const [mySkills, setMySkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [showPublish, setShowPublish] = useState(false);
  const [form, setForm] = useState(EMPTY_SKILL);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [publishSuccess, setPublishSuccess] = useState('');

  useEffect(() => {
    const key = localStorage.getItem('apiKey') || '';
    setApiKey(key);
    if (key) fetchMySkills(key);
    else setLoading(false);
  }, []);

  const fetchMySkills = async (key: string) => {
    setLoading(true);
    try {
      // Decode agentId from JWT to use as author filter
      const payload = JSON.parse(atob(key.split('.')[1]));
      const agentId = payload.sub;
      const res = await fetch(`/api/skills?author=${agentId}`);
      const data = await res.json();
      setMySkills(data.skills ?? []);
    } catch {
      // JWT decode failed or fetch failed
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublishing(true);
    setPublishError('');
    setPublishSuccess('');

    let capabilitiesParsed;
    try {
      capabilitiesParsed = JSON.parse(form.capabilities);
    } catch {
      setPublishError('Capabilities must be valid JSON.');
      setPublishing(false);
      return;
    }

    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          category: form.category,
          description: form.description,
          long_description: form.long_description,
          icon: form.icon,
          pricing_model: form.pricing_model,
          price_per_call: form.price_per_call,
          free_tier_calls: form.free_tier_calls,
          capabilities: capabilitiesParsed,
          source_code: form.source_code,
          primitives_required: form.primitives_required,
          tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          repository_url: form.repository_url || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPublishError(data.error || 'Publishing failed');
      } else {
        setPublishSuccess(`Skill "${data.skill.name}" published successfully!`);
        setShowPublish(false);
        setForm(EMPTY_SKILL);
        fetchMySkills(apiKey);
      }
    } catch {
      setPublishError('Network error. Please try again.');
    } finally {
      setPublishing(false);
    }
  };

  const field = (label: string, node: React.ReactNode, hint?: string) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {node}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono font-bold text-lg text-gray-900">Agent OS</Link>
          <div className="flex items-center gap-6">
            <Link href="/marketplace" className="text-sm text-gray-500 hover:text-gray-900">Marketplace</Link>
            <Link href="/developer" className="text-sm font-medium text-blue-600">Developer</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Developer Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">Publish and manage your skills</p>
          </div>
          {apiKey && (
            <button
              onClick={() => { setShowPublish(!showPublish); setPublishError(''); setPublishSuccess(''); }}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              {showPublish ? 'Cancel' : '+ Publish Skill'}
            </button>
          )}
        </div>

        {/* No API key state */}
        {!apiKey && (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
            <div className="text-4xl mb-3">🔑</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Sign in to publish skills</h2>
            <p className="text-sm text-gray-500 mb-6">
              You need an Agent OS API key to publish skills to the marketplace.
            </p>
            <div className="flex justify-center gap-3">
              <Link href="/signup" className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                Get API Key
              </Link>
              <button
                onClick={() => {
                  const key = prompt('Paste your API key:');
                  if (key) { localStorage.setItem('apiKey', key); setApiKey(key); fetchMySkills(key); }
                }}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Enter API Key
              </button>
            </div>
          </div>
        )}

        {/* Publish form */}
        {apiKey && showPublish && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Publish a New Skill</h2>
            <form onSubmit={handlePublish} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {field('Skill Name *', (
                  <input type="text" required value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className={inputClass} placeholder="e.g. PDF Extractor" />
                ))}
                {field('Slug *', (
                  <input type="text" required value={form.slug}
                    onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                    className={inputClass} placeholder="e.g. pdf-extractor" />
                ), 'Lowercase letters, numbers, hyphens only')}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {field('Category *', (
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inputClass}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                ))}
                {field('Icon (emoji)', (
                  <input type="text" value={form.icon}
                    onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                    className={inputClass} placeholder="📦" maxLength={4} />
                ))}
              </div>
              {field('Short Description *', (
                <input type="text" required value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className={inputClass} placeholder="One sentence describing what this skill does" />
              ))}
              {field('Long Description', (
                <textarea rows={3} value={form.long_description}
                  onChange={e => setForm(f => ({ ...f, long_description: e.target.value }))}
                  className={inputClass} placeholder="Detailed description shown on the skill detail page" />
              ))}
              <div className="grid grid-cols-3 gap-4">
                {field('Pricing', (
                  <select value={form.pricing_model} onChange={e => setForm(f => ({ ...f, pricing_model: e.target.value }))} className={inputClass}>
                    <option value="free">Free</option>
                    <option value="usage">Usage-based</option>
                  </select>
                ))}
                {field('Price per Call ($)', (
                  <input type="number" min={0} step={0.001} value={form.price_per_call}
                    onChange={e => setForm(f => ({ ...f, price_per_call: parseFloat(e.target.value) || 0 }))}
                    className={inputClass} disabled={form.pricing_model === 'free'} />
                ))}
                {field('Free Tier Calls', (
                  <input type="number" min={0} value={form.free_tier_calls}
                    onChange={e => setForm(f => ({ ...f, free_tier_calls: parseInt(e.target.value) || 0 }))}
                    className={inputClass} />
                ))}
              </div>
              {field('Capabilities JSON *', (
                <textarea rows={8} required value={form.capabilities}
                  onChange={e => setForm(f => ({ ...f, capabilities: e.target.value }))}
                  className={`${inputClass} font-mono text-xs`}
                  placeholder='[{"name": "run", "description": "...", "params": {}, "returns": "string"}]' />
              ), 'JSON array of capability objects with name, description, params, returns')}
              {field('Source Code *', (
                <textarea rows={12} required value={form.source_code}
                  onChange={e => setForm(f => ({ ...f, source_code: e.target.value }))}
                  className={`${inputClass} font-mono text-xs`}
                  placeholder="class Skill {\n  run(params) {\n    return { result: 'hello' };\n  }\n}" />
              ), 'JavaScript class named Skill. Each capability method should match a capability name.')}
              {field('Tags (comma-separated)', (
                <input type="text" value={form.tags}
                  onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  className={inputClass} placeholder="data, json, transform" />
              ))}
              {field('Repository URL', (
                <input type="url" value={form.repository_url}
                  onChange={e => setForm(f => ({ ...f, repository_url: e.target.value }))}
                  className={inputClass} placeholder="https://github.com/..." />
              ))}

              {publishError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{publishError}</div>
              )}
              <button
                type="submit"
                disabled={publishing}
                className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {publishing ? 'Publishing...' : 'Publish to Marketplace'}
              </button>
            </form>
          </div>
        )}

        {publishSuccess && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            ✓ {publishSuccess}
          </div>
        )}

        {/* Skills list */}
        {apiKey && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Your Skills {!loading && <span className="text-gray-400 font-normal">({mySkills.length})</span>}
            </h2>

            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : mySkills.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
                <div className="text-4xl mb-3">🛠️</div>
                <h3 className="text-gray-700 font-medium mb-2">No skills published yet</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Build a skill and share it with the Agent OS community.
                </p>
                <button
                  onClick={() => setShowPublish(true)}
                  className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                >
                  Publish Your First Skill
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {mySkills.map(skill => (
                  <div key={skill.id} className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xl">{skill.icon || '📦'}</span>
                          <h3 className="font-semibold text-gray-900">{skill.name}</h3>
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{skill.category}</span>
                          {skill.published ? (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Published</span>
                          ) : (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Draft</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mb-3">{skill.description}</p>
                        <div className="flex items-center gap-5 text-sm">
                          <div>
                            <span className="text-gray-400">Installs</span>
                            <span className="ml-1.5 font-semibold text-gray-900">{skill.total_installs.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">API Calls</span>
                            <span className="ml-1.5 font-semibold text-gray-900">{skill.total_calls.toLocaleString()}</span>
                          </div>
                          {skill.rating > 0 && (
                            <div>
                              <span className="text-gray-400">Rating</span>
                              <span className="ml-1.5 font-semibold text-gray-900">
                                ⭐ {Number(skill.rating).toFixed(1)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <Link
                        href={`/marketplace/${skill.slug}`}
                        className="text-sm text-blue-600 hover:underline flex-shrink-0"
                      >
                        View →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Revenue sharing info */}
        {apiKey && (
          <div className="mt-10 bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="text-base font-semibold text-blue-900 mb-2">Revenue Sharing</h3>
            <p className="text-sm text-blue-800 leading-relaxed">
              Agent OS shares <strong>70% of all usage revenue</strong> with skill developers.
              Paid skills earn $0.001–$0.10 per API call. Earnings are paid monthly via Stripe.
              Free skills help grow your install count and reputation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
