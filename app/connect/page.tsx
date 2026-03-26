'use client';

import Link from 'next/link';
import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import {
  DEFAULT_CONNECT_TEST_TOOL,
  DEFAULT_EXTERNAL_AGENT_TOOLS,
  EXTERNAL_AGENT_TOOL_EXAMPLES,
  EXTERNAL_AGENT_TOOL_GROUPS,
  EXTERNAL_MCP_WILDCARD,
} from '@/src/external-agents/catalog';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'https://agentos-app.vercel.app';
const PRIMARY = '#6366f1';
const BG = '#0a0a0a';
const SURFACE = '#111111';
const BORDER = '#222222';
const TEXT = '#f9fafb';
const TEXT_SECONDARY = '#9ca3af';
const SUCCESS = '#22c55e';
const WARNING = '#f59e0b';
const ERROR = '#ef4444';

type RegistrationResponse = {
  agentId: string;
  token: string;
  expiresIn: string;
  allowedDomains: string[];
  allowedTools: string[];
  mcpEndpoint: string;
  toolsEndpoint: string;
  message: string;
};

type OutputState = {
  success: boolean;
  label: string;
  body: string;
};

const languageTags = ['Python', 'Node.js', 'Rust', 'Go', 'Any language'];
const capabilityCards = [
  { icon: '\u26A1', title: 'Primitives', subtitle: '32 built-in tools', detail: 'for any agent' },
  { icon: '\uD83C\uDF10', title: 'External MCPs', subtitle: 'Gmail, Slack, Stripe', detail: 'and any MCP server' },
  { icon: '\uD83D\uDEE0\uFE0F', title: 'Skills Marketplace', subtitle: 'Install capabilities', detail: 'on demand' },
  { icon: '\uD83D\uDCC4', title: 'Database', subtitle: 'Private SQL per', detail: 'agent' },
  { icon: '\uD83D\uDCE1', title: 'Events', subtitle: 'Pub/sub between', detail: 'agents' },
  { icon: '\u2699\uFE0F', title: 'Code Execution', subtitle: 'Run Python, JS,', detail: 'Bash in sandbox' },
];

function getToolExample(toolName: string): string {
  return EXTERNAL_AGENT_TOOL_EXAMPLES[toolName] ?? '{\n  "key": "value"\n}';
}

function buildSnippet(tab: 'env' | 'node' | 'python' | 'curl', token: string): string {
  if (tab === 'env') {
    return `AGENTOS_TOKEN=${token}\nAGENTOS_MCP_ENDPOINT=${APP_URL}/mcp`;
  }

  if (tab === 'node') {
    return `// Call any AgentOS tool - primitives, skills, or external MCP\nconst res = await fetch('${APP_URL}/mcp', {\n  method: 'POST',\n  headers: {\n    'Authorization': 'Bearer ${token}',\n    'Content-Type': 'application/json'\n  },\n  body: JSON.stringify({\n    tool: 'agentos.net_http_get', // or 'mcp.gmail.send_email'\n    input: { url: 'https://api.example.com/data' }\n  })\n});\nconst data = await res.json();`;
  }

  if (tab === 'python') {
    return `import requests\n\nres = requests.post(\n    '${APP_URL}/mcp',\n    headers={\n        'Authorization': 'Bearer ${token}',\n        'Content-Type': 'application/json'\n    },\n    json={\n        'tool': 'agentos.net_http_get', # or 'mcp.gmail.send_email'\n        'input': {'url': 'https://api.example.com/data'}\n    }\n)\ndata = res.json()`;
  }

  return `curl -X POST ${APP_URL}/mcp \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"tool":"agentos.net_http_get","input":{"url":"https://httpbin.org/get"}}'`;
}

function parseDomains(value: string): string[] {
  return value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
}

function sortTools(tools: string[]): string[] {
  return [...tools].sort((left, right) => left.localeCompare(right));
}

