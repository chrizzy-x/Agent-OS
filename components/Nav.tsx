'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Drawer } from '@/components/os/overlays';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';

interface NavProps {
  activePath?: string;
}

export function buildSessionNavLinks(session: BrowserSession | null): Array<{ href: string; label: string }> {
  if (!session) {
    return [
      { href: '/', label: 'Home' },
      { href: '/studio', label: 'Studio' },
      { href: '/appstore', label: 'Apps' },
      { href: '/skills', label: 'Skills' },
      { href: '/docs', label: 'Docs' },
    ];
  }

  const links: Array<{ href: string; label: string }> = [
    { href: '/', label: 'Home' },
    { href: '/studio', label: 'Studio' },
    { href: '/appstore', label: 'Apps' },
    { href: '/skills', label: 'Skills' },
    { href: '/projects', label: 'Projects' },
    { href: '/workflows', label: 'Workflows' },
  ];

  return links;
}

export default function Nav({ activePath }: NavProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchBrowserSession()
      .then(current => { if (active) setSession(current); })
      .catch(() => { if (active) setSession(null); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setMenuOpen(false);
        router.push('/search');
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [router]);

  const links = buildSessionNavLinks(session);

  return (
    <>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 60,
          borderBottom: '1px solid var(--border)',
          background: 'rgba(9, 9, 12, 0.84)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <div className="container" style={{ height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <Link href={session ? '/' : '/'} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
            <Image
              src="/logo.png"
              alt="AgentOS logo"
              width={36}
              height={36}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                objectFit: 'cover',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span style={{ fontWeight: 700 }}>Super AgentOS</span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>AI operating system</span>
            </div>
          </Link>

          <nav className="nav-desktop-links" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  minHeight: 38,
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  borderRadius: 8,
                  border: `1px solid ${activePath === link.href ? 'rgba(103, 232, 249, 0.26)' : 'transparent'}`,
                  background: activePath === link.href ? 'var(--accent-glow)' : 'transparent',
                  color: activePath === link.href ? 'var(--accent-2)' : 'var(--text-secondary)',
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="nav-desktop-ctas" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {ready && session ? (
              <>
                <span style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {session.agentName ?? 'AgentOS'}
                </span>
                <Link href="/studio" className="btn-primary">Open Studio</Link>
              </>
            ) : (
              <>
                <Link href="/signin" className="btn-ghost">Sign in</Link>
                <Link href="/signup" className="btn-primary">Get AgentOS</Link>
              </>
            )}
          </div>

          <button
            type="button"
            className="nav-hamburger"
            aria-label="Toggle navigation"
            onClick={() => setMenuOpen(current => !current)}
            style={{
              display: 'none',
              width: 42,
              height: 42,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.02)',
              color: 'var(--text-primary)',
            }}
          >
            {menuOpen ? 'X' : 'Menu'}
          </button>
        </div>
      </header>

      <Drawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Navigation"
        description={session ? session.agentName ?? 'AgentOS' : 'AgentOS'}
        placement="right"
        mobilePlacement="bottom"
        size="sm"
      >
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              style={{
                minHeight: 44,
                padding: '10px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                color: activePath === link.href ? 'var(--accent-2)' : 'var(--text-secondary)',
                background: activePath === link.href ? 'var(--accent-glow)' : 'transparent',
              }}
            >
              {link.label}
            </Link>
          ))}
          {session ? (
            <Link href="/studio" className="btn-primary" onClick={() => setMenuOpen(false)}>Open Studio</Link>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
              <Link href="/signin" className="btn-ghost" onClick={() => setMenuOpen(false)}>Sign in</Link>
              <Link href="/signup" className="btn-primary" onClick={() => setMenuOpen(false)}>Create AgentOS account</Link>
            </div>
          )}
        </nav>
      </Drawer>

      <style>{`
        @media (max-width: 860px) {
          .nav-desktop-links, .nav-desktop-ctas { display: none !important; }
          .nav-hamburger { display: inline-flex !important; align-items: center; justify-content: center; }
        }
      `}</style>
    </>
  );
}
