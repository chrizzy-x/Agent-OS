import Link from 'next/link';
import CodeBlock from '@/components/CodeBlock';
import FeatureCard from '@/components/FeatureCard';

const CODE_EXAMPLE = `import { AgentOS } from '@agentos/sdk';

const os = new AgentOS({
  apiUrl: 'https://agentos-app.vercel.app',
  apiKey: process.env.AGENT_OS_KEY
});

// Monitor Bitcoin price
const price = await os.net.http_get(
  'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'
);

// Cache for 60 seconds
await os.mem.set('btc_price', price.data.price, 60);

// Store in database
await os.db.insert('prices', {
  symbol: 'BTC',
  price: parseFloat(price.data.price),
  timestamp: Date.now()
});

// Run analysis
const signal = await os.proc.execute(\`
import numpy as np
prices = \${JSON.stringify(priceHistory)}
rsi = calculate_rsi(prices)
print('BUY' if rsi < 30 else 'HOLD')
\`, 'python');

// Publish event
if (signal.output === 'BUY') {
  await os.events.publish('trading.signals', {
    symbol: 'BTC',
    action: 'BUY',
    price: price.data.price
  });
}`;

const BEFORE_CODE = `// Before Agent OS
const redis = new Redis(process.env.REDIS_URL);
const supabase = createClient(url, key);
const { exec } = require('child_process');

// Set up auth, rate limiting, sandboxing...
// Handle errors, timeouts, quotas...
// Write 500+ lines of infrastructure code
// before you can run a single line of agent logic.`;

const AFTER_CODE = `// With Agent OS
const os = new AgentOS({ apiKey: process.env.AGENT_OS_KEY });

await os.mem.set('key', value);
await os.db.insert('table', row);
await os.proc.execute(code, 'python');
// Done. All auth, isolation, and quotas included.`;

const FEATURES = [
  {
    icon: '💾',
    name: 'mem',
    description: 'Redis-backed key-value store with TTL, namespaced per agent. Set, get, delete, list, increment, and expire keys.',
    tools: ['mem_set', 'mem_get', 'mem_delete', 'mem_list', 'mem_incr', 'mem_expire'],
  },
  {
    icon: '🗂️',
    name: 'fs',
    description: 'Cloud file storage backed by Supabase Storage. Each agent gets an isolated directory. Read, write, list, stat, mkdir.',
    tools: ['fs_read', 'fs_write', 'fs_list', 'fs_delete', 'fs_mkdir', 'fs_stat'],
  },
  {
    icon: '🗄️',
    name: 'db',
    description: 'PostgreSQL database with per-agent schema isolation. Run queries, transactions, and DDL — all parameterized.',
    tools: ['db_query', 'db_insert', 'db_update', 'db_delete', 'db_create_table', 'db_transaction'],
  },
  {
    icon: '🌐',
    name: 'net',
    description: 'Outbound HTTP with SSRF protection, domain allowlisting, and rate limiting. Agents can only reach approved hosts.',
    tools: ['net_http_get', 'net_http_post', 'net_http_put', 'net_http_delete', 'net_dns_resolve'],
  },
  {
    icon: '⚙️',
    name: 'proc',
    description: 'Sandboxed code execution for Python, JavaScript, and Bash. Each run gets a temp directory, timeout, and resource limits.',
    tools: ['proc_execute', 'proc_schedule', 'proc_spawn', 'proc_kill', 'proc_list'],
  },
  {
    icon: '📡',
    name: 'events',
    description: 'Redis pub/sub messaging. Agents publish and subscribe to topics, enabling coordination between multiple agents.',
    tools: ['events_publish', 'events_subscribe', 'events_unsubscribe', 'events_list_topics'],
  },
];

