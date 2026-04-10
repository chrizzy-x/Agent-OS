import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';
import { APP_URL } from '@/lib/config';

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-100 sticky top-0 z-40 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono font-bold text-lg text-gray-900">Agent OS</Link>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/docs" className="text-blue-600">← Docs</Link>
            <Link href="/docs/sdk" className="hover:text-gray-900">Quick Start</Link>
            <Link href="/docs/primitives" className="hover:text-gray-900">Primitives</Link>
            <Link href="/docs/ffp" className="hover:text-gray-900">FFP</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="inline-block bg-purple-50 text-purple-700 text-sm font-medium px-3 py-1 rounded-full mb-4">
          Complete Guide
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-2">AgentOS — From Zero to Running</h1>
        <p className="text-lg text-gray-500 mb-3">
          A plain-English walkthrough of everything: what AgentOS is, what you can actually build with it, and how every part of the platform works — no experience required.
        </p>
        <p className="text-sm text-gray-400 mb-10">For technical details jump to <Link href="/docs/sdk" className="text-blue-600 underline">Quick Start</Link> or <Link href="/docs/primitives" className="text-blue-600 underline">Primitives</Link>.</p>

        <TOC items={[
          { id: 'what-is', label: 'What is AgentOS?' },
          { id: 'create-account', label: 'Step 1 — Create your account & get your API key' },
          { id: 'what-next', label: 'Step 2 — What can you actually do?' },
          { id: 'use-cases', label: 'Step 3 — Real-life use cases' },
          { id: 'marketplace', label: 'Step 4 — Skills marketplace' },
          { id: 'studio', label: 'Step 5 — Studio console (test without writing code)' },
          { id: 'publish', label: 'Step 6 — Publish your own skill & earn money' },
          { id: 'ops', label: 'Step 7 — Multi-agent ops & infrastructure crew' },
          { id: 'ffp', label: 'Step 8 — FFP / consensus mode' },
        ]} />

        {/* SECTION 1 */}
        <Section id="what-is" title="What is AgentOS?">
          <p>
            AgentOS is a <strong>backend platform for AI agents</strong>. Think of it as a cloud operating system that gives any AI agent — whether it lives inside Claude, GPT, a custom bot, or your own code — a real set of tools it can use:
          </p>
          <ul className="list-disc ml-6 mt-3 space-y-2 text-gray-600">
            <li><strong>Memory</strong> — store and recall data between conversations</li>
            <li><strong>File storage</strong> — read and write files, up to 1 GB per agent</li>
            <li><strong>A private database</strong> — create tables, run SQL queries, store structured data</li>
            <li><strong>HTTP requests</strong> — call any external API (weather, crypto prices, news, etc.)</li>
            <li><strong>Code execution</strong> — run Python or JavaScript in a sandbox</li>
            <li><strong>Events</strong> — publish and subscribe to real-time messages between agents</li>
          </ul>
          <p className="mt-4">
            You connect to AgentOS with a single API key. Every tool call goes through one endpoint: <code className="bg-gray-100 px-1 rounded text-sm">/mcp</code>. No separate SDKs, no complicated setup.
          </p>
          <Callout emoji="💡">
            The name &quot;MCP&quot; stands for <strong>Model Context Protocol</strong> — the open standard that lets AI models call external tools. AgentOS implements MCP so your agent can use all 30+ tools with zero integration overhead.
          </Callout>
        </Section>

        {/* SECTION 2 */}
        <Section id="create-account" title="Step 1 — Create your account & get your API key">
          <p>Go to <Link href="/signup" className="text-blue-600 underline">/signup</Link>. Enter your email address and a name for your agent. That&apos;s it.</p>
          <p className="mt-3">You&apos;ll get back:</p>
          <ul className="list-disc ml-6 mt-2 space-y-1 text-gray-600">
            <li><strong>Agent ID</strong> — your permanent identifier (e.g. <code className="bg-gray-100 px-1 rounded text-xs">agent_abc123...</code>)</li>
            <li><strong>API Key</strong> — a JWT bearer token. <span className="text-red-600 font-medium">Save this — it is shown only once.</span></li>
          </ul>
          <p className="mt-3 text-gray-600">Lost your key? Sign in at <Link href="/signin" className="text-blue-600 underline">/signin</Link> to generate a new bearer token from your browser session.</p>

          <h3 className="text-base font-semibold text-gray-900 mt-6 mb-2">Or create via API (curl):</h3>
          <Code>{`curl -s -X POST ${APP_URL}/api/signup \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@example.com","agentName":"My Agent"}' | jq`}</Code>
          <Result>{`{
  "credentials": {
    "agentId":   "agent_abc123...",
    "apiKey":    "eyJhbGciOiJIUzI1NiJ9...",
    "expiresIn": "90 days"
  }
}`}</Result>

          <h3 className="text-base font-semibold text-gray-900 mt-6 mb-2">Save your key in your project:</h3>
          <Code>{`# .env
AGENT_OS_KEY=eyJhbGciOiJIUzI1NiJ9...`}</Code>

          <h3 className="text-base font-semibold text-gray-900 mt-6 mb-2">Helper function — copy this once, use everywhere:</h3>
          <Code>{`const AGENT_OS_URL = '${APP_URL}';
const API_KEY = process.env.AGENT_OS_KEY;

async function mcp(tool, input) {
  const res = await fetch(AGENT_OS_URL + '/mcp', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tool, input }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Agent OS error');
  return data.result;
}`}</Code>
          <p className="text-sm text-gray-500 mt-2">All examples below use this <code className="bg-gray-100 px-1 rounded text-xs">mcp()</code> helper.</p>
        </Section>

        {/* SECTION 3 */}
        <Section id="what-next" title="Step 2 — What can you actually do?">
          <p>After you have your API key, you have access to <strong>6 primitives</strong> (categories of tools) and <strong>30+ individual tools</strong>. Here&apos;s the plain-English breakdown:</p>

          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            {[
              { name: 'mem — Memory', color: '#a855f7', bg: 'bg-purple-50', border: 'border-purple-200', tools: ['mem_set', 'mem_get', 'mem_delete', 'mem_list'], desc: 'Store key-value data in a fast cache. Perfect for remembering context between conversations, sessions, or API calls. Data can expire automatically (TTL).' },
              { name: 'fs — File Storage', color: '#06b6d4', bg: 'bg-cyan-50', border: 'border-cyan-200', tools: ['fs_write', 'fs_read', 'fs_list', 'fs_delete'], desc: 'Your agent gets 1 GB of private file storage. Write reports, logs, exports, generated images, CSVs — anything.' },
              { name: 'db — Database', color: '#3b82f6', bg: 'bg-blue-50', border: 'border-blue-200', tools: ['db_create_table', 'db_insert', 'db_query', 'db_update', 'db_delete'], desc: 'A private PostgreSQL-compatible database. Create tables, insert rows, run queries. Every agent gets an isolated schema — no shared data.' },
              { name: 'net — HTTP', color: '#22c55e', bg: 'bg-green-50', border: 'border-green-200', tools: ['net_http_get', 'net_http_post', 'net_http_put', 'net_http_delete'], desc: 'Call any external API from your agent. Fetch live crypto prices, weather, news headlines, send webhooks, hit your own backend.' },
              { name: 'proc — Code Execution', color: '#f59e0b', bg: 'bg-amber-50', border: 'border-amber-200', tools: ['proc_execute', 'proc_schedule', 'proc_spawn', 'proc_kill'], desc: 'Run Python or JavaScript in a sandboxed environment. Parse data, run calculations, transform formats — anything code can do.' },
              { name: 'events — Pub/Sub', color: '#ec4899', bg: 'bg-pink-50', border: 'border-pink-200', tools: ['events_publish', 'events_subscribe', 'events_list_topics'], desc: 'Send real-time messages between agents or services. Trigger workflows, broadcast updates, coordinate multi-agent tasks.' },
            ].map(p => (
              <div key={p.name} className={`rounded-xl p-4 border ${p.border} ${p.bg}`}>
                <div className="font-mono font-bold text-sm mb-1" style={{ color: p.color }}>{p.name}</div>
                <p className="text-sm text-gray-600 mb-2">{p.desc}</p>
                <div className="flex flex-wrap gap-1">
                  {p.tools.map(t => (
                    <code key={t} className="text-xs px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-700">{t}</code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* SECTION 4 */}
        <Section id="use-cases" title="Step 3 — Real-life use cases">
          <p className="text-gray-600 mb-6">Below are complete, working examples of things real people build on AgentOS.</p>

          <UseCase n="A" title="Crypto price alert bot">
            <p className="text-gray-600 mb-3">Every 5 minutes, fetch the live BTC price and store it. If the price drops more than 5% from the last stored high, log an alert to a file.</p>
            <Code>{`// 1. Fetch live price from a public API
const price = await mcp('net_http_get', {
  url: 'https://api.coincap.io/v2/assets/bitcoin',
});
const currentPrice = parseFloat(price.body.data.priceUsd);

// 2. Read the last recorded high from memory
const lastHigh = parseFloat(await mcp('mem_get', { key: 'btc_high' }) ?? '0');

// 3. Update the high if needed
if (currentPrice > lastHigh) {
  await mcp('mem_set', { key: 'btc_high', value: String(currentPrice) });
}

// 4. Alert if price dropped >5% from high
const drop = ((lastHigh - currentPrice) / lastHigh) * 100;
if (drop > 5) {
  const alert = \`[ALERT] BTC dropped \${drop.toFixed(1)}% from $\${lastHigh.toFixed(0)} to $\${currentPrice.toFixed(0)}\`;
  const existing = await mcp('fs_read', { path: '/alerts.log' }) ?? '';
  await mcp('fs_write', {
    path: '/alerts.log',
    data: btoa(existing + '\\n' + new Date().toISOString() + ' ' + alert),
  });
  console.log(alert);
}`}</Code>
          </UseCase>

          <UseCase n="B" title="Personal research assistant with memory">
            <p className="text-gray-600 mb-3">Every time you research a topic, store key facts so your agent remembers them in future conversations — no matter what AI model you&apos;re using.</p>
            <Code>{`// Save a research note
await mcp('mem_set', {
  key: 'research:solana-tps',
  value: 'Solana handles ~65,000 TPS theoretically, ~4,000 sustained in production as of Q1 2026.',
  ttl: 86400 * 30, // remember for 30 days
});

// Later — retrieve it
const note = await mcp('mem_get', { key: 'research:solana-tps' });
// → 'Solana handles ~65,000 TPS theoretically...'

// List all research notes
const allNotes = await mcp('mem_list', { prefix: 'research:' });
// → [{ key: 'research:solana-tps', ... }, ...]`}</Code>
          </UseCase>

          <UseCase n="C" title="Automated report generator">
            <p className="text-gray-600 mb-3">Pull data from an external API, run a Python analysis on it, and save the output as a formatted report file — entirely in one agent run.</p>
            <Code>{`// 1. Fetch data
const response = await mcp('net_http_get', {
  url: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10',
});
const coins = response.body;

// 2. Analyse with Python
const analysis = await mcp('proc_execute', {
  language: 'python',
  code: \`
import json, sys
coins = \${JSON.stringify(coins)}
report_lines = []
for c in coins:
    pct = c.get('price_change_percentage_24h', 0)
    arrow = '▲' if pct > 0 else '▼'
    report_lines.append(f"{c['symbol'].upper():8} \${c['current_price']:>12,.2f}  {arrow} {abs(pct):.2f}%")
print('\\n'.join(report_lines))
\`,
  timeout: 10000,
});

// 3. Save as file
const reportText = \`Top 10 Coins — \${new Date().toUTCString()}\\n\` +
  \`\${'-'.repeat(40)}\\n\` + analysis.stdout;

await mcp('fs_write', {
  path: '/reports/crypto-daily.txt',
  data: btoa(reportText),
});
console.log('Report saved:', reportText);`}</Code>
          </UseCase>

          <UseCase n="D" title="Multi-agent task coordination">
            <p className="text-gray-600 mb-3">Agent A completes some work and publishes an event. Agent B is subscribed and immediately picks it up — like a task queue, but for AI agents.</p>
            <Code>{`// Agent A — publisher (when work is done)
await mcp('events_publish', {
  topic:   'tasks.completed',
  payload: {
    task_id:  'task_123',
    result:   { status: 'success', output: 'analysis done' },
    agent_id: 'agent_A',
  },
});

// Agent B — subscriber (listening continuously)
const events = await mcp('events_subscribe', {
  topic: 'tasks.completed',
  limit: 10,
});
for (const event of events) {
  console.log('Agent B received task result:', event.payload);
  // ...process the result
}`}</Code>
          </UseCase>

          <UseCase n="F" title="X (Twitter) account manager — auto-replies, posts & growth">
            <p className="text-gray-600 mb-3">A fully autonomous agent that monitors your X mentions, auto-replies with context, schedules posts at peak hours, and logs engagement to a DB — runs 24/7 without you.</p>
            <Code>{`// Run this on a cron every 5 minutes
const AGENT_ID = process.env.AGENT_ID;

// 1. Fetch unseen mentions (stored cursor in memory)
const cursor = await mcp('mem_get', { key: 'x:last_mention_id' }) ?? '0';
const mentions = await mcp('net_http_get', {
  url: \`https://api.twitter.com/2/users/\${AGENT_ID}/mentions?since_id=\${cursor}&max_results=10\`,
  headers: { Authorization: 'Bearer ' + process.env.X_BEARER_TOKEN },
});
const tweets = mentions.body?.data ?? [];

for (const tweet of tweets) {
  // 2. Generate a reply using context from memory
  const persona = await mcp('mem_get', { key: 'x:persona' })
    ?? 'Helpful, technical, direct. Max 2 sentences.';

  const reply = await mcp('proc_execute', {
    language: 'javascript',
    code: \`
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 100,
          messages: [{ role: 'user', content: 'Reply to this tweet (persona: \${persona}): \${tweet.text}' }] }),
      });
      const d = await res.json();
      return d.content[0].text;
    \`,
  });

  // 3. Post the reply
  await mcp('net_http_post', {
    url: 'https://api.twitter.com/2/tweets',
    headers: { Authorization: 'Bearer ' + process.env.X_BEARER_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: reply.stdout, reply: { in_reply_to_tweet_id: tweet.id } }),
  });

  // 4. Log to DB
  await mcp('db_insert', { table: 'x_replies', data: { tweet_id: tweet.id, reply: reply.stdout, replied_at: new Date().toISOString() } });
}

// 5. Save cursor so we don't re-process
if (tweets.length > 0) await mcp('mem_set', { key: 'x:last_mention_id', value: tweets[0].id });

// 6. Schedule a post if it's peak hour (9am, 12pm, 6pm UTC)
const hour = new Date().getUTCHours();
if ([9, 12, 18].includes(hour)) {
  const nextPost = await mcp('db_query', {
    sql: "SELECT content FROM scheduled_posts WHERE posted = false ORDER BY created_at ASC LIMIT 1",
  });
  if (nextPost[0]) {
    await mcp('net_http_post', {
      url: 'https://api.twitter.com/2/tweets',
      headers: { Authorization: 'Bearer ' + process.env.X_BEARER_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: nextPost[0].content }),
    });
    await mcp('db_update', { table: 'scheduled_posts', where: { content: nextPost[0].content }, data: { posted: true } });
  }
}`}</Code>
          </UseCase>

          <UseCase n="G" title="AI marketer swarm — 5 agents, one campaign">
            <p className="text-gray-600 mb-3">Five specialized agents coordinate a full marketing campaign: one writes copy, one posts to X, one handles Reddit, one tracks metrics, one optimizes based on results. They communicate via events.</p>
            <Code>{`// ── AGENT 1: Copywriter ─────────────────────────────────────
// Generates campaign copy and publishes to the swarm

const topic = await mcp('mem_get', { key: 'campaign:topic' }); // e.g. "AgentOS v3.2 launch"
const copy = await mcp('proc_execute', {
  language: 'javascript',
  code: \`
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [{ role: 'user', content:
          'Write 3 variations of marketing copy for: \${topic}\\n' +
          '1. X post (max 280 chars, punchy)\\n' +
          '2. Reddit post (technical, with code snippet)\\n' +
          '3. Email subject line (urgency + benefit)\\n' +
          'Return as JSON: { x, reddit, email }' }],
      }),
    });
    return (await res.json()).content[0].text;
  \`,
});

const variations = JSON.parse(copy.stdout);

// Broadcast to all agents via events
await mcp('events_publish', {
  topic: 'campaign.copy_ready',
  payload: { ...variations, topic, campaign_id: 'launch_v32', ts: Date.now() },
});


// ── AGENT 2: X Poster ────────────────────────────────────────
// Listens for copy_ready and posts to X

const events = await mcp('events_subscribe', { topic: 'campaign.copy_ready', limit: 1 });
if (events[0]) {
  const { x: text, campaign_id } = events[0].payload;
  const tweet = await mcp('net_http_post', {
    url: 'https://api.twitter.com/2/tweets',
    headers: { Authorization: 'Bearer ' + process.env.X_BEARER_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  // Report metrics back
  await mcp('events_publish', {
    topic: 'campaign.metric',
    payload: { channel: 'x', campaign_id, tweet_id: tweet.body?.data?.id, posted_at: new Date().toISOString() },
  });
}


// ── AGENT 3: Reddit Poster ───────────────────────────────────

const redditEvents = await mcp('events_subscribe', { topic: 'campaign.copy_ready', limit: 1 });
if (redditEvents[0]) {
  const { reddit: body, campaign_id } = redditEvents[0].payload;
  // Post to relevant subreddit via Reddit API
  await mcp('net_http_post', {
    url: 'https://oauth.reddit.com/api/submit',
    headers: { Authorization: 'Bearer ' + process.env.REDDIT_TOKEN, 'User-Agent': 'AgentOS/1.0' },
    body: JSON.stringify({ sr: 'artificial', kind: 'self', title: 'AgentOS v3.2 drops today', text: body }),
  });
  await mcp('events_publish', { topic: 'campaign.metric', payload: { channel: 'reddit', campaign_id } });
}


// ── AGENT 4: Metrics Tracker ─────────────────────────────────
// Aggregates results from all channels into DB

const metrics = await mcp('events_subscribe', { topic: 'campaign.metric', limit: 50 });
for (const m of metrics) {
  await mcp('db_insert', {
    table: 'campaign_metrics',
    data: { ...m.payload, recorded_at: new Date().toISOString() },
  });
}
const summary = await mcp('db_query', {
  sql: "SELECT channel, COUNT(*) as posts FROM campaign_metrics WHERE campaign_id = $1 GROUP BY channel",
  params: ['launch_v32'],
});
await mcp('mem_set', { key: 'campaign:launch_v32:summary', value: JSON.stringify(summary) });


// ── AGENT 5: Optimizer ───────────────────────────────────────
// Reads metrics, decides what to double-down on

const campaignSummary = JSON.parse(await mcp('mem_get', { key: 'campaign:launch_v32:summary' }) ?? '[]');
const best = campaignSummary.sort((a, b) => b.posts - a.posts)[0]?.channel;
if (best) {
  // Tell copywriter to generate more content for winning channel
  await mcp('events_publish', {
    topic: 'campaign.optimize',
    payload: { action: 'boost', channel: best, reason: 'highest_engagement' },
  });
}`}</Code>
          </UseCase>

          <UseCase n="E" title="Agent with a persistent database">
            <p className="text-gray-600 mb-3">Give your agent a real SQL database to store structured data across sessions — customer records, task history, logs, anything.</p>
            <Code>{`// 1. Create a table once (safe to call multiple times — checks first)
await mcp('db_create_table', {
  table: 'conversations',
  schema: [
    { column: 'id',         type: 'uuid',        primaryKey: true },
    { column: 'user_id',    type: 'text',        nullable: false },
    { column: 'message',    type: 'text',        nullable: false },
    { column: 'role',       type: 'text',        nullable: false },
    { column: 'created_at', type: 'timestamptz', nullable: false },
  ],
});

// 2. Insert a message
await mcp('db_insert', {
  table: 'conversations',
  data: {
    id:         crypto.randomUUID(),
    user_id:    'user_42',
    message:    'What is the weather in London?',
    role:       'user',
    created_at: new Date().toISOString(),
  },
});

// 3. Query conversation history for a user
const history = await mcp('db_query', {
  sql:    'SELECT role, message, created_at FROM conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
  params: ['user_42'],
});
console.log('History:', history);`}</Code>
          </UseCase>
        </Section>

        {/* SECTION 5 */}
        <Section id="marketplace" title="Step 4 — Skills marketplace">
          <p className="text-gray-600 mb-4">
            Skills are pre-built capabilities you can install and call instantly. Instead of writing code to parse PDFs, translate text, or process images — install a skill and call it with one line.
          </p>
          <p className="text-gray-600 mb-6">
            Browse at <Link href="/marketplace" className="text-blue-600 underline">/marketplace</Link>. Skills are free or usage-based (you pay per call).
          </p>

          <h3 className="text-base font-semibold text-gray-900 mb-2">Install a skill:</h3>
          <Code>{`await fetch('${APP_URL}/api/skills/install', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ skill_id: '<skill-uuid-from-marketplace>' }),
});`}</Code>

          <h3 className="text-base font-semibold text-gray-900 mt-6 mb-2">Call a skill capability:</h3>
          <Code>{`const result = await fetch('${APP_URL}/api/skills/use', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    skill_slug:  'json-transformer',
    capability:  'filter',
    params:      { array: myData, key: 'status', value: 'active' },
  }),
}).then(r => r.json());

console.log(result.result); // filtered data`}</Code>

          <h3 className="text-base font-semibold text-gray-900 mt-6 mb-2">See your installed skills:</h3>
          <Code>{`const { installed_skills } = await fetch('${APP_URL}/api/skills/installed', {
  headers: { Authorization: 'Bearer ' + API_KEY },
}).then(r => r.json());

installed_skills.forEach(s => console.log(s.skill.name, s.skill.slug));`}</Code>
        </Section>

        {/* SECTION 6 */}
        <Section id="studio" title="Step 5 — Studio console (test without writing code)">
          <p className="text-gray-600 mb-4">
            The <Link href="/studio" className="text-blue-600 underline">Studio</Link> is a browser-based terminal. Sign in at <Link href="/signin" className="text-blue-600 underline">/signin</Link> and you can run any tool directly in your browser — no code required.
          </p>

          <div className="rounded-xl overflow-hidden border border-gray-200 mb-6">
            <div className="bg-gray-950 px-4 py-2 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
              <span className="text-gray-500 text-xs ml-2">Studio — /studio</span>
            </div>
            <div className="bg-gray-950 p-4 font-mono text-xs text-gray-300 space-y-1">
              <div><span className="text-purple-400">$</span> tools list</div>
              <div className="text-gray-500 pl-4">→ mem_set, mem_get, fs_write, fs_read, db_query, net_http_get, proc_execute ...</div>
              <div className="mt-2"><span className="text-purple-400">$</span> mem set greeting &quot;Hello world&quot;</div>
              <div className="text-green-400 pl-4">→ true</div>
              <div className="mt-2"><span className="text-purple-400">$</span> mem get greeting</div>
              <div className="text-green-400 pl-4">→ &quot;Hello world&quot;</div>
              <div className="mt-2"><span className="text-purple-400">$</span> net get https://api.coincap.io/v2/assets/bitcoin</div>
              <div className="text-green-400 pl-4">→ {'{ "data": { "priceUsd": "67432.18", ... } }'}</div>
            </div>
          </div>

          <Callout emoji="🔐">
            The Studio uses your browser session — no API key needed in the browser. Need to call the API from code or another machine? Click &quot;Generate bearer token&quot; in your <Link href="/dashboard" className="text-blue-600 underline">Dashboard</Link>.
          </Callout>
        </Section>

        {/* SECTION 7 */}
        <Section id="publish" title="Step 6 — Publish your own skill & earn money">
          <p className="text-gray-600 mb-4">
            If you build something useful on top of AgentOS, you can publish it as a skill on the marketplace. Other agents can install and call your skill — and you receive <strong>70% of all usage revenue</strong>.
          </p>

          <ol className="list-decimal ml-6 space-y-3 text-gray-600 mb-6">
            <li>Go to <Link href="/developer" className="text-blue-600 underline">/developer</Link> — sign in first.</li>
            <li>Click <strong>&quot;+ Publish Skill&quot;</strong>. Fill in the name, description, category, and pricing (free or per-call).</li>
            <li>Write your skill as a JavaScript class named <code className="bg-gray-100 px-1 rounded text-xs">Skill</code>. Each method corresponds to a capability.</li>
            <li>Add your payout settings (PayPal email or USDC wallet address) so you can receive earnings.</li>
            <li>Click <strong>Publish</strong> — your skill goes live on the marketplace instantly.</li>
          </ol>

          <h3 className="text-base font-semibold text-gray-900 mb-2">Example skill source code:</h3>
          <Code>{`class Skill {
  // capability: "summarise"
  summarise({ text, maxWords = 50 }) {
    const words = text.trim().split(/\\s+/);
    return {
      result:     words.slice(0, maxWords).join(' ') + (words.length > maxWords ? '...' : ''),
      wordCount:  words.length,
      truncated:  words.length > maxWords,
    };
  }

  // capability: "wordCount"
  wordCount({ text }) {
    return {
      result: text.trim().split(/\\s+/).length,
    };
  }
}`}</Code>

          <Callout emoji="💰">
            Earnings are paid monthly. Set your payout method at <Link href="/developer" className="text-blue-600 underline">/developer → Payout Settings</Link>. Supports PayPal, bank transfer (ACH/Wire), and USDC crypto wallet.
          </Callout>
        </Section>

        {/* SECTION 8 */}
        <Section id="ops" title="Step 7 — Multi-agent ops & infrastructure crew">
          <p className="text-gray-600 mb-4">
            The <Link href="/ops" className="text-blue-600 underline">Ops console</Link> is for platform administrators. It shows the <strong>autonomous crew</strong> — a set of AI agents that maintain continuous coverage of every feature and function on the platform.
          </p>
          <p className="text-gray-600 mb-4">
            Every platform capability has an <strong>active agent</strong> and a <strong>standby agent</strong>. If the active agent degrades or fails, the standby automatically takes over (failover).
          </p>

          <h3 className="text-base font-semibold text-gray-900 mb-2">Key concepts:</h3>
          <div className="space-y-3 mb-6">
            {[
              { term: 'Coverage state', def: 'Whether a feature has both an active and standby agent assigned. "Fully covered" means both slots are healthy.' },
              { term: 'Health score', def: 'A 0–1 score for each agent. Below ~0.5 triggers a triage suggestion; below ~0.2 triggers automatic failover.' },
              { term: 'Failover', def: 'When the active agent degrades, the standby automatically becomes active. You can also trigger this manually from the UI.' },
              { term: 'Cron cycle', def: 'A periodic health check run. Hits every active agent, generates suggestions for degraded ones, and performs failovers where needed.' },
              { term: 'Bootstrap', def: 'Creates missing active/standby pairs for any uncovered features. Safe to run at any time.' },
            ].map(i => (
              <div key={i.term} className="flex gap-3 bg-gray-50 rounded-lg p-3 border border-gray-100">
                <code className="text-xs font-mono bg-gray-200 px-2 py-0.5 rounded text-gray-700 self-start mt-0.5 whitespace-nowrap">{i.term}</code>
                <p className="text-sm text-gray-600">{i.def}</p>
              </div>
            ))}
          </div>

          <Callout emoji="🔒">
            The ops console is accessible after sign-in. Contact the AgentOS team if you need elevated access.
          </Callout>
        </Section>

        {/* SECTION 9 */}
        <Section id="ffp" title="Step 8 — FFP / consensus mode">
          <p className="text-gray-600 mb-4">
            FFP (Furge Fabric Protocol) is an optional decentralised consensus layer for <strong>critical financial operations</strong>. When enabled, any agent trying to call a sensitive domain (Binance, Coinbase, Stripe, PayPal, etc.) must get approval from the FFP network before the request is allowed through.
          </p>
          <p className="text-gray-600 mb-4">
            <strong>For most users, FFP is not needed.</strong> It is designed for high-stakes multi-agent deployments where you want a second layer of verification before money moves.
          </p>
          <p className="text-gray-600 mb-4">
            See the full setup guide: <Link href="/docs/ffp" className="text-blue-600 underline">FFP documentation →</Link>
          </p>
        </Section>

        {/* WRAP UP */}
        <div className="mt-12 rounded-2xl bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-100 p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">You&apos;re ready.</h2>
          <p className="text-gray-600 mb-6">
            You now know everything you need to build on AgentOS. Sign up, grab your API key, and start with the one-liner below.
          </p>
          <Code>{`// Your first Agent OS call — store anything
await mcp('mem_set', { key: 'hello', value: 'world', ttl: 3600 });
const v = await mcp('mem_get', { key: 'hello' });
console.log(v); // 'world'`}</Code>
          <div className="flex gap-3 mt-6 flex-wrap">
            <Link href="/signup" className="inline-block bg-blue-600 text-white font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors">Create account →</Link>
            <Link href="/docs/primitives" className="inline-block bg-white border border-gray-200 text-gray-700 font-semibold text-sm px-5 py-2.5 rounded-lg hover:border-blue-300 transition-colors">All 30 tools</Link>
            <Link href="/marketplace" className="inline-block bg-white border border-gray-200 text-gray-700 font-semibold text-sm px-5 py-2.5 rounded-lg hover:border-blue-300 transition-colors">Browse skills</Link>
          </div>
        </div>
      </div>

      <DocsFooter />
    </div>
  );
}

function TOC({ items }: { items: { id: string; label: string }[] }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-10">
      <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">On this page</div>
      <ol className="space-y-1">
        {items.map((item, i) => (
          <li key={item.id}>
            <a href={`#${item.id}`} className="text-sm text-blue-600 hover:underline">
              {i + 1}. {item.label}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-14 scroll-mt-20">
      <h2 className="text-2xl font-bold text-gray-900 mb-4 pb-3 border-b border-gray-100">{title}</h2>
      <div className="space-y-3 text-gray-700 leading-relaxed">{children}</div>
    </section>
  );
}

function UseCase({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex-shrink-0">{n}</span>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="ml-10">{children}</div>
    </div>
  );
}

function Callout({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4 mt-4 text-sm text-gray-700">
      <span className="text-base flex-shrink-0">{emoji}</span>
      <div>{children}</div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <div className="bg-gray-950 rounded-lg overflow-hidden mt-3">
      <pre className="p-4 text-xs font-mono text-gray-300 overflow-x-auto leading-relaxed whitespace-pre">
        {children}
      </pre>
    </div>
  );
}

function Result({ children }: { children: string }) {
  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden mt-2">
      <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-gray-700">Response</div>
      <pre className="p-4 text-xs font-mono text-green-400 overflow-x-auto leading-relaxed whitespace-pre">
        {children}
      </pre>
    </div>
  );
}
