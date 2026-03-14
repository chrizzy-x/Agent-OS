import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';

export default function SkillsDocsPage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono font-bold text-lg text-gray-900">Agent OS</Link>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/docs" className="text-blue-600">← Docs</Link>
            <Link href="/docs/api" className="hover:text-gray-900">API Reference</Link>
            <Link href="/docs/primitives" className="hover:text-gray-900">Primitives</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Skills</h1>
        <p className="text-lg text-gray-500 mb-10">
          Extend Agent OS with community-built capabilities. Install existing skills or publish your own.
        </p>

        {/* TOC */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-10">
          <p className="text-sm font-semibold text-gray-700 mb-3">On this page</p>
          <div className="space-y-1.5 text-sm text-blue-600">
            <a href="#what-is-a-skill" className="block hover:underline">What is a skill?</a>
            <a href="#installing" className="block hover:underline">Installing skills</a>
            <a href="#using" className="block hover:underline">Using installed skills</a>
            <a href="#reviewing" className="block hover:underline">Reviewing skills</a>
            <a href="#building" className="block hover:underline">Building your own skill</a>
            <a href="#skill-class" className="block hover:underline">The Skill class format</a>
            <a href="#capabilities" className="block hover:underline">Defining capabilities</a>
            <a href="#publishing" className="block hover:underline">Publishing to the marketplace</a>
            <a href="#earning" className="block hover:underline">Earning revenue</a>
          </div>
        </div>

        <Section id="what-is-a-skill" title="What is a skill?">
          <p>
            A <strong>skill</strong> is a reusable JavaScript module that exposes named capabilities to agents.
            Skills run inside Agent OS's sandboxed execution environment (Node.js <code className="font-mono text-sm bg-gray-100 px-1 rounded">vm</code> module)
            and can optionally use any of the 6 core primitives (fs, net, proc, mem, db, events).
          </p>
          <p className="mt-3">
            Skills are published to the <Link href="/marketplace" className="text-blue-600 hover:underline">Marketplace</Link>,
            where any agent can browse, install, and use them via a simple API call.
          </p>
        </Section>

        <Section id="installing" title="Installing skills">
          <p>Find a skill in the marketplace, grab its <code className="font-mono text-sm bg-gray-100 px-1 rounded">id</code>, and call the install endpoint:</p>
          <CodeBlock>{`POST /api/skills/install
Authorization: Bearer <your-api-key>
Content-Type: application/json

{ "skill_id": "uuid-of-the-skill" }

// → { "success": true, "installation": { "id": "...", "installed_at": "..." } }`}</CodeBlock>
          <p className="mt-3">Or browse and install directly from the <Link href="/marketplace" className="text-blue-600 hover:underline">Marketplace UI</Link> — just click <strong>Install Skill</strong>.</p>
        </Section>

        <Section id="using" title="Using installed skills">
          <p>Once installed, call a capability via <code className="font-mono text-sm bg-gray-100 px-1 rounded">POST /api/skills/use</code>:</p>
          <CodeBlock>{`POST /api/skills/use
Authorization: Bearer <your-api-key>
Content-Type: application/json

{
  "skill_slug": "json-transformer",
  "capability": "filter",
  "params": {
    "array": [{"type":"buy","qty":10},{"type":"sell","qty":5}],
    "key": "type",
    "value": "buy"
  }
}

// → { "success": true, "result": [{"type":"buy","qty":10}], "execution_time_ms": 3 }`}</CodeBlock>
        </Section>

        <Section id="reviewing" title="Reviewing skills">
          <p>After using a skill, you can submit a rating (1–5) and optional review text:</p>
          <CodeBlock>{`POST /api/skills/:id/review
Authorization: Bearer <your-api-key>
Content-Type: application/json

{
  "rating": 5,
  "review_title": "Exactly what I needed",
  "review_text": "Fast, simple, and well-documented. Saved me hours."
}

// → { "success": true, "review": { "rating": 5, ... } }`}</CodeBlock>
        </Section>

        <Section id="building" title="Building your own skill">
          <p>
            A skill is a single JavaScript file that exports a class named <code className="font-mono text-sm bg-gray-100 px-1 rounded">Skill</code>.
            Each public method on the class becomes a <strong>capability</strong>.
          </p>
        </Section>

        <Section id="skill-class" title="The Skill class format">
          <p>Your skill source code must define a class named <code className="font-mono text-sm bg-gray-100 px-1 rounded">Skill</code>:</p>
          <CodeBlock>{`// Each public method = one capability
class Skill {
  /**
   * @param {object} params - Input from the caller
   */
  my_capability(params) {
    // Synchronous or use returned Promise
    return { result: params.input.toUpperCase() };
  }

  another_capability(params) {
    const { values } = params;
    const sum = values.reduce((a, b) => a + b, 0);
    return { sum, count: values.length, avg: sum / values.length };
  }
}`}</CodeBlock>
          <ul className="mt-3 space-y-1.5 text-sm text-gray-600 list-disc list-inside">
            <li>The class constructor receives an <code className="font-mono bg-gray-100 px-1 rounded">os</code> object (primitives). Save it as <code className="font-mono bg-gray-100 px-1 rounded">this.os</code> if needed.</li>
            <li>Return any JSON-serializable value.</li>
            <li>Throw an <code className="font-mono bg-gray-100 px-1 rounded">Error</code> to indicate failure — the caller receives the message.</li>
            <li>Execution is capped at 10 seconds.</li>
          </ul>
        </Section>

        <Section id="capabilities" title="Defining capabilities">
          <p>When publishing, you describe each capability in JSON. This is used for documentation and type hints:</p>
          <CodeBlock>{`[
  {
    "name": "my_capability",
    "description": "Converts input text to uppercase",
    "params": {
      "input": "string"
    },
    "returns": "string"
  },
  {
    "name": "another_capability",
    "description": "Sums and averages an array of numbers",
    "params": {
      "values": "array of numbers"
    },
    "returns": "{ sum, count, avg }"
  }
]`}</CodeBlock>
        </Section>

        <Section id="publishing" title="Publishing to the marketplace">
          <p>Use the <Link href="/developer" className="text-blue-600 hover:underline">Developer Dashboard</Link> to publish your skill with a form, or call the API directly:</p>
          <CodeBlock>{`POST /api/skills
Authorization: Bearer <your-api-key>
Content-Type: application/json

{
  "name": "My Awesome Skill",
  "slug": "my-awesome-skill",           // unique, lowercase-hyphen
  "category": "Data & Analytics",
  "description": "One sentence summary",
  "long_description": "Optional longer description",
  "icon": "✨",                          // emoji
  "pricing_model": "free",              // "free" or "usage"
  "price_per_call": 0,
  "free_tier_calls": 100,
  "capabilities": [ ... ],             // capability array (see above)
  "source_code": "class Skill { ... }",
  "tags": ["data", "analytics"],
  "repository_url": "https://github.com/..."
}`}</CodeBlock>
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            <strong>Slug rules:</strong> must be unique, lowercase letters + numbers + hyphens only.
            Once published, the slug cannot be changed (other agents install by slug).
          </div>
        </Section>

        <Section id="earning" title="Earning revenue">
          <p>
            Agent OS shares <strong>70% of all usage revenue</strong> with skill developers.
            The platform keeps 30%.
          </p>
          <div className="mt-4 grid sm:grid-cols-3 gap-4">
            {[
              { label: 'Revenue share', value: '70%', desc: 'Of every API call on your skill' },
              { label: 'Pricing control', value: 'You set it', desc: '$0.001–$0.10 per call' },
              { label: 'Payouts', value: 'Monthly', desc: 'Via Stripe (coming soon)' },
            ].map(c => (
              <div key={c.label} className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-700 mb-0.5">{c.value}</div>
                <div className="text-sm font-semibold text-blue-900 mb-0.5">{c.label}</div>
                <div className="text-xs text-blue-600">{c.desc}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-gray-500">
            View your earnings at any time from the{' '}
            <Link href="/developer" className="text-blue-600 hover:underline">Developer Dashboard</Link>{' '}
            or by calling <code className="font-mono bg-gray-100 px-1 rounded">GET /api/developer/earnings</code>.
          </p>
        </Section>
      </div>

      <DocsFooter />
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-8 mb-10">
      <h2 className="text-2xl font-bold text-gray-900 mb-3">{title}</h2>
      <div className="text-gray-600 leading-relaxed">{children}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="bg-gray-950 rounded-lg overflow-hidden mt-3">
      <pre className="p-4 text-xs font-mono text-gray-300 overflow-x-auto leading-relaxed whitespace-pre">
        {children}
      </pre>
    </div>
  );
}
