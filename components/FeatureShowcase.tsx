'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FEATURE_SHOWCASE_CATEGORIES } from '@/src/catalog/feature-catalog';

export function FeatureShowcase() {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(FEATURE_SHOWCASE_CATEGORIES[0]?.key ?? null);
  const [featureDescriptions, setFeatureDescriptions] = useState<Record<string, string>>({});
  const [loadingFeature, setLoadingFeature] = useState<string | null>(null);

  const totalFeatures = FEATURE_SHOWCASE_CATEGORIES.reduce((acc, category) => acc + category.features.length, 0);

  const generateDescription = async (featureSlug: string, featureName: string, shortDesc: string) => {
    if (featureDescriptions[featureSlug]) {
      return;
    }

    setLoadingFeature(featureSlug);
    try {
      const response = await fetch('/api/generate-feature-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureName, shortDesc }),
      });
      const data = await response.json();
      if (response.ok && typeof data.description === 'string') {
        setFeatureDescriptions(current => ({ ...current, [featureSlug]: data.description }));
      }
    } catch {
      // Fall back to the static description.
    } finally {
      setLoadingFeature(null);
    }
  };

  return (
    <div className="mb-24">
      <div className="text-center mb-12">
        <div className="badge badge-accent mb-4">Canonical Catalog</div>
        <h2 className="text-5xl font-black mb-4">
          {totalFeatures} Platform Features<br />
          <span style={{ color: 'var(--accent)' }}>mapped to one shared source</span>
        </h2>
        <p className="text-lg max-w-3xl mx-auto" style={{ color: 'var(--text-muted)' }}>
          The landing page, docs, and autonomous crew all read from the same catalog so product claims and operational coverage stay aligned.
        </p>
      </div>

      <div className="space-y-4">
        {FEATURE_SHOWCASE_CATEGORIES.map(category => {
          const expanded = expandedCategory === category.key;
          return (
            <section key={category.key} className="card overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedCategory(expanded ? null : category.key)}
                className="w-full p-6 flex items-center justify-between text-left"
              >
                <div>
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className="badge badge-accent text-xs">{category.badge}</span>
                    <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
                      {category.features.length} features
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold mb-1">{category.name}</h3>
                  <p className="text-sm max-w-3xl" style={{ color: 'var(--text-muted)' }}>{category.description}</p>
                </div>
                <span className="text-sm font-mono" style={{ color: expanded ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {expanded ? 'collapse' : 'expand'}
                </span>
              </button>

              {expanded && (
                <div className="border-t px-6 py-6 grid md:grid-cols-2 gap-4" style={{ borderColor: 'var(--border)' }}>
                  {category.features.map(feature => (
                    <article key={feature.slug} className="rounded-xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="text-xs font-mono mb-1" style={{ color: 'var(--accent)' }}>#{feature.id}</div>
                          <h4 className="font-semibold text-base">{feature.name}</h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => generateDescription(feature.slug, feature.name, feature.short)}
                          disabled={loadingFeature === feature.slug || Boolean(featureDescriptions[feature.slug])}
                          className="btn-outline text-xs px-3 py-1.5"
                        >
                          {loadingFeature === feature.slug ? 'Loading' : featureDescriptions[feature.slug] ? 'AI ready' : 'Learn more'}
                        </button>
                      </div>
                      <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
                        {featureDescriptions[feature.slug] ?? feature.short}
                      </p>
                      <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                        Competitor: {feature.competitor}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="mt-10 text-center">
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Need the full plain-English breakdown with use cases and competitive context?
        </p>
        <Link href="/docs/features" className="btn-primary px-6 py-3 rounded-lg inline-flex">
          Open Full Feature Catalog
        </Link>
      </div>
    </div>
  );
}
