'use client';

import Link from 'next/link';
import Nav from '@/components/Nav';
import { Badge } from '@/components/os/ui';

const MARKETPLACE_LAYERS = [
  {
    title: 'App Store',
    body: 'Full agentic products with runtime metadata, device targets, install state, and SDK registration support.',
    href: '/appstore',
    cta: 'Browse apps',
  },
  {
    title: 'Skill Store',
    body: 'Focused installable capabilities for research, browser work, code execution, retrieval, and domain-specific actions.',
    href: '/skillstore',
    cta: 'Browse skills',
  },
];

const DISCOVERY_POINTS = [
  'AgentOS-native apps and workflows',
  'External SDK app registration',
  'Installable skills',
  'Workspace-scoped private assets',
];

export default function MarketplacePage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Nav activePath="/marketplace" />

      <section style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="container" style={{ paddingTop: 72, paddingBottom: 56 }}>
          <div style={{ marginBottom: 18 }}>
            <Badge tone="accent">Marketplace</Badge>
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
              fontSize: 'clamp(34px, 5vw, 58px)',
              lineHeight: 1.02,
            }}
          >
            One discovery layer for the agent economy.
          </h1>
          <p style={{ marginTop: 18, maxWidth: 780, color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: 17 }}>
            AgentOS is the workspace, router, and marketplace layer for apps, skills, workflows, and MCP-connected
            runtimes. Start in the store you need, or register through the SDK and become discoverable here.
          </p>
        </div>
      </section>

      <section>
        <div className="container" style={{ paddingTop: 40, paddingBottom: 40 }}>
          <div className="marketplace-hero-grid" style={{ display: 'grid', gap: 18 }}>
            {MARKETPLACE_LAYERS.map(item => (
              <div
                key={item.title}
                style={{
                  padding: 24,
                  borderRadius: 22,
                  border: '1px solid var(--border)',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))',
                }}
              >
                <div className="os-entity-title" style={{ fontSize: 24, marginBottom: 10 }}>{item.title}</div>
                <div className="os-entity-copy" style={{ lineHeight: 1.8, marginBottom: 18 }}>{item.body}</div>
                <Link href={item.href} className="btn-primary">{item.cta}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ paddingBottom: 56 }}>
        <div className="container">
          <div
            style={{
              padding: 24,
              borderRadius: 22,
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <div className="os-entity-title" style={{ fontSize: 24, marginBottom: 12 }}>Build once. Discover everywhere.</div>
            <div className="os-entity-copy" style={{ lineHeight: 1.8, marginBottom: 18 }}>
              Register external runtimes through the SDK, publish first-party apps inside AgentOS, and expose skills as
              reusable assets. The marketplace becomes the discovery layer on top of the shared operating system.
            </div>
            <div className="marketplace-points-grid" style={{ display: 'grid', gap: 12 }}>
              {DISCOVERY_POINTS.map(item => (
                <div
                  key={item}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 14,
                    border: '1px solid rgba(20, 184, 166, 0.18)',
                    background: 'rgba(20, 184, 166, 0.06)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section style={{ paddingBottom: 80 }}>
        <div className="container">
          <div
            style={{
              padding: 24,
              borderRadius: 22,
              border: '1px solid rgba(103, 232, 249, 0.18)',
              background: 'linear-gradient(135deg, rgba(8, 47, 73, 0.22), rgba(15, 118, 110, 0.14))',
            }}
          >
            <div className="os-entity-title" style={{ fontSize: 24, marginBottom: 10 }}>Workspace-owned discovery.</div>
            <div className="os-entity-copy" style={{ lineHeight: 1.8, marginBottom: 18 }}>
              Apps and skills are first-class workspace assets with install flows, SDK registration, and ownership
              records. Workflows stay discoverable, shareable, and cloneable in this release, with no workflow
              monetization surface.
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link href="/developer" className="btn-outline">Open developer surfaces</Link>
              <Link href="/studio" className="btn-ghost">Route from Studio</Link>
            </div>
          </div>
        </div>
      </section>

      <style>{`
        .marketplace-hero-grid,
        .marketplace-points-grid {
          grid-template-columns: 1fr;
        }

        @media (min-width: 920px) {
          .marketplace-hero-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .marketplace-points-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  );
}
