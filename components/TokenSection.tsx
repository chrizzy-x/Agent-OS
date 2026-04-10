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
      color: '#a855f7',
    },
    {
      label: 'Market Cap',
      value: loading ? null : metrics?.marketCap ? fmtUsd(metrics.marketCap) : '—',
      color: '#06b6d4',
    },
    {
      label: 'Total Supply',
      value: loading ? null : metrics?.totalSupply ? fmtSupply(metrics.totalSupply) : '—',
      color: '#22c55e',
    },
    {
      label: 'Holders',
      value: loading ? null : metrics?.holders ? fmtHolders(metrics.holders) : '—',
      color: '#f59e0b',
    },
  ];

  return (
    <section className="py-20" style={{ background: 'var(--surface)' }}>
      <div className="max-w-6xl mx-auto px-5">
        <div className="text-center mb-10">
          <div className="badge badge-purple inline-flex mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            Token · Solana
          </div>
          <h2 className="text-3xl sm:text-4xl font-black mb-3">AgentOS Token</h2>
          <p style={{ color: 'var(--text-muted)' }}>
            The native token powering the AgentOS ecosystem.
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          {/* Contract Address */}
          <div className="mb-6">
            <div className="text-xs font-semibold uppercase tracking-widest mb-2"
              style={{ color: 'var(--text-dim)' }}>
              Contract Address
            </div>
            <div className="flex items-center gap-2 rounded-xl px-4 py-3"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <span className="font-mono text-sm flex-1 truncate"
                style={{ color: '#e2e8f0', letterSpacing: '0.02em' }}>
                {CONTRACT_ADDRESS}
              </span>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                style={{
                  background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(168,85,247,0.15)',
                  border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'rgba(168,85,247,0.3)'}`,
                  color: copied ? '#86efac' : '#c084fc',
                  cursor: 'pointer',
                }}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {metricCards.map((m) => (
              <div key={m.label} className="rounded-xl p-4 text-center"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div className="text-xs font-semibold uppercase tracking-widest mb-2"
                  style={{ color: 'var(--text-dim)' }}>
                  {m.label}
                </div>
                {m.value == null ? (
                  <div className="h-6 rounded mx-auto w-16 animate-pulse"
                    style={{ background: 'rgba(255,255,255,0.06)' }} />
                ) : (
                  <div className="text-xl font-black font-mono"
                    style={{ color: m.color }}>
                    {m.value}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Dezypher Link */}
          <div className="text-center">
            <a
              href={DEZYPHER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-lg transition-all hover:opacity-80"
              style={{
                background: 'rgba(168,85,247,0.12)',
                border: '1px solid rgba(168,85,247,0.25)',
                color: '#c084fc',
              }}>
              View on Dezypher
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