const USE_CASES = [
  {
    title: 'Trading Bot',
    description: 'Fetch live prices via net, cache in mem, store history in db, run signal analysis via proc, coordinate via events.',
  },
  {
    title: 'Research Assistant',
    description: 'Crawl pages with net, extract and store data in db, cache results in mem, save reports to fs.',
  },
  {
    title: 'Customer Service',
    description: 'Store conversation history in db, cache user context in mem, call external APIs via net, trigger workflows via events.',
  },
  {
    title: 'Data Pipeline',
    description: 'Download files via net, write to fs, transform with proc, load into db, notify downstream agents via events.',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <span className="font-mono font-bold text-lg text-gray-900">Agent OS</span>
          <div className="flex items-center gap-4">
            <Link href="/marketplace" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Marketplace</Link>
            <Link href="/docs" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Docs</Link>
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Dashboard</Link>
            <Link href="/signup" className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 pt-20 pb-16 text-center">
        <div className="inline-block bg-blue-50 text-blue-700 text-sm font-medium px-3 py-1 rounded-full mb-6">
          Open source · MIT License
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold mb-4 tracking-tight">
          Agent OS
        </h1>
        <p className="text-xl sm:text-2xl text-gray-600 mb-3 max-w-2xl mx-auto">
          Operating system infrastructure for AI agents.
        </p>
        <p className="text-lg text-gray-500 mb-10 font-mono">
          6 primitives. 5 minutes. Production ready.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/signup"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors text-center"
          >
            Get Started Free
          </a>
          <a
            href="https://github.com/chrizzy-x/Agent-OS"
            className="border border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:border-gray-400 hover:bg-gray-50 transition-colors text-center"
            target="_blank"
            rel="noopener noreferrer"
          >
            Star on GitHub
          </a>
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="bg-gray-50 border-y border-gray-100 py-16">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">
            Stop reinventing infrastructure
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="text-sm font-semibold text-red-600 mb-3 uppercase tracking-wide">
                Before Agent OS
              </div>
              <CodeBlock code={BEFORE_CODE} language="typescript" />
            </div>
            <div>
              <div className="text-sm font-semibold text-green-600 mb-3 uppercase tracking-wide">
                With Agent OS
              </div>
              <CodeBlock code={AFTER_CODE} language="typescript" />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-3">6 primitives</h2>
        <p className="text-center text-gray-500 mb-12">
          Everything an agent needs to read, write, compute, and communicate.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <FeatureCard key={f.name} {...f} />
          ))}
        </div>
      </section>

      {/* Code Example */}
      <section className="bg-gray-50 border-y border-gray-100 py-16">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-3">See it in action</h2>
          <p className="text-center text-gray-500 mb-10">
            A trading agent that uses all 6 primitives in under 40 lines.
          </p>
          <CodeBlock code={CODE_EXAMPLE} language="typescript" />
        </div>
      </section>

      {/* Use Cases */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-3">What people build</h2>
        <p className="text-center text-gray-500 mb-12">
          Agents that work autonomously in production.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {USE_CASES.map((uc) => (
            <div
              key={uc.title}
              className="border border-gray-200 rounded-lg p-6 hover:border-blue-200 hover:shadow-sm transition-all"
            >
              <h3 className="font-semibold text-lg mb-2">{uc.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{uc.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Skills Marketplace */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="flex items-end justify-between mb-3">
          <h2 className="text-3xl font-bold">Skills Marketplace</h2>
          <Link href="/marketplace" className="text-sm text-blue-600 hover:underline">
            Browse all skills →
          </Link>
        </div>
        <p className="text-gray-500 mb-10">
          Extend Agent OS with community-built capabilities. Install only what you need.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {[
            { icon: '🔄', name: 'JSON Transformer', cat: 'Data & Analytics', desc: 'Parse, filter, and reshape JSON data.', slug: 'json-transformer' },
            { icon: '📝', name: 'Text Utilities', cat: 'Documents', desc: 'Slugify, truncate, extract emails, count words.', slug: 'text-utils' },
            { icon: '📊', name: 'Math & Stats', cat: 'Data & Analytics', desc: 'Mean, median, std dev, moving averages.', slug: 'math-stats' },
            { icon: '📅', name: 'Date & Time', cat: 'Data & Analytics', desc: 'Parse, format, diff, and add dates.', slug: 'date-time' },
            { icon: '🌐', name: 'HTTP Request Builder', cat: 'Web & Browser', desc: 'Build headers, encode params, parse responses.', slug: 'http-request-builder' },
            { icon: '📋', name: 'CSV Processor', cat: 'Documents', desc: 'Parse CSV, filter rows, sum columns.', slug: 'csv-processor' },
          ].map(s => (
            <Link key={s.slug} href={`/marketplace/${s.slug}`}
              className="group border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition-all bg-white">
              <div className="flex items-start justify-between mb-2">
                <span className="text-2xl">{s.icon}</span>
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{s.cat}</span>
              </div>
              <div className="font-semibold text-gray-900 text-sm mb-1 group-hover:text-blue-600">{s.name}</div>
              <div className="text-xs text-gray-500 leading-relaxed">{s.desc}</div>
              <div className="mt-3 text-xs font-medium text-green-600">Free</div>
            </Link>
          ))}
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 flex items-center justify-between gap-6">
          <div>
            <p className="font-semibold text-blue-900 mb-1">Build skills. Earn 70% revenue share.</p>
            <p className="text-sm text-blue-700">
              Publish your skills to the marketplace and earn from every API call.
            </p>
          </div>
          <Link href="/developer"
            className="flex-shrink-0 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            Developer Dashboard →
          </Link>
        </div>
      </section>

      {/* Quick start */}
      <section className="bg-gray-900 text-white py-16">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Get started in 5 minutes</h2>
          <p className="text-gray-400 mb-8">
            Create your agent in 30 seconds. No credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/signup"
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Get Started Free
            </a>
            <a
              href="https://github.com/chrizzy-x/Agent-OS"
              className="border border-gray-700 text-gray-300 px-6 py-3 rounded-lg font-medium hover:border-gray-500 hover:text-white transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-mono font-bold text-gray-900">Agent OS</span>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <a href="https://github.com/chrizzy-x/Agent-OS" className="hover:text-gray-900 transition-colors" target="_blank" rel="noopener noreferrer">GitHub</a>
            <Link href="/marketplace" className="hover:text-gray-900 transition-colors">Marketplace</Link>
            <Link href="/docs" className="hover:text-gray-900 transition-colors">Docs</Link>
            <Link href="/developer" className="hover:text-gray-900 transition-colors">Developer</Link>
            <Link href="/dashboard" className="hover:text-gray-900 transition-colors">Dashboard</Link>
          </div>
          <span className="text-sm text-gray-400">MIT License</span>
        </div>
      </footer>
    </div>
  );
}
