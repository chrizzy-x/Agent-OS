'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Drawer } from '@/components/os/overlays';
import { destroyBrowserSession, fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';

interface NavProps {
  activePath?: string;
}

const MOBILE_MORE_LINKS = [
  { href: '/apps', label: 'Apps' },
  { href: '/skills/installed', label: 'Skills' },
  { href: '/workflows', label: 'Workflows' },
  { href: '/subagents', label: 'Subagents' },
  { href: '/appstore', label: 'App Store' },
  { href: '/skills', label: 'Skill Store' },
  { href: '/memory', label: 'Memory' },
  { href: '/vault', label: 'Vault' },
  { href: '/mcp', label: 'Universal MCP' },
  { href: '/ffp', label: 'FFP (temp)' },
  { href: '/developer', label: 'Developer' },
  { href: '/profile', label: 'Profile' },
];

export function buildSessionNavLinks(_session: BrowserSession | null): Array<{ href: string; label: string }> {
  return [
    { href: '/search', label: 'Search' },
    { href: '/notifications', label: 'Notifications' },
    { href: '/profile', label: 'Profile' },
  ];
}

function initialsFor(session: BrowserSession | null): string {
  const source = session?.agentName?.trim() || 'User';
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || 'U';
}

function AccountAvatar({ session }: { session: BrowserSession | null }) {
  const avatarUrl = session?.avatarUrl?.trim();
  return (
    <span className="agentos-avatar" aria-hidden="true">
      {avatarUrl ? <img src={avatarUrl} alt="" /> : initialsFor(session)}
    </span>
  );
}

export default function Nav({ activePath }: NavProps) {
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [session, setSession] = useState<BrowserSession | null>(null);

  useEffect(() => {
    let active = true;
    void fetchBrowserSession()
      .then(current => { if (active) setSession(current); })
      .catch(() => { if (active) setSession(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setMoreOpen(false);
        router.push('/search');
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [router]);

  const links = buildSessionNavLinks(session);
  async function logout() {
    await destroyBrowserSession();
    router.replace('/signin');
  }

  return (
    <>
      <header className="agentos-topbar">
        <Link href="/studio" className="agentos-mobile-brand" aria-label="AgentOS home">
          <Image src="/logo.png" alt="AgentOS logo" width={24} height={24} />
          <span>AgentOS</span>
        </Link>

        <nav className="agentos-topbar-actions" aria-label="Top navigation">
          {links.map(link => (
            link.href === '/profile' ? (
              <Link
                key={link.href}
                href={link.href}
                className={`agentos-avatar-link${activePath === link.href ? ' active' : ''}`}
                aria-label="Open account profile"
              >
                <AccountAvatar session={session} />
                <span>{session?.agentName || 'Account'}</span>
              </Link>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className={`agentos-topbar-link${activePath === link.href ? ' active' : ''}`}
              >
                {link.label === 'FFP (temp)' ? <>FFP <small><em>(temp)</em></small></> : link.label}
              </Link>
            )
          ))}
          {session ? <button type="button" className="agentos-topbar-link" onClick={() => void logout()}>Logout</button> : null}
        </nav>

        <div className="agentos-mobile-status">
          <span>Healthy</span>
        </div>

      </header>

      <nav className="agentos-mobile-bottom-nav" aria-label="Mobile navigation">
        <Link className={activePath === '/studio' || activePath === '/' ? 'active' : ''} href="/studio">AgentOS</Link>
        <Link className={activePath === '/studio' ? 'active' : ''} href="/studio?mode=nl">Chats</Link>
        <Link className={activePath === '/projects' ? 'active' : ''} href="/projects">Projects</Link>
        <Link className={activePath === '/library' ? 'active' : ''} href="/library">Library</Link>
        <button type="button" onClick={() => setMoreOpen(true)}>More</button>
      </nav>

      <Drawer
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="More"
        description="AgentOS navigation"
        placement="right"
        mobilePlacement="bottom"
        size="sm"
      >
        <nav className="agentos-more-drawer">
          <Link href="/profile" onClick={() => setMoreOpen(false)} className="agentos-more-account">
            <AccountAvatar session={session} />
            <span>{session?.agentName || 'Account'}</span>
          </Link>
          {MOBILE_MORE_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMoreOpen(false)}
              className={activePath === link.href ? 'active' : ''}
            >
              {link.label}
            </Link>
          ))}
          {session ? <button type="button" onClick={() => { setMoreOpen(false); void logout(); }}>Logout</button> : null}
        </nav>
      </Drawer>
    </>
  );
}
