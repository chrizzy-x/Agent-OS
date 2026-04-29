'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface NavProps {
  activePath?: string;
}

export default function Nav({ activePath }: NavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Close menu on resize to desktop
  useEffect(() => {
    const handler = () => { if (window.innerWidth > 768) setMenuOpen(false); };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const links = [
    { href: '/marketplace', label: 'Marketplace' },
    { href: '/connect', label: 'Connect' },
    { href: '/docs', label: 'Docs' },
    { href: '/developer', label: 'Developer' },
  ];

  return (
    <>
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          width: '100%',
          backgroundColor: scrolled ? 'rgba(10,10,10,0.9)' : 'var(--bg-primary)',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: `1px solid ${scrolled ? 'var(--border)' : 'transparent'}`,
          transition: 'background-color 200ms ease, border-color 200ms ease, backdrop-filter 200ms ease',
        }}
      >
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 24px',
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '32px',
        }}>
          {/* Logo */}
          <Link href="/" style={{ textDecoration: 'none', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '28px',
                height: '28px',
                border: '1px solid var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                fontWeight: 700,
                fontSize: '14px',
                color: 'var(--accent)',
                flexShrink: 0,
              }}>A</div>
              <span style={{
                fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                fontWeight: 600,
                fontSize: '15px',
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}>AgentOS</span>
            </div>
          </Link>

          {/* Desktop links */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            flex: 1,
          }} className="nav-desktop-links">
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: activePath === link.href ? 'var(--text-primary)' : 'var(--text-secondary)',
                  textDecoration: 'none',
                  padding: '6px 14px',
                  transition: 'color 150ms ease',
                  borderBottom: activePath === link.href ? '1px solid var(--accent)' : '1px solid transparent',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = activePath === link.href ? 'var(--text-primary)' : 'var(--text-secondary)'; }}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }} className="nav-desktop-ctas">
            <Link href="/signin" style={{
              fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              padding: '6px 14px',
              transition: 'color 150ms ease',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)'; }}
            >Sign in</Link>
            <Link href="/signup" style={{
              fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--bg-primary)',
              backgroundColor: 'var(--accent)',
              textDecoration: 'none',
              padding: '8px 18px',
              transition: 'background-color 200ms ease, box-shadow 200ms ease',
              whiteSpace: 'nowrap',
            }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.backgroundColor = 'var(--accent-dim)';
                el.style.boxShadow = '0 0 16px var(--accent-glow)';
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.backgroundColor = 'var(--accent)';
                el.style.boxShadow = 'none';
              }}
            >Get started →</Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="nav-hamburger"
            onClick={() => setMenuOpen(v => !v)}
            aria-label="Toggle menu"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              display: 'none',
              flexDirection: 'column',
              gap: '5px',
            }}
          >
            <span style={{ display: 'block', width: '20px', height: '1px', background: menuOpen ? 'var(--accent)' : 'var(--text-primary)', transition: 'transform 200ms, background 200ms', transform: menuOpen ? 'rotate(45deg) translateY(6px)' : 'none' }} />
            <span style={{ display: 'block', width: '20px', height: '1px', background: menuOpen ? 'var(--accent)' : 'var(--text-primary)', transition: 'opacity 200ms', opacity: menuOpen ? 0 : 1 }} />
            <span style={{ display: 'block', width: '20px', height: '1px', background: menuOpen ? 'var(--accent)' : 'var(--text-primary)', transition: 'transform 200ms, background 200ms', transform: menuOpen ? 'rotate(-45deg) translateY(-6px)' : 'none' }} />
          </button>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          top: '56px',
          zIndex: 49,
          backgroundColor: 'var(--bg-primary)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '0',
          overflowY: 'auto',
        }}>
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              style={{
                fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                fontSize: '16px',
                fontWeight: 500,
                color: activePath === link.href ? 'var(--accent)' : 'var(--text-primary)',
                textDecoration: 'none',
                padding: '16px 24px',
                borderBottom: '1px solid var(--border)',
                minHeight: '56px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {link.label}
            </Link>
          ))}
          <Link href="/signin" onClick={() => setMenuOpen(false)} style={{
            fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
            fontSize: '16px',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            padding: '16px 24px',
            borderBottom: '1px solid var(--border)',
            minHeight: '56px',
            display: 'flex',
            alignItems: 'center',
          }}>Sign in</Link>
          <div style={{ padding: '16px 24px', marginTop: 'auto' }}>
            <Link href="/signup" onClick={() => setMenuOpen(false)} style={{
              fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--bg-primary)',
              backgroundColor: 'var(--accent)',
              textDecoration: 'none',
              padding: '14px 24px',
              display: 'block',
              textAlign: 'center',
            }}>Get started →</Link>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .nav-desktop-links { display: none !important; }
          .nav-desktop-ctas  { display: none !important; }
          .nav-hamburger     { display: flex !important; }
        }
      `}</style>
    </>
  );
}
