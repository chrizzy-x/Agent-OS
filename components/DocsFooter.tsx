import Link from 'next/link';

export default function DocsFooter() {
  const links = [
    { href: '/docs', label: 'Docs' },
    { href: '/docs/api', label: 'API Reference' },
    { href: '/docs/launch', label: 'Launch Notes' },
    { href: '/docs/audit', label: 'Audit' },
    { href: '/docs/primitives', label: 'Primitives' },
    { href: '/docs/skills', label: 'Skills' },
    { href: '/marketplace', label: 'Marketplace' },
  ];

  return (
    <footer style={{
      borderTop: '1px solid var(--border)',
      marginTop: '64px',
      padding: '32px 0',
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '0 24px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
      }}>
        <Link href="/" style={{
          fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
          fontWeight: 700,
          fontSize: '14px',
          color: 'var(--text-primary)',
          textDecoration: 'none',
        }}>AgentOS</Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0', flexWrap: 'wrap' }}>
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="hover-text-secondary"
              style={{
                fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                fontSize: '13px',
                color: 'var(--text-tertiary)',
                textDecoration: 'none',
                padding: '4px 12px',
                transition: 'color 150ms',
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <span style={{
          fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
          fontSize: '12px',
          color: 'var(--text-tertiary)',
        }}>MIT License</span>
      </div>
    </footer>
  );
}
