import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';

const contractAddress = '2Fob54QUhUbP9jv6h5XAh3PgB1kcULR6LXbxSzuwpump';

export default function ProvenanceDocsPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <nav className="sticky top-0 z-40 backdrop-blur-md" style={{ background: 'rgba(10,10,20,0.85)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/docs" className="font-mono font-bold text-sm">Agent OS Docs</Link>
          <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            <Link href="/docs/launch" className="hover:text-white">Launch</Link>
            <Link href="/resources" className="hover:text-white">Resources</Link>
            <Link href="/studio" className="hover:text-white">Studio</Link>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-12 space-y-8">
        <section>
          <div className="badge badge-accent mb-4">Official Provenance</div>
          <h1 className="text-4xl font-black mb-3">Verify AgentOS</h1>
          <p className="text-lg max-w-3xl" style={{ color: 'var(--text-muted)' }}>
            These are the canonical identifiers for the official AgentOS project, repository, production domain, and `$sAGENT` contract address.
          </p>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">Official identifiers</h2>
          <div className="space-y-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            <p>Production domain: <a href="https://www.agentos.services" target="_blank" rel="noreferrer">www.agentos.services</a></p>
            <p>Canonical GitHub repository: <a href="https://github.com/chrizzy-x/Agent-OS" target="_blank" rel="noreferrer">chrizzy-x/Agent-OS</a></p>
            <p>`$sAGENT` contract address: <code>{contractAddress}</code></p>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">How to use this page</h2>
          <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            <li>Use the repository and release tags as the public codebase record.</li>
            <li>Use the production domain above for the live AgentOS product.</li>
            <li>Use only the contract address listed here when verifying `$sAGENT` references.</li>
            <li>Ignore alternate repositories, domains, or contracts that do not point back to these identifiers.</li>
          </ul>
        </section>

        <section className="card p-6">
          <h2 className="text-2xl font-bold mb-4">Scope</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            This page records official identity and provenance only. It does not make trading, price, adoption, or investment claims.
          </p>
        </section>
      </main>

      <DocsFooter />
    </div>
  );
}