function getPrimitiveTools(tools: string[]): string[] {
  return tools.filter(tool => tool.startsWith('agentos.') && !tool.startsWith('agentos.skill.'));
}

export default function ConnectPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [agentId, setAgentId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [allowedDomains, setAllowedDomains] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([...DEFAULT_EXTERNAL_AGENT_TOOLS]);
  const [agentIdError, setAgentIdError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registration, setRegistration] = useState<RegistrationResponse | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [snippetTab, setSnippetTab] = useState<'env' | 'node' | 'python' | 'curl'>('env');
  const [testTool, setTestTool] = useState(DEFAULT_CONNECT_TEST_TOOL);
  const [testInput, setTestInput] = useState(getToolExample(DEFAULT_CONNECT_TEST_TOOL));
  const [testLoading, setTestLoading] = useState(false);
  const [output, setOutput] = useState<OutputState | null>(null);
  const [hasSuccessfulTest, setHasSuccessfulTest] = useState(false);

  const primitiveTools = useMemo(() => getPrimitiveTools(registration?.allowedTools ?? selectedTools), [registration, selectedTools]);
  const currentSnippet = registration ? buildSnippet(snippetTab, registration.token) : '';

  function isToolSelected(tool: string): boolean {
    return selectedTools.includes(tool);
  }

  function markCopied(key: string) {
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey(current => current === key ? null : current);
    }, 2000);
  }

  async function copyText(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    markCopied(key);
  }

  function toggleTool(tool: string) {
    setSelectedTools(current => current.includes(tool)
      ? current.filter(item => item !== tool)
      : sortTools([...current, tool]));
  }

  function toggleGroup(groupTools: readonly string[]) {
    const allSelected = groupTools.every(tool => selectedTools.includes(tool));
    setSelectedTools(current => {
      if (allSelected) {
        return current.filter(tool => !groupTools.includes(tool));
      }
      return sortTools([...new Set([...current, ...groupTools])]);
    });
  }

  function toggleAllTools() {
    const allPrimitiveTools = DEFAULT_EXTERNAL_AGENT_TOOLS.every(tool => selectedTools.includes(tool));
    const allToolsSelected = allPrimitiveTools && selectedTools.includes(EXTERNAL_MCP_WILDCARD);

    if (allToolsSelected) {
      setSelectedTools([]);
      return;
    }

    setSelectedTools(sortTools([...DEFAULT_EXTERNAL_AGENT_TOOLS, EXTERNAL_MCP_WILDCARD]));
  }

  function resetFlow() {
    setStep(1);
    setAgentId('');
    setName('');
    setDescription('');
    setOwnerEmail('');
    setAllowedDomains('');
    setSelectedTools([...DEFAULT_EXTERNAL_AGENT_TOOLS]);
    setAgentIdError('');
    setSubmitError('');
    setLoading(false);
    setRegistration(null);
    setCopiedKey(null);
    setSnippetTab('env');
    setTestTool(DEFAULT_CONNECT_TEST_TOOL);
    setTestInput(getToolExample(DEFAULT_CONNECT_TEST_TOOL));
    setTestLoading(false);
    setOutput(null);
    setHasSuccessfulTest(false);
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAgentIdError('');
    setSubmitError('');

    const trimmedAgentId = agentId.trim();
    if (!/^[a-z0-9-]+$/.test(trimmedAgentId)) {
      setAgentIdError('Agent ID must be lowercase letters, numbers, or hyphens only.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: trimmedAgentId,
          name: name.trim(),
          description: description.trim() || undefined,
          ownerEmail: ownerEmail.trim() || undefined,
          allowedDomains: parseDomains(allowedDomains),
          allowedTools: selectedTools,
        }),
      });

      const data = await response.json();
      if (response.status === 409) {
        setAgentIdError('This Agent ID is already taken.');
        return;
      }

      if (!response.ok) {
        setSubmitError(data.error || 'Registration failed');
        return;
      }

      const result = data as RegistrationResponse;
      const nextTools = getPrimitiveTools(result.allowedTools);
      const nextTool = nextTools.includes(DEFAULT_CONNECT_TEST_TOOL) ? DEFAULT_CONNECT_TEST_TOOL : nextTools[0] ?? DEFAULT_CONNECT_TEST_TOOL;
      setRegistration(result);
      setTestTool(nextTool);
      setTestInput(getToolExample(nextTool));
      setStep(2);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function runTest() {
    if (!registration) {
      return;
    }

    setTestLoading(true);

    try {
      const parsedInput = JSON.parse(testInput);
      const response = await fetch('/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${registration.token}`,
        },
        body: JSON.stringify({ tool: testTool, input: parsedInput }),
      });

      const data = await response.json();
      if (!response.ok) {
        setOutput({
          success: false,
          label: '\u2717 Error',
          body: JSON.stringify(data, null, 2),
        });
        return;
      }

      setOutput({
        success: true,
        label: '\u2713 Connection successful',
        body: JSON.stringify(data, null, 2),
      });
      setHasSuccessfulTest(true);
    } catch (error) {
      setOutput({
        success: false,
        label: '\u2717 Error',
        body: JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid JSON input' }, null, 2),
      });
    } finally {
      setTestLoading(false);
    }
  }

  return (
    <div style={{ background: BG, color: TEXT, minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '40px 20px 80px' }}>
        <div style={{ marginBottom: 28 }}>
          <Link href="/" style={{ color: TEXT_SECONDARY, fontSize: 14, textDecoration: 'none' }}>\u2190 Back to AgentOS</Link>
        </div>

        <section style={{ marginBottom: 36 }}>
          <h1 style={{ fontSize: 48, fontWeight: 800, lineHeight: 1.05, marginBottom: 16 }}>Connect Any Agent to AgentOS</h1>
          <p style={{ fontSize: 18, color: TEXT_SECONDARY, maxWidth: 900, lineHeight: 1.6, whiteSpace: 'pre-line', marginBottom: 20 }}>
            {'One connection. Every capability.\nAgentOS gives your agent access to 32 built-in tools, the skills marketplace,\nand any external MCP server - Gmail, Slack, Stripe, GitHub, and more.\nWhatever your agent does, whatever it\'s built on - connect it in 60 seconds.'}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
            {languageTags.map(tag => (
              <span key={tag} style={{ padding: '8px 12px', borderRadius: 999, border: `1px solid ${PRIMARY}`, background: '#1a1a2e', color: TEXT, fontSize: 13 }}>
                {tag}
              </span>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {capabilityCards.map(card => (
              <div key={card.title} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{card.icon}</div>
                <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{card.title}</div>
                <div style={{ color: TEXT, fontSize: 14, marginBottom: 4 }}>{card.subtitle}</div>
                <div style={{ color: TEXT_SECONDARY, fontSize: 13 }}>{card.detail}</div>
              </div>
            ))}
          </div>
        </section>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 28, flexWrap: 'wrap' }}>
          {[1, 2, 3].map(index => {
            const active = step === index;
            const complete = step > index;
            return (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: `2px solid ${active || complete ? PRIMARY : TEXT_SECONDARY}`,
                  background: active || complete ? PRIMARY : 'transparent',
                  display: 'inline-block',
                }} />
                <span style={{ color: active ? TEXT : TEXT_SECONDARY, fontSize: 14 }}>Step {index}</span>
              </div>
            );
          })}
        </div>

        {step === 1 && (
          <form onSubmit={handleRegister} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 20, padding: 28 }}>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Register Your Agent</h2>
              <p style={{ color: TEXT_SECONDARY, fontSize: 15 }}>Register once, get a token, and start calling AgentOS from any language.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginBottom: 18 }}>
              <label style={{ display: 'block' }}>
                <div style={{ fontSize: 13, color: TEXT, marginBottom: 8, fontWeight: 600 }}>Agent ID</div>
                <input value={agentId} onChange={event => setAgentId(event.target.value)} placeholder="my-agent" style={inputStyle} required />
                <div style={{ color: TEXT_SECONDARY, fontSize: 12, marginTop: 6 }}>Lowercase letters, numbers, hyphens only</div>
                {agentIdError && <div style={{ color: ERROR, fontSize: 12, marginTop: 6 }}>{agentIdError}</div>}
              </label>

              <label style={{ display: 'block' }}>
                <div style={{ fontSize: 13, color: TEXT, marginBottom: 8, fontWeight: 600 }}>Agent Name</div>
                <input value={name} onChange={event => setName(event.target.value)} placeholder="My Trading Agent" style={inputStyle} required />
              </label>
            </div>

            <label style={{ display: 'block', marginBottom: 18 }}>
              <div style={{ fontSize: 13, color: TEXT, marginBottom: 8, fontWeight: 600 }}>Description</div>
              <textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} placeholder="What does your agent do?" style={{ ...inputStyle, minHeight: 96, resize: 'vertical' }} />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginBottom: 24 }}>
              <label style={{ display: 'block' }}>
                <div style={{ fontSize: 13, color: TEXT, marginBottom: 8, fontWeight: 600 }}>Your Email</div>
                <input type="email" value={ownerEmail} onChange={event => setOwnerEmail(event.target.value)} placeholder="you@example.com" style={inputStyle} />
              </label>

              <label style={{ display: 'block' }}>
                <div style={{ fontSize: 13, color: TEXT, marginBottom: 8, fontWeight: 600 }}>Allowed Domains</div>
                <input value={allowedDomains} onChange={event => setAllowedDomains(event.target.value)} placeholder="api.binance.com, api.coingecko.com" style={inputStyle} />
                <div style={{ color: TEXT_SECONDARY, fontSize: 12, marginTop: 6 }}>Comma-separated. Leave blank for unrestricted outbound domains, still protected by HTTPS and SSRF rules.</div>
              </label>
            </div>

            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 24, marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Tool Permissions</div>
                  <div style={{ fontSize: 13, color: TEXT_SECONDARY }}>Choose which built-in tools and MCP permissions this agent can use.</div>
                </div>
                <button type="button" onClick={toggleAllTools} style={linkButtonStyle}>
                  {DEFAULT_EXTERNAL_AGENT_TOOLS.every(tool => selectedTools.includes(tool)) && selectedTools.includes(EXTERNAL_MCP_WILDCARD) ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div style={{ display: 'grid', gap: 16 }}>
                {EXTERNAL_AGENT_TOOL_GROUPS.map(group => {
                  const groupSelected = group.tools.every(tool => isToolSelected(tool));
                  return (
                    <div key={group.id} style={{ background: '#0d0d0d', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 18 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{group.label}</div>
                        <button type="button" onClick={() => toggleGroup(group.tools)} style={linkButtonStyle}>
                          {groupSelected ? 'Deselect Group' : 'Select Group'}
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                        {group.tools.map(tool => (
                          <label key={tool} style={checkboxLabelStyle}>
                            <input type="checkbox" checked={isToolSelected(tool)} onChange={() => toggleTool(tool)} />
                            <span>{tool}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}

                <div style={{ background: '#0d0d0d', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>EXTERNAL MCP</div>
                    <button type="button" onClick={() => toggleTool(EXTERNAL_MCP_WILDCARD)} style={linkButtonStyle}>
                      {isToolSelected(EXTERNAL_MCP_WILDCARD) ? 'Deselect Group' : 'Select Group'}
                    </button>
                  </div>
                  <label style={checkboxLabelStyle}>
                    <input type="checkbox" checked={isToolSelected(EXTERNAL_MCP_WILDCARD)} onChange={() => toggleTool(EXTERNAL_MCP_WILDCARD)} />
                    <span>mcp.*</span>
                  </label>
                  <div style={{ color: TEXT_SECONDARY, fontSize: 12, marginTop: 10 }}>
                    External MCP tools (Gmail, Slack, Stripe, etc.) are available once connected servers are configured in your AgentOS dashboard.
                  </div>
                </div>
              </div>
            </div>

            {submitError && <div style={{ color: ERROR, fontSize: 13, marginBottom: 14 }}>{submitError}</div>}

            <button type="submit" disabled={loading} style={{ ...primaryButtonStyle, width: '100%', height: 48, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Connecting...' : 'Connect Agent'}
            </button>
          </form>
        )}

        {step === 2 && registration && (
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 20, padding: 28 }}>
            <div style={{ fontSize: 40, color: SUCCESS, marginBottom: 12 }}>\u2713</div>
            <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Your agent is connected.</h2>
            <p style={{ color: TEXT_SECONDARY, marginBottom: 24 }}>{registration.message}</p>

            <div style={{ position: 'relative', background: '#0d1117', border: '1px solid #30363d', borderRadius: 16, padding: 16, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: TEXT, overflowWrap: 'break-word', marginBottom: 14 }}>
              <button type="button" onClick={() => copyText('token', registration.token)} style={{ ...smallButtonStyle, position: 'absolute', top: 14, right: 14 }}>
                {copiedKey === 'token' ? 'Copied \u2713' : 'Copy Token'}
              </button>
              {registration.token}
            </div>

            <div style={{ background: '#451a03', border: '1px solid #92400e', color: '#fcd34d', borderRadius: 14, padding: 14, fontSize: 13, marginBottom: 20 }}>
              \u26A0\uFE0F Save this token now. It will not be shown again. Anyone with this token can use your AgentOS agent.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
              <div style={{ fontSize: 14, color: TEXT_SECONDARY }}>Endpoint: <span style={{ color: TEXT, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{registration.mcpEndpoint}</span></div>
              <button type="button" onClick={() => copyText('endpoint', registration.mcpEndpoint)} style={smallButtonStyle}>
                {copiedKey === 'endpoint' ? 'Copied \u2713' : 'Copy'}
              </button>
            </div>

            <div style={{ background: '#0d0d0d', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 18, marginBottom: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>What your agent can access</div>
              <div style={{ display: 'grid', gap: 8, color: TEXT_SECONDARY, fontSize: 14 }}>
                <div>\u2713 {registration.allowedTools.filter(tool => tool.startsWith('agentos.') && !tool.startsWith('agentos.skill.')).length} AgentOS primitives (agentos.*)</div>
                <div>\u2713 Skills marketplace (agentos.skill.*) once you grant or install the capabilities you need</div>
                <div>\u2713 External MCP servers (mcp.*) when configured</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {([
                  ['env', '.env'],
                  ['node', 'Node.js'],
                  ['python', 'Python'],
                  ['curl', 'curl'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSnippetTab(key)}
                    style={{
                      ...smallButtonStyle,
                      background: snippetTab === key ? PRIMARY : '#181818',
                      border: `1px solid ${snippetTab === key ? PRIMARY : BORDER}`,
                      color: TEXT,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ position: 'relative', background: '#0d1117', border: '1px solid #30363d', borderRadius: 16, padding: 16, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: TEXT, overflowX: 'auto' }}>
                <button type="button" onClick={() => copyText(`snippet-${snippetTab}`, currentSnippet)} style={{ ...smallButtonStyle, position: 'absolute', top: 14, right: 14 }}>
                  {copiedKey === `snippet-${snippetTab}` ? 'Copied \u2713' : 'Copy'}
                </button>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{currentSnippet}</pre>
              </div>
            </div>

            <button type="button" onClick={() => setStep(3)} style={{ ...primaryButtonStyle, width: 220, height: 48 }}>
              Continue \u2192
            </button>
          </div>
        )}

        {step === 3 && registration && (
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 20, padding: 28 }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Test it live.</h2>
            <p style={{ color: TEXT_SECONDARY, marginBottom: 24 }}>Run a real tool call right now and confirm your agent is connected.</p>

            <div style={{ display: 'grid', gap: 16, marginBottom: 18 }}>
              <label>
                <div style={{ fontSize: 13, color: TEXT, marginBottom: 8, fontWeight: 600 }}>Tool</div>
                <select
                  value={testTool}
                  onChange={event => {
                    const nextTool = event.target.value;
                    setTestTool(nextTool);
                    setTestInput(getToolExample(nextTool));
                  }}
                  style={inputStyle}
                >
                  {primitiveTools.map(tool => (
                    <option key={tool} value={tool}>{tool}</option>
                  ))}
                </select>
              </label>

              <label>
                <div style={{ fontSize: 13, color: TEXT, marginBottom: 8, fontWeight: 600 }}>Input JSON</div>
                <textarea value={testInput} onChange={event => setTestInput(event.target.value)} rows={8} style={{ ...inputStyle, minHeight: 200, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
              </label>
            </div>

            <button type="button" onClick={() => void runTest()} disabled={testLoading || primitiveTools.length === 0} style={{ ...primaryButtonStyle, width: 180, height: 48, opacity: testLoading || primitiveTools.length === 0 ? 0.7 : 1 }}>
              {testLoading ? 'Running...' : 'Run Test'}
            </button>

            {primitiveTools.length === 0 && (
              <div style={{ color: WARNING, fontSize: 13, marginTop: 12 }}>No primitive tools were granted to this agent, so there is nothing to test here yet.</div>
            )}

            {output && (
              <div style={{ marginTop: 24 }}>
                <div style={{ color: output.success ? SUCCESS : ERROR, fontWeight: 700, marginBottom: 8 }}>{output.label}</div>
                <div style={{ background: '#0d1117', border: `1px solid ${output.success ? SUCCESS : ERROR}`, borderRadius: 16, padding: 16, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: TEXT }}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{output.body}</pre>
                </div>
              </div>
            )}

            {hasSuccessfulTest && (
              <div style={{ marginTop: 28, background: '#0d0d0d', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 18 }}>
                <div style={{ display: 'grid', gap: 8, marginBottom: 14, fontSize: 14 }}>
                  <div style={{ color: SUCCESS }}>\u2713 Agent registered</div>
                  <div style={{ color: SUCCESS }}>\u2713 Token saved</div>
                  <div style={{ color: SUCCESS }}>\u2713 Connection live</div>
                </div>
                <div style={{ color: TEXT, fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Your agent is now powered by AgentOS.</div>
                <div style={{ color: TEXT_SECONDARY, fontSize: 14, marginBottom: 18 }}>One token. Primitives, skills, and every connected MCP server. Whatever your agent does, wherever it runs.</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <Link href="/docs" style={{ ...linkAsButtonStyle, background: PRIMARY, border: `1px solid ${PRIMARY}` }}>View Docs</Link>
                  <button type="button" onClick={resetFlow} style={{ ...linkAsButtonStyle, background: 'transparent', border: `1px solid ${BORDER}` }}>Connect Another Agent</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: '#0d0d0d',
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  color: TEXT,
  padding: '12px 14px',
  fontSize: 14,
  outline: 'none',
};

const primaryButtonStyle: CSSProperties = {
  background: PRIMARY,
  color: TEXT,
  border: `1px solid ${PRIMARY}`,
  borderRadius: 12,
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
};

const smallButtonStyle: CSSProperties = {
  background: '#181818',
  color: TEXT,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 600,
  padding: '8px 12px',
  cursor: 'pointer',
};

const linkButtonStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: PRIMARY,
  cursor: 'pointer',
  fontSize: 13,
  padding: 0,
};

const checkboxLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  color: TEXT,
  fontSize: 13,
};

const linkAsButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 180,
  minHeight: 44,
  borderRadius: 12,
  color: TEXT,
  textDecoration: 'none',
  fontWeight: 700,
  fontSize: 14,
  padding: '0 18px',
};
