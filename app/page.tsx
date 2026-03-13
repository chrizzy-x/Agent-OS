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
            <a
              href="/api"
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              API
            </a>
            <a
              href="https://docs.agentos.io"
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Docs
            </a>
            <a
              href="https://github.com/chrizzy-x/Agent-OS"
              className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-700 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Star on GitHub
            </a>
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
            href="https://github.com/chrizzy-x/Agent-OS"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors text-center"
            target="_blank"
            rel="noopener noreferrer"
          >
            Star on GitHub
          </a>
          <a
            href="https://docs.agentos.io"
            className="border border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:border-gray-400 hover:bg-gray-50 transition-colors text-center"
          >
            Read the Docs
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

      {/* Quick start */}
      <section className="bg-gray-900 text-white py-16">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Get started in 5 minutes</h2>
          <p className="text-gray-400 mb-8">
            Deploy to Vercel, connect Supabase + Redis, get your API key.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="https://docs.agentos.io"
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Quick Start Guide
            </a>
            <a
              href="https://discord.gg/agentos"
              className="border border-gray-700 text-gray-300 px-6 py-3 rounded-lg font-medium hover:border-gray-500 hover:text-white transition-colors"
            >
              Join Discord
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
            <a href="https://docs.agentos.io" className="hover:text-gray-900 transition-colors">Docs</a>
            <a href="https://discord.gg/agentos" className="hover:text-gray-900 transition-colors">Discord</a>
            <a href="/api" className="hover:text-gray-900 transition-colors">API</a>
          </div>
          <span className="text-sm text-gray-400">MIT License</span>
        </div>
      </footer>
    </div>
  );
}
