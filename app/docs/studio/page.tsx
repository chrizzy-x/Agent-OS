import Link from 'next/link';
import Nav from '@/components/Nav';
import DocsFooter from '@/components/DocsFooter';

const streamEvents = [
  ['execution', 'Persisted execution ID and running state'],
  ['status', 'Human-readable generation status'],
  ['delta', 'Incremental assistant text'],
  ['approval', 'Confirmation token for approval-gated actions'],
  ['error', 'Safe user-facing failure'],
  ['done', 'Completed, paused, failed, or cancelled terminal state'],
];

export default function StudioDocsPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Nav activePath="/docs" />
      <main style={{ maxWidth: 920, margin: '0 auto', padding: '48px 24px 80px' }}>
        <Link href="/docs" style={{ color: 'var(--accent)', textDecoration: 'none' }}>← Documentation</Link>
        <h1 style={{ margin: '24px 0 12px', fontSize: 42 }}>NL Studio</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 17, lineHeight: 1.7 }}>
          NL Studio is the default conversation mode at <code>/studio?mode=nl</code>. It provides persisted chat,
          real SSE response streaming, Markdown replies, safe cancellation, searchable history, and responsive desktop/mobile layouts.
        </p>

        <section className="card" style={{ marginTop: 32, padding: 24 }}>
          <h2>Chat lifecycle</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Opening NL Studio without a session starts a clean draft. The first submitted message creates the session in the active
            workspace and project. New chat clears local conversation state; recent and searched chats load their complete persisted bundle.
          </p>
        </section>

        <section className="card" style={{ marginTop: 16, padding: 24 }}>
          <h2>Streaming events</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {streamEvents.map(([event, description]) => (
              <div key={event} style={{ display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr)', gap: 12 }}>
                <code>{event}</code>
                <span style={{ color: 'var(--text-secondary)' }}>{description}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card" style={{ marginTop: 16, padding: 24 }}>
          <h2>Verified behavior</h2>
          <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.9 }}>
            <li>Empty-state prompt suggestions and sticky composer</li>
            <li>Enter to send and Shift+Enter for newlines</li>
            <li>Markdown and GitHub-flavored Markdown rendering</li>
            <li>Live generation status, stop, and partial-output persistence</li>
            <li>Recent-chat search and cross-project session reopening</li>
            <li>NL, Workflow, and Code mode switching</li>
            <li>Desktop and mobile conversation parity</li>
          </ul>
        </section>
      </main>
      <DocsFooter />
    </div>
  );
}
