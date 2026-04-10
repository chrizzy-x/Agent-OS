import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';
import { APP_URL } from '@/lib/config';
import { getFeatureCoverageSummary } from '@/src/catalog/feature-catalog';

type AuditFinding = {
  severity: 'P2' | 'P3';
  status: 'Resolved' | 'Open';
  surface: string;
  observed: string;
  risk: string;
  recommendation: string;
};

const coverage = getFeatureCoverageSummary();

const findings: AuditFinding[] = [
  {
    severity: 'P2',
    status: 'Resolved',
    surface: `${APP_URL}/api/ops/crew`,
    observed: 'Anonymous callers could enumerate the full 102-item active and standby crew matrix, including per-item topology and queue state.',
    risk: 'That exposed more control-plane inventory than a public health surface should reveal.',
    recommendation: 'Keep public ops access summary-only. Require an ops-admin bearer token for per-item matrix details, failovers, and incident history. This fix is already live.',
  },
  {
    severity: 'P3',
    status: 'Resolved',
    surface: `${APP_URL}/docs/api`,
    observed: 'The API reference documented stale signup and health contracts that no longer matched the live routes.',
    risk: 'Developers could copy invalid request payloads or expect fields that the live API does not return.',
    recommendation: 'Document only the route contracts that were re-verified against production. This fix is already live.',
  },
];

const verifiedRoutes = [
  `${APP_URL}/health -> 200`,
  `${APP_URL}/studio -> 200`,
  `${APP_URL}/ops -> 200`,
  `${APP_URL}/docs/features -> 200`,
  `${APP_URL}/api/ops/metrics -> 200`,
];

export default function AuditPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <nav className="sticky top-0 z-40 backdrop-blur-md" style={{ background: 'rgba(10,10,20,0.85)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/docs" className="font-mono font-bold text-sm">Agent OS Docs</Link>
          <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            <Link href="/docs/launch" className="hover:text-white">Launch Notes</Link>
            <Link href="/ops" className="hover:text-white">Ops</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-12 space-y-8">
        <section>
          <div className="badge badge-purple mb-4">Production Audit</div>
          <h1 className="text-4xl font-black mb-3">Live audit: March 19, 2026</h1>
          <p className="text-lg" style={{ color: 'var(--text-muted)' }}>
            This report reflects the live production deployment on <code>{APP_URL}</code>. No P0 or P1 findings were observed in this pass. The remaining open issue is the custom-domain DNS cutover.
          </p>
        </section>

        <section className="grid md:grid-cols-3 gap-4">
          <div className="card p-5">
            <div className="text-3xl font-black gradient-text mb-1">{coverage.platformFeatures}</div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Platform features audited</div>
          </div>
          <div className="card p-5">
            <div className="text-3xl font-black gradient-text mb-1">{coverage.runtimeFunctions}</div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Runtime functions audited</div>
          </div>
          <div className="card p-5">
            <div className="text-3xl font-black gradient-text mb-1">{coverage.totalCatalogItems}</div>
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Catalog items under crew coverage</div>
          </div>
        </section>

        <section className="space-y-4">
          {findings.map((finding, index) => (
            <article key={`${finding.surface}-${index}`} className="card p-6">
              <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="badge badge-purple text-xs">{finding.severity}</span>
                  <span className="text-xs font-mono uppercase" style={{ color: finding.status === 'Open' ? '#f59e0b' : '#22c55e' }}>
                    {finding.status}
                  </span>
                </div>
                <code className="text-xs" style={{ color: 'var(--text-dim)' }}>{finding.surface}</code>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="font-semibold mb-1">Observed behavior</div>
                  <p style={{ color: 'var(--text-muted)' }}>{finding.observed}</p>
                </div>
                <div>
                  <div className="font-semibold mb-1">Risk</div>
                  <p style={{ color: 'var(--text-muted)' }}>{finding.risk}</p>
                </div>
                <div>
                  <div className="font-semibold mb-1">Exact fix recommendation</div>
                  <p style={{ color: 'var(--text-muted)' }}>{finding.recommendation}</p>
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="card p-6">
          <h2 className="text-xl font-bold mb-3">Verified production routes</h2>
          <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            {verifiedRoutes.map(route => (
              <li key={route}>{route}</li>
            ))}
          </ul>
        </section>

        <section className="card p-6">
          <h2 className="text-xl font-bold mb-3">Residual risk and testing gaps</h2>
          <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            <li>The live audit covered route availability, auth boundaries, Studio command execution, password reset request and confirm behavior, and public ops redaction.</li>
            <li>A full paid-skill commerce flow and third-party MCP action flow were not executed in production during this pass.</li>
            <li>FFP consensus remains available in the product, but the current deployment is configured with FFP disabled by default until you choose to enable it.</li>
          </ul>
        </section>

        <section className="card p-6">
          <h2 className="text-xl font-bold mb-3">Readiness assessment</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Agent OS is live and ready for public traffic.
          </p>
        </section>
      </div>

      <DocsFooter />
    </div>
  );
}
