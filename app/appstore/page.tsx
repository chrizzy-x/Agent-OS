'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Badge from '@/components/Badge';
import ResponsiveSidebar from '@/components/ResponsiveSidebar';
import { AGENT_APP_CATEGORIES, type AgentAppListing } from '@/src/appstore/catalog';

const SORT_OPTIONS = [
  { value: 'popular', label: 'Most Downloaded' },
  { value: 'recent', label: 'Newest' },
  { value: 'name', label: 'Name' },
];

const PUBLISH_EXAMPLE = `POST /api/apps
Authorization: Bearer <agent-token>
Content-Type: application/json

{
  "name": "Invoice Ops",
  "category": "Operations",
  "description": "Autonomous invoice intake, validation, and routing.",
  "deviceTargets": ["AgentOS Desktop", "AgentOS Cloud"],
  "manifest": {
    "version": "1.0.0",
    "runtime": "agentos-app",
    "entrypoint": "agentos://apps/invoice-ops",
    "primitives": ["fs.*", "db.*", "net.fetch", "events.*"],
    "skills": ["csv-processor"],
    "permissions": ["files", "database", "network", "events"],
    "requiredSecrets": ["ERP_API_KEY"]
  }
}`;

function displayPublicName(name: string | null | undefined): string {
  if (!name || /^agent[_-]/i.test(name)) return 'AgentOS Publisher';
  return name;
}

