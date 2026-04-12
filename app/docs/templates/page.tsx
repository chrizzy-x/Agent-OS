'use client';

import { useState } from 'react';
import Link from 'next/link';
import { APP_URL } from '@/lib/config';

const API_KEY_PLACEHOLDER = 'YOUR_API_KEY_HERE';
const BASE_URL = APP_URL;

const TEMPLATES = [
  {
    id: 'price-alert',
    emoji: '🎯',
    title: 'Price Alert Bot',
    desc: 'Get notified when any crypto hits your target price — above or below.',
    time: '2 min setup',
    difficulty: 'Beginner',
    editLines: ['YOUR_API_KEY_HERE', 'bitcoin', 'below', '60000'],
    code: `// ─────────────────────────────────────────
// PRICE ALERT BOT  —  edit the 4 lines below
// ─────────────────────────────────────────
const API_KEY   = 'YOUR_API_KEY_HERE';  // from agentos-app.vercel.app/signup
const ASSET     = 'bitcoin';            // try: ethereum, solana, etc.
const CONDITION = 'below';              // 'below' or 'above'
const THRESHOLD = 60000;               // your target price in USD
// ─────────────────────────────────────────

const BASE = '${BASE_URL}';

async function mcp(tool, input) {
  const res = await fetch(BASE + '/mcp', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, input }),
  });
  return (await res.json()).result;
}

async function checkPrice() {
  // Fetch live price
  const data = await mcp('net_http_get', {
    url: 'https://api.coincap.io/v2/assets/' + ASSET,
  });
  const price = parseFloat(data.body.data.priceUsd);
  const name  = data.body.data.name;

  // Check the condition
  const hit = CONDITION === 'below' ? price < THRESHOLD : price > THRESHOLD;

  if (hit) {
    const msg = '🎯 ALERT: ' + name + ' is ' + CONDITION + ' $' + THRESHOLD +
                ' — current price: $' + price.toFixed(2);

    // Save the alert
    await mcp('mem_set', { key: 'last_alert', value: msg, ttl: 86400 });
    console.log(msg);
  } else {
    console.log('⏳ ' + name + ' = $' + price.toFixed(2) + ' (target not hit yet)');
  }
}

checkPrice();`,
  },

  {
    id: 'daily-research',
    emoji: '📰',
    title: 'Daily Research Digest',
    desc: 'Every run, pull live data on any topic and save a clean summary you can read anytime.',
    time: '3 min setup',
    difficulty: 'Beginner',
    editLines: ['YOUR_API_KEY_HERE', 'bitcoin'],
    code: `// ─────────────────────────────────────────
// DAILY RESEARCH DIGEST  —  edit 2 lines
// ─────────────────────────────────────────
const API_KEY = 'YOUR_API_KEY_HERE';  // from agentos-app.vercel.app/signup
const ASSET   = 'bitcoin';            // try: ethereum, solana, dogecoin
// ─────────────────────────────────────────

const BASE = '${BASE_URL}';

async function mcp(tool, input) {
  const res = await fetch(BASE + '/mcp', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, input }),
  });
  return (await res.json()).result;
}

async function dailyDigest() {
  // Pull live market data
  const data = await mcp('net_http_get', {
    url: 'https://api.coincap.io/v2/assets/' + ASSET,
  });
  const a = data.body.data;

  // Build a clean summary
  const summary = [
    '═══════════════════════════════',
    '  ' + a.name + ' (' + a.symbol + ')  —  ' + new Date().toDateString(),
    '═══════════════════════════════',
    '  Price:       $' + parseFloat(a.priceUsd).toFixed(2),
    '  24h Change:  ' + parseFloat(a.changePercent24Hr).toFixed(2) + '%',
    '  Market Cap:  $' + (parseFloat(a.marketCapUsd) / 1e9).toFixed(2) + 'B',
    '  Rank:        #' + a.rank,
    '═══════════════════════════════',
  ].join('\\n');

  // Save to memory (readable anytime)
  await mcp('mem_set', {
    key:   'digest:' + ASSET,
    value: summary,
    ttl:   86400, // stays for 24 hours
  });

  // Also save to a file so you have history
  await mcp('fs_write', {
    path: '/digests/' + ASSET + '-' + new Date().toISOString().slice(0,10) + '.txt',
    data: btoa(summary),
  });

  console.log(summary);
}

dailyDigest();`,
  },

  {
    id: 'portfolio-tracker',
    emoji: '📊',
    title: 'Portfolio Snapshot',
    desc: 'Track multiple coins at once. See your whole portfolio value in one shot.',
    time: '3 min setup',
    difficulty: 'Beginner',
    editLines: ['YOUR_API_KEY_HERE', 'bitcoin', '0.5', 'ethereum', '2', 'solana', '10'],
    code: `// ─────────────────────────────────────────
// PORTFOLIO TRACKER  —  edit your holdings
// ─────────────────────────────────────────
const API_KEY = 'YOUR_API_KEY_HERE';  // from agentos-app.vercel.app/signup

const MY_PORTFOLIO = [
  { asset: 'bitcoin',  amount: 0.5  },  // ← change these to your holdings
  { asset: 'ethereum', amount: 2    },
  { asset: 'solana',   amount: 10   },
];
// ─────────────────────────────────────────

const BASE = '${BASE_URL}';

async function mcp(tool, input) {
  const res = await fetch(BASE + '/mcp', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, input }),
  });
  return (await res.json()).result;
}

async function portfolioSnapshot() {
  let totalValue = 0;
  const rows = [];

  for (const holding of MY_PORTFOLIO) {
    const data = await mcp('net_http_get', {
      url: 'https://api.coincap.io/v2/assets/' + holding.asset,
    });
    const price = parseFloat(data.body.data.priceUsd);
    const value = price * holding.amount;
    const change = parseFloat(data.body.data.changePercent24Hr).toFixed(2);
    totalValue += value;

    rows.push({
      name:   data.body.data.name,
      amount: holding.amount,
      price:  price.toFixed(2),
      value:  value.toFixed(2),
      change: change + '%',
    });
  }

  // Print snapshot
  console.log('\\n📊 PORTFOLIO SNAPSHOT — ' + new Date().toLocaleString());
  console.log('─'.repeat(55));
  rows.forEach(r => {
    console.log(
      r.name.padEnd(12) +
      ('x' + r.amount).padEnd(8) +
      ('$' + r.price).padEnd(14) +
      ('$' + r.value).padEnd(12) +
      r.change
    );
  });
  console.log('─'.repeat(55));
  console.log('TOTAL VALUE: $' + totalValue.toFixed(2));

  // Save snapshot to memory
  await mcp('mem_set', {
    key:   'portfolio:snapshot',
    value: JSON.stringify({ rows, totalValue, timestamp: new Date().toISOString() }),
    ttl:   3600,
  });
}

portfolioSnapshot();`,
  },

  {
    id: 'memory-store',
    emoji: '🧠',
    title: 'Persistent Memory Store',
    desc: "Save anything your AI agent should remember forever — notes, facts, preferences, context.",
    time: '1 min setup',
    difficulty: 'Beginner',
    editLines: ['YOUR_API_KEY_HERE'],
    code: `// ─────────────────────────────────────────
// MEMORY STORE  —  edit 1 line
// ─────────────────────────────────────────
const API_KEY = 'YOUR_API_KEY_HERE';  // from agentos-app.vercel.app/signup
// ─────────────────────────────────────────

const BASE = '${BASE_URL}';

async function mcp(tool, input) {
  const res = await fetch(BASE + '/mcp', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, input }),
  });
  return (await res.json()).result;
}

// ── SAVE something ──────────────────────
await mcp('mem_set', {
  key:   'user:preferences',
  value: 'I prefer short answers. My timezone is GMT+1. I trade BTC and ETH.',
  ttl:   86400 * 30,  // remember for 30 days
});
console.log('✅ Saved to memory');

// ── READ it back ────────────────────────
const memory = await mcp('mem_get', { key: 'user:preferences' });
console.log('🧠 Memory:', memory);

// ── SEE everything stored ───────────────
const all = await mcp('mem_list', { prefix: 'user:' });
console.log('📋 All user memory:', all);

// ── DELETE when no longer needed ────────
// await mcp('mem_delete', { key: 'user:preferences' });`,
  },

  {
    id: 'web-monitor',
    emoji: '🔍',
    title: 'Web Monitor',
    desc: 'Watch any URL. Every run, fetch it and check if something changed.',
    time: '2 min setup',
    difficulty: 'Beginner',
    editLines: ['YOUR_API_KEY_HERE', 'https://api.coincap.io/v2/assets/bitcoin', 'priceUsd'],
    code: `// ─────────────────────────────────────────
// WEB MONITOR  —  edit 3 lines
// ─────────────────────────────────────────
const API_KEY  = 'YOUR_API_KEY_HERE';               // from agentos-app.vercel.app/signup
const WATCH_URL = 'https://api.coincap.io/v2/assets/bitcoin'; // any URL you want to watch
const WATCH_KEY = 'priceUsd';                        // what field to track changes on
// ─────────────────────────────────────────

const BASE = '${BASE_URL}';

async function mcp(tool, input) {
  const res = await fetch(BASE + '/mcp', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, input }),
  });
  return (await res.json()).result;
}

async function webMonitor() {
  // Fetch the URL
  const response = await mcp('net_http_get', { url: WATCH_URL });
  const current = JSON.stringify(response.body?.data?.[WATCH_KEY] ?? response.body);

  // Compare with last stored value
  const previous = await mcp('mem_get', { key: 'monitor:last_value' });

  if (previous && previous !== current) {
    console.log('🔔 CHANGE DETECTED!');
    console.log('   Before: ' + previous);
    console.log('   After:  ' + current);

    // Log the change
    await mcp('fs_write', {
      path: '/monitor-log.txt',
      data: btoa('[' + new Date().toISOString() + '] Changed: ' + previous + ' → ' + current + '\\n'),
    });
  } else if (!previous) {
    console.log('👀 Now watching. Will alert on next change.');
  } else {
    console.log('✅ No change detected. Value: ' + current);
  }

  // Save current as the new baseline
  await mcp('mem_set', { key: 'monitor:last_value', value: current, ttl: 86400 });
}

webMonitor();`,
  },
];

