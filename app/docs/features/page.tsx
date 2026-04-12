import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';
import {
  FEATURE_SHOWCASE_CATEGORIES,
  PROJECT_DETAILS,
  RUNTIME_FUNCTION_CATALOG,
} from '@/src/catalog/feature-catalog';

const runtimeSections = Array.from(
  RUNTIME_FUNCTION_CATALOG.reduce((map, item) => {
    if (!map.has(item.categoryName)) {
      map.set(item.categoryName, [] as typeof RUNTIME_FUNCTION_CATALOG);
    }
    map.get(item.categoryName)?.push(item);
    return map;
  }, new Map<string, typeof RUNTIME_FUNCTION_CATALOG>())
).map(([name, items]) => ({ name, items }));

export default function FeatureCatalogPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <nav className="sticky top-0 z-40 backdrop-blur-md" style={{ background: 'rgba(10,10,20,0.85)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 flex items-center justify-center font-black font-mono text-xs"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--accent)', color: 'var(--accent)' }}>
              A
            </div>
            <span className="font-mono font-bold text-sm">Agent<span style={{ color: 'var(--accent)' }}>OS</span></span>
          </Link>
          <div className="flex items-center gap-5 text-sm">
            <Link href="/ops" className="transition-colors hover:text-white" style={{ color: 'var(--text-muted)' }}>Ops</Link>
            <Link href="/docs" className="transition-colors hover:text-white" style={{ color: 'var(--text-muted)' }}>Docs</Link>
            <Link href="/signup" className="btn-primary text-xs px-4 py-2">Get Started</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-12 space-y-12">
        <section>
          <div className="badge badge-accent mb-4">Plain-English Catalog</div>
          <h1 className="text-4xl font-black mb-4">Agent OS project details and every feature in one place</h1>
          <p className="text-lg max-w-4xl" style={{ color: 'var(--text-muted)' }}>
            This page lists every platform feature and runtime function, explains it in simple English, gives two real-world uses, and compares Agent OS to the closest alternative.
          </p>
        </section>

        <section className="grid lg:grid-cols-2 gap-4">
          <div className="card p-6">
            <h2 className="text-xl font-bold mb-3">Project Summary</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{PROJECT_DETAILS.summary}</p>
            <div className="space-y-2 text-sm">
              <div><strong>Audience:</strong> {PROJECT_DETAILS.audience}</div>
              <div><strong>Production path:</strong> {PROJECT_DETAILS.productionPath}</div>
            </div>
          </div>
          <div className="card p-6">
            <h2 className="text-xl font-bold mb-3">Stack</h2>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              {PROJECT_DETAILS.stack.map(item => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-xl font-bold mb-3">Why Agent OS stands out</h2>
          <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            {PROJECT_DETAILS.differentiators.map(item => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </section>

        <section className="space-y-8">
          <div>
            <h2 className="text-3xl font-black mb-2">Platform Features</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              These 70 platform features describe the full Agent OS product surface.
            </p>
          </div>

          {FEATURE_SHOWCASE_CATEGORIES.map(category => (
            <section key={category.key} className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="badge badge-accent text-xs">{category.badge}</span>
                <h3 className="text-2xl font-bold">{category.name}</h3>
              </div>
              <p className="text-sm max-w-4xl" style={{ color: 'var(--text-muted)' }}>{category.description}</p>
              <div className="space-y-4">
                {category.features.map(feature => (
                  <article key={feature.slug} className="card p-6">
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <span className="text-xs font-mono" style={{ color: 'var(--accent)' }}>#{feature.id}</span>
                      <h4 className="text-lg font-semibold">{feature.name}</h4>
                    </div>
                    <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{feature.details}</p>
                    <div className="grid lg:grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="font-semibold mb-2">Two real-world use cases</div>
                        <ul className="space-y-2" style={{ color: 'var(--text-muted)' }}>
                          {feature.useCases.map(useCase => (
                            <li key={useCase}>- {useCase}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="font-semibold mb-2">Immediate competitor</div>
                        <p style={{ color: 'var(--text-muted)' }}>{feature.competitor}</p>
                      </div>
                      <div>
                        <div className="font-semibold mb-2">How Agent OS stands out</div>
                        <p style={{ color: 'var(--text-muted)' }}>{feature.standout}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </section>

        <section className="space-y-8">
          <div>
            <h2 className="text-3xl font-black mb-2">Runtime Functions</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              These runtime functions are also covered by the autonomous crew, with one active agent and one standby agent per function.
            </p>
          </div>

          {runtimeSections.map(section => (
            <section key={section.name} className="space-y-4">
              <h3 className="text-2xl font-bold">{section.name}</h3>
              <div className="space-y-4">
                {section.items.map(feature => (
                  <article key={feature.slug} className="card p-6">
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>#{feature.id}</span>
                      <h4 className="text-lg font-semibold">{feature.name}</h4>
                    </div>
                    <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{feature.details}</p>
                    <div className="grid lg:grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="font-semibold mb-2">Two real-world use cases</div>
                        <ul className="space-y-2" style={{ color: 'var(--text-muted)' }}>
                          {feature.useCases.map(useCase => (
                            <li key={useCase}>- {useCase}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="font-semibold mb-2">Immediate competitor</div>
                        <p style={{ color: 'var(--text-muted)' }}>{feature.competitor}</p>
                      </div>
                      <div>
                        <div className="font-semibold mb-2">How Agent OS stands out</div>
                        <p style={{ color: 'var(--text-muted)' }}>{feature.standout}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </section>
      </div>

      <DocsFooter />
    </div>
  );
}