export default function AppStorePage() {
  const [apps, setApps] = useState<AgentAppListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('popular');
  const [total, setTotal] = useState(0);

  const fetchApps = useCallback(async (searchTerm?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort });
      if (category !== 'All') params.set('category', category);
      const term = searchTerm !== undefined ? searchTerm : search;
      if (term) params.set('search', term);
      const res = await fetch(`/api/apps?${params}`);
      const data = await res.json();
      setApps(data.apps ?? []);
      setTotal(data.pagination?.total ?? 0);
    } catch {
      setApps([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [category, search, sort]);

  useEffect(() => { void fetchApps(); }, [fetchApps]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchApps(search);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      <Nav activePath="/appstore" />

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
        <div className="sidebar-layout" style={{ paddingTop: '40px' }}>
          <ResponsiveSidebar
            label="Categories"
            panelClassName="marketplace-sidebar-panel"
            panelStyle={{
              width: '200px',
              flexShrink: 0,
              position: 'sticky',
              top: '72px',
              alignSelf: 'flex-start',
              maxHeight: 'calc(100vh - 80px)',
              overflowY: 'auto',
              borderRight: '1px solid var(--border)',
              paddingRight: '24px',
              marginRight: '32px',
            }}
          >
            <div style={{
              fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
              fontSize: '10px',
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '8px',
            }}>Categories</div>
            {AGENT_APP_CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  borderLeft: category === cat ? '2px solid var(--accent)' : '2px solid transparent',
                  padding: '7px 12px',
                  fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                  fontSize: '13px',
                  color: category === cat ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'color 150ms, border-color 150ms',
                  marginBottom: '1px',
                }}
                onMouseEnter={e => {
                  if (cat !== category) {
                    e.currentTarget.style.color = 'var(--text-primary)';
                    e.currentTarget.style.borderLeftColor = 'var(--border-active)';
                  }
                }}
                onMouseLeave={e => {
                  if (cat !== category) {
                    e.currentTarget.style.color = 'var(--text-secondary)';
                    e.currentTarget.style.borderLeftColor = 'transparent';
                  }
                }}
              >
                {cat}
              </button>
            ))}

            <div style={{
              borderTop: '1px solid var(--border)',
              marginTop: '24px',
              paddingTop: '24px',
            }}>
              <Link href="/developer" className="btn-ghost" style={{
                display: 'block',
                textAlign: 'center',
                padding: '8px 12px',
                fontSize: '12px',
                textDecoration: 'none',
              }}>
                Publish app
              </Link>
            </div>
          </ResponsiveSidebar>

          <main style={{ flex: 1, minWidth: 0, paddingBottom: '80px' }}>
            <div style={{ marginBottom: '24px' }}>
              <div style={{
                display: 'inline-flex',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-secondary)',
                marginBottom: '24px',
              }}>
                <Link href="/marketplace" style={{
                  padding: '9px 14px',
                  fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  textDecoration: 'none',
                  borderRight: '1px solid var(--border)',
                }}>Skill Store</Link>
                <Link href="/appstore" style={{
                  padding: '9px 14px',
                  fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                  fontSize: '13px',
                  color: 'var(--bg-primary)',
                  backgroundColor: 'var(--accent)',
                  textDecoration: 'none',
                  fontWeight: 600,
                }}>App Store</Link>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                <div>
                  <Badge variant="accent" style={{ marginBottom: '12px' }}>Agentic Apps</Badge>
                  <h1 style={{
                    fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                    fontSize: '28px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: '8px',
                    marginTop: '8px',
                    lineHeight: 1.2,
                  }}>App Store</h1>
                  <p style={{
                    fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                    fontSize: '14px',
                    color: 'var(--text-secondary)',
                    margin: 0,
                    maxWidth: '680px',
                    lineHeight: 1.6,
                  }}>
                    Download full agentic apps built on AgentOS. Skills are individual capabilities; apps are packaged workflows, manifests, device targets, and default configuration.
                  </p>
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                  fontSize: '12px',
                  color: 'var(--text-tertiary)',
                  paddingTop: '8px',
                }}>
                  {`${total} apps`}
                </div>
              </div>
            </div>

            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <svg
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                  width="14" height="14" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" viewBox="0 0 24 24"
                >
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search apps..."
                  className="input-dark"
                  style={{ paddingLeft: '36px' }}
                />
              </div>
              <button type="submit" className="btn-primary" style={{ padding: '10px 20px', flexShrink: 0 }}>Search</button>
            </form>

            <div style={{
              display: 'flex',
              gap: '0',
              borderBottom: '1px solid var(--border)',
              marginBottom: '24px',
            }}>
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSort(opt.value)}
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: sort === opt.value ? '2px solid var(--accent)' : '2px solid transparent',
                    padding: '10px 16px',
                    fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: sort === opt.value ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'color 150ms, border-color 150ms',
                    marginBottom: '-1px',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1px', border: '1px solid var(--border)', backgroundColor: 'var(--border)' }}>
                {[...Array(6)].map((_, i) => (
                  <div key={i} style={{ padding: '24px', backgroundColor: 'var(--bg-secondary)' }}>
                    <div style={{ width: '44px', height: '44px', background: 'var(--bg-tertiary)', marginBottom: '12px' }} />
                    <div style={{ height: '14px', background: 'var(--bg-tertiary)', width: '75%', marginBottom: '8px' }} />
                    <div style={{ height: '12px', background: 'var(--border)', width: '100%', marginBottom: '6px' }} />
                    <div style={{ height: '12px', background: 'var(--border)', width: '60%' }} />
                  </div>
                ))}
              </div>
            ) : apps.length === 0 ? (
              <div style={{
                padding: '80px 40px',
                textAlign: 'center',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-secondary)',
              }}>
                <p style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '14px', color: 'var(--text-primary)', marginBottom: '8px', fontWeight: 600 }}>No apps found</p>
                <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', color: 'var(--text-secondary)' }}>No public app listings match this view.</p>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '1px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--border)',
                marginBottom: '32px',
              }}>
                {apps.map(app => (
                  <article
                    key={app.id}
                    style={{
                      padding: '24px',
                      backgroundColor: 'var(--bg-secondary)',
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: '320px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px', gap: '8px' }}>
                      <div style={{
                        width: '44px',
                        height: '44px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid var(--border-active)',
                        backgroundColor: 'rgba(0,255,136,0.06)',
                        color: 'var(--accent)',
                        fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                        fontSize: '10px',
                        fontWeight: 700,
                      }}>[app]</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {app.verified && <Badge variant="accent">Verified</Badge>}
                        <Badge variant="dim">{app.category}</Badge>
                      </div>
                    </div>

                    <h3 style={{
                      fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                      fontSize: '15px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      marginBottom: '8px',
                      marginTop: 0,
                    }}>{app.name}</h3>

                    <p style={{
                      fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.6,
                      marginBottom: '14px',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>{app.description}</p>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '16px' }}>
                      {app.deviceTargets.slice(0, 3).map(target => (
                        <span key={target} className="tag">{target}</span>
                      ))}
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '1px',
                      backgroundColor: 'var(--border)',
                      border: '1px solid var(--border)',
                      marginBottom: '16px',
                      marginTop: 'auto',
                    }}>
                      <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-primary)' }}>
                        <div style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', color: 'var(--text-primary)', fontWeight: 700 }}>{app.installCount.toLocaleString()}</div>
                        <div style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '11px', color: 'var(--text-tertiary)' }}>Downloads</div>
                      </div>
                      <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-primary)' }}>
                        <div style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', color: 'var(--text-primary)', fontWeight: 700 }}>{app.manifest.primitives.length}</div>
                        <div style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '11px', color: 'var(--text-tertiary)' }}>Primitives</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                          fontSize: '11px',
                          color: 'var(--text-tertiary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>by {displayPublicName(app.publisherName)}</div>
                      </div>
                      <a
                        href={`/api/apps/${app.slug}/download`}
                        className="btn-primary"
                        style={{ fontSize: '12px', padding: '8px 14px', textDecoration: 'none', flexShrink: 0 }}
                      >
                        Download
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <section style={{
              border: '1px solid var(--border-active)',
              backgroundColor: 'var(--bg-secondary)',
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)',
              gap: '1px',
            }} className="appstore-publish-panel">
              <div style={{ padding: '24px' }}>
                <Badge variant="dim" style={{ marginBottom: '12px' }}>Automatic Publishing</Badge>
                <h2 style={{
                  fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                  fontSize: '18px',
                  color: 'var(--text-primary)',
                  marginTop: 0,
                  marginBottom: '10px',
                }}>Publish agentic apps</h2>
                <p style={{
                  fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.7,
                  marginBottom: '16px',
                }}>
                  Enterprise subscribers can publish full AgentOS app packages. Apps can be public in the App Store or private to the publisher, and downloadable packages expose metadata, manifest, targets, and default config without secrets.
                </p>
                <Link href="/developer" className="btn-outline" style={{ fontSize: '13px', padding: '9px 16px' }}>
                  Developer Portal
                </Link>
              </div>
              <div style={{ backgroundColor: 'var(--code-bg)', borderLeft: '1px solid var(--border)' }}>
                <pre style={{
                  margin: 0,
                  padding: '24px',
                  overflowX: 'auto',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                  fontSize: '12px',
                  lineHeight: 1.7,
                }}>{PUBLISH_EXAMPLE}</pre>
              </div>
            </section>
          </main>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .appstore-publish-panel {
            grid-template-columns: 1fr !important;
          }
          .appstore-publish-panel > div:last-child {
            border-left: 0 !important;
            border-top: 1px solid var(--border) !important;
          }
        }
      `}</style>
    </div>
  );
}