export default function TemplatesPage() {
  const [copied, setCopied] = useState<string | null>(null);
  const [active, setActive] = useState(TEMPLATES[0].id);

  const current = TEMPLATES.find(t => t.id === active)!;

  function copy(code: string, id: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Nav */}
      <nav className="sticky top-0 z-40 backdrop-blur-md"
        style={{ background: 'rgba(10,10,20,0.9)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center font-black font-mono text-xs"
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--accent)', color: 'var(--accent)' }}>
              A
            </div>
            <span className="font-mono font-bold text-sm">Agent<span style={{ color: 'var(--accent)' }}>OS</span></span>
          </Link>
          <div className="flex items-center gap-5 text-sm" style={{ color: 'var(--text-muted)' }}>
            <Link href="/docs/guide" className="hover:text-white transition-colors">Guide</Link>
            <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            <Link href="/signup" className="btn-primary text-xs px-4 py-2">Get API Key →</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="badge badge-accent mb-4">Templates</div>
          <h1 className="text-4xl font-black mb-3">
            Start in under <span style={{ color: 'var(--accent)' }}>5 minutes</span>
          </h1>
          <p className="text-lg max-w-2xl" style={{ color: 'var(--text-muted)' }}>
            Copy a template, paste in your API key, change 1–2 lines, run it.
            No experience needed.
          </p>
          <div className="flex items-center gap-3 mt-4">
            <span className="text-sm px-3 py-1 rounded-full" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#86efac' }}>
              ✓ No framework needed
            </span>
            <span className="text-sm px-3 py-1 rounded-full" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#86efac' }}>
              ✓ Works in browser or Node.js
            </span>
            <span className="text-sm px-3 py-1 rounded-full" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#86efac' }}>
              ✓ Free to start
            </span>
          </div>
        </div>

        {/* Step 0 */}
        <div className="card p-5 mb-8" style={{ borderColor: 'var(--border-active)' }}>
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 flex items-center justify-center font-black text-sm flex-shrink-0"
              style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}>
              0
            </div>
            <div>
              <div className="font-bold mb-1">Before you start — get your API key</div>
              <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
                Go to <Link href="/signup" style={{ color: 'var(--accent)' }}>/signup</Link>, enter your email and agent name.
                Copy the API key you receive — you&apos;ll paste it into every template below.
              </p>
              <Link href="/signup" className="btn-primary text-sm px-4 py-2 inline-block">Create free account →</Link>
            </div>
          </div>
        </div>

        {/* Template selector + code */}
        <div className="grid lg:grid-cols-[280px,1fr] gap-6">
          {/* Sidebar */}
          <div className="space-y-2">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className="w-full text-left p-4 rounded-xl transition-all"
                style={active === t.id
                  ? { background: 'var(--accent-glow)', border: '1px solid var(--accent)' }
                  : { background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{t.emoji}</span>
                  <span className="font-semibold text-sm">{t.title}</span>
                </div>
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{t.desc}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(34,197,94,0.1)', color: '#86efac', border: '1px solid rgba(34,197,94,0.2)' }}>
                    ⏱ {t.time}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{t.difficulty}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Code panel */}
          <div>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3"
                style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">{current.emoji}</span>
                  <div>
                    <div className="font-bold text-sm">{current.title}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{current.desc}</div>
                  </div>
                </div>
                <button
                  onClick={() => copy(current.code, current.id)}
                  className="text-sm font-semibold px-4 py-2 rounded-lg transition-all flex-shrink-0"
                  style={copied === current.id
                    ? { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac' }
                    : { background: 'transparent', border: '1px solid var(--border-active)', color: 'var(--text-secondary)' }}>
                  {copied === current.id ? '✓ Copied!' : 'Copy code'}
                </button>
              </div>

              {/* What to edit callout */}
              <div className="px-4 py-3 text-xs" style={{ background: 'rgba(245,158,11,0.06)', borderBottom: '1px solid rgba(245,158,11,0.15)', color: '#fcd34d' }}>
                ✏️ <strong>Only edit the top section</strong> — replace <code className="font-mono bg-black/20 px-1 rounded">YOUR_API_KEY_HERE</code> and the lines below it. Everything else runs as-is.
              </div>

              {/* Code */}
              <div style={{ background: '#050508' }}>
                <pre className="p-5 text-xs font-mono leading-relaxed overflow-x-auto"
                  style={{ color: '#94a3b8' }}>
                  {current.code.split('\n').map((line, i) => {
                    const isEditLine = current.editLines.some(e => line.includes(e));
                    return (
                      <div
                        key={i}
                        style={isEditLine ? {
                          background: 'rgba(245,158,11,0.08)',
                          marginLeft: '-20px',
                          paddingLeft: '20px',
                          marginRight: '-20px',
                          paddingRight: '20px',
                          color: '#fcd34d',
                        } : {}}>
                        {line}
                      </div>
                    );
                  })}
                </pre>
              </div>
            </div>

            {/* How to run */}
            <div className="mt-4 card p-4">
              <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-dim)' }}>
                How to run this
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  { label: 'In browser (easiest)', desc: 'Open DevTools → Console → paste and hit Enter' },
                  { label: 'Node.js', desc: 'Save as agent.js → run: node agent.js' },
                  { label: 'In Studio', desc: 'Go to /studio → paste commands one by one' },
                ].map(opt => (
                  <div key={opt.label} className="rounded-lg p-3"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                    <div className="font-semibold text-xs mb-1">{opt.label}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{opt.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 rounded-2xl p-8 text-center"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-active)' }}>
          <h2 className="text-2xl font-black mb-2">Want something custom?</h2>
          <p className="mb-5" style={{ color: 'var(--text-muted)' }}>
            These templates are a starting point. AgentOS can do a lot more — combine any of the primitives to build exactly what you need.
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link href="/docs/guide" className="btn-primary px-5 py-2.5 text-sm">Read the full guide</Link>
            <Link href="/marketplace" className="btn-outline px-5 py-2.5 text-sm">Browse skill templates</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
