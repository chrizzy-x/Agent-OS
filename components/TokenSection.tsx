'use client';

import { useEffect, useState } from 'react';

const CONTRACT_ADDRESS = 'GtpxyYeFGDA8WoxA5buhRXMcBKweMCpK9S2CShmCpump';
const DEZYPHER_URL = `https://dezypher.vercel.app/spot`;

interface TokenMetrics {
  priceUsd: string | null;
  marketCap: number | null;
  totalSupply: number | null;
  holders: number | null;
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtSupply(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return n.toLocaleString();
}

function fmtHolders(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtPrice(p: string): string {
  const n = parseFloat(p);
  if (isNaN(n)) return '—';
  if (n < 0.000001) return `$${n.toExponential(2)}`;
  if (n < 0.01) return `$${n.toFixed(8)}`;
  return `$${n.toFixed(4)}`;
}

export default function TokenSection() {
  const [metrics, setMetrics] = useState<TokenMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const [dexRes, supplyRes, pumpRes] = await Promise.allSettled([
          fetch(`https://api.dexscreener.com/latest/dex/tokens/${CONTRACT_ADDRESS}`),
          fetch('https://api.mainnet-beta.solana.com', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', id: 1,
              method: 'getTokenSupply',
              params: [CONTRACT_ADDRESS],
            }),
          }),
          fetch(`https://frontend-api.pump.fun/coins/${CONTRACT_ADDRESS}`),
        ]);

        let priceUsd: string | null = null;
        let marketCap: number | null = null;
        let totalSupply: number | null = null;
        let holders: number | null = null;

        if (dexRes.status === 'fulfilled' && dexRes.value.ok) {
          const data = await dexRes.value.json();
          const pairs: Array<{ priceUsd?: string; fdv?: number; marketCap?: number }> = data.pairs ?? [];
          if (pairs.length > 0) {
            priceUsd = pairs[0].priceUsd ?? null;
            marketCap = pairs[0].fdv ?? pairs[0].marketCap ?? null;
          }
        }

        if (supplyRes.status === 'fulfilled' && supplyRes.value.ok) {
          const data = await supplyRes.value.json();
          const uiAmount = data?.result?.value?.uiAmount;
          if (uiAmount != null) totalSupply = uiAmount;
        }

        if (pumpRes.status === 'fulfilled' && pumpRes.value.ok) {
          const data = await pumpRes.value.json();
          if (data?.holder_count != null) holders = data.holder_count;
        }

        setMetrics({ priceUsd, marketCap, totalSupply, holders });
      } catch {
        setMetrics({ priceUsd: null, marketCap: null, totalSupply: null, holders: null });
      } finally {
        setLoading(false);
      }
    }
    fetchMetrics();
  }, []);

  function handleCopy() {
    navigator.clipboard.writeText(CONTRACT_ADDRESS).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const metricCards = [
    {
      label: 'Price',
      value: loading ? null : metrics?.priceUsd ? fmtPrice(metrics.priceUsd) : '—',
    },
    {
      label: 'Market Cap',
      value: loading ? null : metrics?.marketCap ? fmtUsd(metrics.marketCap) : '—',
    },
    {
      label: 'Total Supply',
      value: loading ? null : metrics?.totalSupply ? fmtSupply(metrics.totalSupply) : '—',
    },
    {
      label: 'Holders',
      value: loading ? null : metrics?.holders ? fmtHolders(metrics.holders) : '—',
    },
  ];

  return (
    <section style={{ paddingTop: '64px', paddingBottom: '64px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 24px' }}>
        {/* Contract Address */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
            fontSize: '10px',
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: '8px',
          }}>
            Contract Address · Solana
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--code-bg)',
            border: '1px solid var(--code-border)',
            padding: '12px 16px',
          }}>
            <span style={{
              fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
              fontSize: '13px',
              color: 'var(--accent)',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
            }}>
              {CONTRACT_ADDRESS}
            </span>
            <button
              onClick={handleCopy}
              style={{
                flexShrink: 0,
                fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                fontSize: '11px',
                fontWeight: 600,
                padding: '5px 12px',
                background: copied ? 'var(--accent-glow)' : 'transparent',
                border: `1px solid ${copied ? 'var(--accent)' : 'var(--border-active)'}`,
                color: copied ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1px',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--border)',
          marginBottom: '24px',
        }}>
          {metricCards.map((m) => (
            <div key={m.label} style={{
              backgroundColor: 'var(--bg-secondary)',
              padding: '20px 16px',
              textAlign: 'center',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '10px',
              }}>
                {m.label}
              </div>
              {m.value == null ? (
                <div style={{
                  height: '24px',
                  width: '60px',
                  margin: '0 auto',
                  backgroundColor: 'var(--bg-tertiary)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }} />
              ) : (
                <div style={{
                  fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                  fontSize: '18px',
                  fontWeight: 700,
                  color: 'var(--accent)',
                }}>
                  {m.value}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Dezypher Link */}
        <div style={{ textAlign: 'center' }}>
          <a
            href={DEZYPHER_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
              fontSize: '13px',
              fontWeight: 600,
              padding: '10px 20px',
              backgroundColor: 'transparent',
              border: '1px solid var(--border-active)',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              transition: 'border-color 150ms, color 150ms',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.borderColor = 'var(--accent)';
              el.style.color = 'var(--accent)';
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.borderColor = 'var(--border-active)';
              el.style.color = 'var(--text-secondary)';
            }}
          >
            View on Dezypher
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
