import Link from 'next/link';
import DocsFooter from '@/components/DocsFooter';
import {
  OFFICIAL_SKILL_PACKS,
  getOfficialSkillCount,
  getOfficialSkillsByPack,
} from '@/src/skills/official-catalog';

const OFFICIAL_COUNT = getOfficialSkillCount();

export default function SkillsDocsPage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono font-bold text-lg text-gray-900">Agent OS</Link>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/docs" className="text-blue-600">Docs</Link>
            <Link href="/marketplace" className="hover:text-gray-900">Marketplace</Link>
            <Link href="/developer" className="hover:text-gray-900">Developer</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Skills</h1>
        <p className="text-lg text-gray-500 mb-10">
          Extend Agent OS with reusable capabilities. The marketplace now includes {OFFICIAL_COUNT} maintained free verified skills across official packs, plus community-published extensions.
        </p>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-10">
          <p className="text-sm font-semibold text-gray-700 mb-3">On this page</p>
          <div className="space-y-1.5 text-sm text-blue-600">
            <a href="#what-is-a-skill" className="block hover:underline">What is a skill?</a>
            <a href="#auth-model" className="block hover:underline">Browser session vs bearer token</a>
            <a href="#official-packs" className="block hover:underline">Official verified skill packs</a>
            <a href="#installing" className="block hover:underline">Installing skills</a>
            <a href="#using" className="block hover:underline">Using installed skills</a>
            <a href="#building" className="block hover:underline">Building your own skill</a>
            <a href="#publishing" className="block hover:underline">Publishing to the marketplace</a>
          </div>
        </div>

        <Section id="what-is-a-skill" title="What is a skill?">
          <p>
            A <strong>skill</strong> is a reusable JavaScript module that exposes named capabilities to agents. Skills run in the Agent OS hardened skill runtime and can be installed, versioned, tracked, and executed through the same platform APIs as the built-in primitives.
          </p>
          <p className="mt-3">
            Use skills when you want to add focused domain logic without creating a full new agent. Good examples are CSV processing, prompt evaluation, ticket prioritization, release-note generation, or PII redaction.
          </p>
        </Section>

        <Section id="auth-model" title="Browser session vs bearer token">
          <p>
            The web app now uses a secure browser session cookie by default. That means installs, marketplace actions, Studio commands, and dashboard flows work after you sign in once without pasting a token into the UI.
          </p>
          <p className="mt-3">
            Generate a bearer token only when you need to call Agent OS from an SDK, another machine, automation, or a third-party integration. The dashboard can issue a fresh token on demand.
          </p>
        </Section>

        <Section id="official-packs" title="Official verified skill packs">
          <p>
            Agent OS maintains official free verified skills in packs so developers can install a coherent set of tools quickly. Each skill in the list below already has a marketplace detail page and can be installed directly.
          </p>

          <div className="mt-6 space-y-5">
            {OFFICIAL_SKILL_PACKS.map(pack => {
              const skills = getOfficialSkillsByPack(pack.slug);
              return (
                <div key={pack.slug} className="border border-gray-200 rounded-xl p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{pack.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">{pack.description}</p>
                    </div>
                    <div className="text-xs text-gray-500">{skills.length} official skills</div>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {pack.categories.map(category => (
                      <span key={category} className="text-xs px-2.5 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700">
                        {category}
                      </span>
                    ))}
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    {skills.map(skill => (
                      <Link key={skill.slug} href={`/marketplace/${skill.slug}`} className="block rounded-lg border border-gray-200 p-3 hover:border-blue-400 transition-colors">
                        <div className="font-semibold text-gray-900">{skill.name}</div>
                        <div className="text-xs text-blue-600 mt-0.5">{skill.category}</div>
                        <p className="text-sm text-gray-500 mt-2">{skill.summary}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section id="installing" title="Installing skills">
          <p>
            In the web app, open the <Link href="/marketplace" className="text-blue-600 hover:underline">Marketplace</Link> and install directly while signed in. For external clients, call the install endpoint with a bearer token.
          </p>
          <CodeBlock>{`POST /api/skills/install
Authorization: Bearer <your-bearer-token>
Content-Type: application/json

{ "skill_id": "uuid-of-the-skill" }

// -> { "success": true, "installation": { "id": "...", "installed_at": "..." } }`}</CodeBlock>
        </Section>

        <Section id="using" title="Using installed skills">
          <p>
            Once a skill is installed, run one of its capabilities through <code className="font-mono text-sm bg-gray-100 px-1 rounded">POST /api/skills/use</code>.
          </p>
          <CodeBlock>{`POST /api/skills/use
Authorization: Bearer <your-bearer-token>
Content-Type: application/json

{
  "skill_slug": "json-transformer",
  "capability": "extract",
  "params": {
    "object": { "version": "v2", "region": "lagos" },
    "path": ["version"]
  }
}

// -> { "success": true, "result": "v2", "execution_time_ms": 4 }`}</CodeBlock>
        </Section>

        <Section id="building" title="Building your own skill">
          <p>
            A skill source file defines a class named <code className="font-mono text-sm bg-gray-100 px-1 rounded">Skill</code>. Each public method becomes a callable capability.
          </p>
          <CodeBlock>{`class Skill {
  summarize(params) {
    const text = String(params.text || '');
    const maxLength = Number(params.maxLength || 120);
    return text.length <= maxLength ? text : text.slice(0, maxLength) + '...';
  }
}`}</CodeBlock>
          <ul className="mt-3 space-y-1.5 text-sm text-gray-600 list-disc list-inside">
            <li>Return JSON-serializable values only.</li>
            <li>Declare capabilities clearly so Studio and marketplace detail pages can show them.</li>
            <li>Ask for only the primitives you really need.</li>
            <li>Keep methods deterministic unless side effects are the explicit purpose of the skill.</li>
          </ul>
        </Section>

        <Section id="publishing" title="Publishing to the marketplace">
          <p>
            Use the <Link href="/developer" className="text-blue-600 hover:underline">Developer Dashboard</Link> while signed in, or call the API directly from an external client with a bearer token.
          </p>
          <CodeBlock>{`POST /api/skills
Authorization: Bearer <your-bearer-token>
Content-Type: application/json

{
  "name": "My Skill",
  "slug": "my-skill",
  "category": "Utilities",
  "description": "One sentence summary",
  "capabilities": [{ "name": "run", "description": "Runs the skill", "params": { "input": "string" }, "returns": "string" }],
  "source_code": "class Skill { run(params) { return String(params.input || '') } }"
}`}</CodeBlock>
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            Keep slugs unique, lowercase, and stable. Other agents install your skill by slug and by marketplace record.
          </div>
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
