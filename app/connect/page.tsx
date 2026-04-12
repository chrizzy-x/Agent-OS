'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import {
  DEFAULT_CONNECT_TEST_TOOL,
  DEFAULT_EXTERNAL_AGENT_TOOLS,
  EXTERNAL_AGENT_TOOL_EXAMPLES,
  EXTERNAL_AGENT_TOOL_GROUPS,
  EXTERNAL_MCP_WILDCARD,
} from '@/src/external-agents/catalog';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'https://agentos-app.vercel.app';

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
  { icon: '⚡', title: 'Primitives', subtitle: '32 built-in tools', detail: 'for any agent' },
  { icon: '🌐', title: 'External MCPs', subtitle: 'Gmail, Slack, Stripe', detail: 'and any MCP server' },
  { icon: '🛠️', title: 'Skills Marketplace', subtitle: 'Install capabilities', detail: 'on demand' },
  { icon: '📄', title: 'Database', subtitle: 'Private SQL per', detail: 'agent' },
  { icon: '📡', title: 'Events', subtitle: 'Pub/sub between', detail: 'agents' },
  { icon: '⚙️', title: 'Code Execution', subtitle: 'Run Python, JS,', detail: 'Bash in sandbox' },
];

function getToolExample(toolName: string): string {
  return EXTERNAL_AGENT_TOOL_EXAMPLES[toolName] ?? '{\n  "key": "value"\n}';
}

function buildSnippet(tab: 'env' | 'node' | 'python' | 'curl', token: string): string {
  if (tab === 'env') return `AGENTOS_TOKEN=${token}\nAGENTOS_MCP_ENDPOINT=${APP_URL}/mcp`;
  if (tab === 'node') {
    return `// Call any AgentOS tool - primitives, skills, or external MCP\nconst res = await fetch('${APP_URL}/mcp', {\n  method: 'POST',\n  headers: {\n    'Authorization': 'Bearer ${token}',\n    'Content-Type': 'application/json'\n  },\n  body: JSON.stringify({\n    tool: 'agentos.net_http_get', // or 'mcp.gmail.send_email'\n    input: { url: 'https://api.example.com/data' }\n  })\n});\nconst data = await res.json();`;
  }
  if (tab === 'python') {
    return `import requests\n\nres = requests.post(\n    '${APP_URL}/mcp',\n    headers={\n        'Authorization': 'Bearer ${token}',\n        'Content-Type': 'application/json'\n    },\n    json={\n        'tool': 'agentos.net_http_get', # or 'mcp.gmail.send_email'\n        'input': {'url': 'https://api.example.com/data'}\n    }\n)\ndata = res.json()`;
  }
  return `curl -X POST ${APP_URL}/mcp \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"tool":"agentos.net_http_get","input":{"url":"https://httpbin.org/get"}}'`;
}

function parseDomains(value: string): string[] {
  return value.split(',').map(part => part.trim()).filter(Boolean);
}

function sortTools(tools: string[]): string[] {
  return [...tools].sort((l, r) => l.localeCompare(r));
}

function getPrimitiveTools(tools: string[]): string[] {
  return tools.filter(t => t.startsWith('agentos.') && !t.startsWith('agentos.skill.'));
}

const fieldLabelStyle = {
  display: 'block' as const,
  fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  marginBottom: '6px',
};

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

  function isToolSelected(tool: string) { return selectedTools.includes(tool); }

  function markCopied(key: string) {
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(c => c === key ? null : c), 2000);
  }

  async function copyText(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    markCopied(key);
  }

  function toggleTool(tool: string) {
    setSelectedTools(c => c.includes(tool) ? c.filter(i => i !== tool) : sortTools([...c, tool]));
  }

  function toggleGroup(groupTools: readonly string[]) {
    const allSelected = groupTools.every(t => selectedTools.includes(t));
    setSelectedTools(c => allSelected ? c.filter(t => !groupTools.includes(t)) : sortTools([...new Set([...c, ...groupTools])]));
  }

  function toggleAllTools() {
    const all = DEFAULT_EXTERNAL_AGENT_TOOLS.every(t => selectedTools.includes(t)) && selectedTools.includes(EXTERNAL_MCP_WILDCARD);
    setSelectedTools(all ? [] : sortTools([...DEFAULT_EXTERNAL_AGENT_TOOLS, EXTERNAL_MCP_WILDCARD]));
  }

  function resetFlow() {
    setStep(1); setAgentId(''); setName(''); setDescription(''); setOwnerEmail('');
    setAllowedDomains(''); setSelectedTools([...DEFAULT_EXTERNAL_AGENT_TOOLS]);
    setAgentIdError(''); setSubmitError(''); setLoading(false); setRegistration(null);
    setCopiedKey(null); setSnippetTab('env'); setTestTool(DEFAULT_CONNECT_TEST_TOOL);
    setTestInput(getToolExample(DEFAULT_CONNECT_TEST_TOOL)); setTestLoading(false);
    setOutput(null); setHasSuccessfulTest(false);
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAgentIdError(''); setSubmitError('');
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
          agentId: trimmedAgentId, name: name.trim(),
          description: description.trim() || undefined,
          ownerEmail: ownerEmail.trim() || undefined,
          allowedDomains: parseDomains(allowedDomains),
          allowedTools: selectedTools,
        }),
      });
      const data = await response.json();
      if (response.status === 409) { setAgentIdError('This Agent ID is already taken.'); return; }
      if (!response.ok) { setSubmitError(data.error || 'Registration failed'); return; }
      const result = data as RegistrationResponse;
      const nextTools = getPrimitiveTools(result.allowedTools);
      const nextTool = nextTools.includes(DEFAULT_CONNECT_TEST_TOOL) ? DEFAULT_CONNECT_TEST_TOOL : nextTools[0] ?? DEFAULT_CONNECT_TEST_TOOL;
      setRegistration(result); setTestTool(nextTool); setTestInput(getToolExample(nextTool)); setStep(2);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Registration failed');
    } finally { setLoading(false); }
  }

  async function runTest() {
    if (!registration) return;
    setTestLoading(true);
    try {
      const parsedInput = JSON.parse(testInput);
      const response = await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
        body: JSON.stringify({ tool: testTool, input: parsedInput }),
      });
      const data = await response.json();
      if (!response.ok) { setOutput({ success: false, label: '✗ Error', body: JSON.stringify(data, null, 2) }); return; }
      setOutput({ success: true, label: '✓ Connection successful', body: JSON.stringify(data, null, 2) });
      setHasSuccessfulTest(true);
    } catch (error) {
      setOutput({ success: false, label: '✗ Error', body: JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid JSON input' }, null, 2) });
    } finally { setTestLoading(false); }
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Nav activePath="/connect" />

      <div style={{ maxWidth: '1160px', margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Hero */}
        <section style={{ marginBottom: '48px' }}>
          <h1 style={{
            fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
            fontSize: '42px',
            fontWeight: 700,
            lineHeight: 1.1,
            marginBottom: '16px',
            marginTop: 0,
            color: 'var(--text-primary)',
          }}>Connect Any Agent to AgentOS</h1>
          <p style={{
            fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
            fontSize: '16px',
            color: 'var(--text-secondary)',
            maxWidth: '680px',
            lineHeight: 1.7,
            marginBottom: '24px',
          }}>
            One connection. Every capability. AgentOS gives your agent access to 32 built-in tools, the skills marketplace,
            and any external MCP server — Gmail, Slack, Stripe, GitHub, and more. Connect in 60 seconds.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '32px' }}>
            {languageTags.map(tag => (
              <span key={tag} style={{
                padding: '6px 14px',
                border: '1px solid var(--border-active)',
                fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}>{tag}</span>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1px', border: '1px solid var(--border)', backgroundColor: 'var(--border)' }}>
            {capabilityCards.map(card => (
              <div key={card.title} style={{ backgroundColor: 'var(--bg-secondary)', padding: '20px' }}>
                <div style={{ fontSize: '24px', marginBottom: '10px' }}>{card.icon}</div>
                <div style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>{card.title}</div>
                <div style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', color: 'var(--text-secondary)' }}>{card.subtitle}</div>
                <div style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '12px', color: 'var(--text-tertiary)' }}>{card.detail}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '32px', borderBottom: '1px solid var(--border)', paddingBottom: '24px' }}>
          {[
            { n: 1, label: 'Register' },
            { n: 2, label: 'Get Token' },
            { n: 3, label: 'Test Live' },
          ].map(({ n, label }, i) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
              {i > 0 && <div style={{ width: '40px', height: '1px', backgroundColor: step > i ? 'var(--accent)' : 'var(--border)' }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 4px' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                  fontSize: '13px',
                  fontWeight: 700,
                  backgroundColor: step === n ? 'var(--accent)' : step > n ? 'rgba(0,255,136,0.12)' : 'var(--bg-secondary)',
                  color: step === n ? 'var(--bg-primary)' : step > n ? 'var(--accent)' : 'var(--text-tertiary)',
                  border: `1px solid ${step >= n ? 'var(--accent)' : 'var(--border)'}`,
                  flexShrink: 0,
                }}>{n}</div>
                <span style={{
                  fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                  fontSize: '13px',
                  color: step === n ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}>{label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Step 1: Register */}
        {step === 1 && (
          <form onSubmit={handleRegister} style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', padding: '32px' }}>
            <div style={{ marginBottom: '28px' }}>
              <h2 style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '24px', fontWeight: 700, marginBottom: '8px', marginTop: 0 }}>Register Your Agent</h2>
              <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>Register once, get a token, and start calling AgentOS from any language.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={fieldLabelStyle}>Agent ID *</label>
                <input value={agentId} onChange={e => setAgentId(e.target.value)} placeholder="my-agent" className="input-dark" required />
                <div style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Lowercase letters, numbers, hyphens only</div>
                {agentIdError && <div style={{ color: 'var(--danger)', fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '12px', marginTop: '4px' }}>{agentIdError}</div>}
              </div>
              <div>
                <label style={fieldLabelStyle}>Agent Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="My Trading Agent" className="input-dark" required />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={fieldLabelStyle}>Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What does your agent do?" className="input-dark" style={{ resize: 'vertical', minHeight: '80px' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '28px' }}>
              <div>
                <label style={fieldLabelStyle}>Your Email</label>
                <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} placeholder="you@example.com" className="input-dark" />
              </div>
              <div>
                <label style={fieldLabelStyle}>Allowed Domains</label>
                <input value={allowedDomains} onChange={e => setAllowedDomains(e.target.value)} placeholder="api.binance.com, api.coingecko.com" className="input-dark" />
                <div style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Comma-separated. Leave blank for unrestricted outbound (SSRF protected).</div>
              </div>
            </div>

            {/* Tool permissions */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '24px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Tool Permissions</div>
                  <div style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', color: 'var(--text-secondary)' }}>Choose which built-in tools and MCP permissions this agent can use.</div>
                </div>
                <button type="button" onClick={toggleAllTools} style={{
                  background: 'none', border: 'none',
                  fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                  fontSize: '13px', color: 'var(--accent)', cursor: 'pointer', padding: 0,
                }}>
                  {DEFAULT_EXTERNAL_AGENT_TOOLS.every(t => selectedTools.includes(t)) && selectedTools.includes(EXTERNAL_MCP_WILDCARD) ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {EXTERNAL_AGENT_TOOL_GROUPS.map(group => {
                  const groupSelected = group.tools.every(t => isToolSelected(t));
                  return (
                    <div key={group.id} style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)', padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.06em' }}>{group.label}</div>
                        <button type="button" onClick={() => toggleGroup(group.tools)} style={{
                          background: 'none', border: 'none',
                          fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                          fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0,
                        }}>
                          {groupSelected ? 'Deselect Group' : 'Select Group'}
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                        {group.tools.map(tool => (
                          <label key={tool} style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                            fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer',
                          }}>
                            <input type="checkbox" checked={isToolSelected(tool)} onChange={() => toggleTool(tool)}
                              style={{ accentColor: 'var(--accent)', width: '14px', height: '14px' }} />
                            <span>{tool}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* External MCP group */}
                <div style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.06em' }}>EXTERNAL MCP</div>
                    <button type="button" onClick={() => toggleTool(EXTERNAL_MCP_WILDCARD)} style={{
                      background: 'none', border: 'none',
                      fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif',
                      fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0,
                    }}>
                      {isToolSelected(EXTERNAL_MCP_WILDCARD) ? 'Deselect Group' : 'Select Group'}
                    </button>
                  </div>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                    fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer', marginBottom: '8px',
                  }}>
                    <input type="checkbox" checked={isToolSelected(EXTERNAL_MCP_WILDCARD)} onChange={() => toggleTool(EXTERNAL_MCP_WILDCARD)}
                      style={{ accentColor: 'var(--accent)', width: '14px', height: '14px' }} />
                    <span>mcp.*</span>
                  </label>
                  <div style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    External MCP tools (Gmail, Slack, Stripe, etc.) available once connected servers are configured in your dashboard.
                  </div>
                </div>
              </div>
            </div>

            {submitError && <div style={{ color: 'var(--danger)', fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', marginBottom: '16px' }}>{submitError}</div>}

            <button type="submit" disabled={loading} className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', height: '48px', opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer', fontSize: '15px' }}>
              {loading ? 'Connecting...' : 'Connect Agent →'}
            </button>
          </form>
        )}

        {/* Step 2: Token */}
        {step === 2 && registration && (
          <div style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', padding: '32px' }}>
            <div style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '28px', marginBottom: '12px' }}>✓</div>
            <h2 style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '24px', fontWeight: 700, marginBottom: '8px', marginTop: 0 }}>Your agent is connected.</h2>
            <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>{registration.message}</p>

            {/* Token display */}
            <div style={{ position: 'relative', background: 'var(--code-bg)', border: '1px solid var(--code-border)', padding: '16px', fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', color: 'var(--accent)', overflowWrap: 'break-word', marginBottom: '12px' }}>
              <button type="button" onClick={() => copyText('token', registration.token)} style={{
                position: 'absolute', top: '12px', right: '12px',
                background: 'none', border: '1px solid var(--border)', borderRadius: '2px',
                color: copiedKey === 'token' ? 'var(--accent)' : 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                fontSize: '11px', padding: '3px 10px', cursor: 'pointer',
              }}>
                {copiedKey === 'token' ? 'copied!' : 'copy'}
              </button>
              {registration.token}
            </div>

            {/* Warning */}
            <div style={{ background: 'rgba(255,170,0,0.06)', border: '1px solid rgba(255,170,0,0.25)', color: 'var(--warning)', padding: '12px 16px', fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', marginBottom: '20px' }}>
              ⚠️ Save this token now. It will not be shown again.
            </div>

            {/* Endpoint */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <span style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', color: 'var(--text-secondary)' }}>Endpoint:</span>
              <code style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', color: 'var(--text-primary)', background: 'var(--code-bg)', border: '1px solid var(--code-border)', padding: '4px 10px' }}>{registration.mcpEndpoint}</code>
              <button type="button" onClick={() => copyText('endpoint', registration.mcpEndpoint)} style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: '2px',
                color: copiedKey === 'endpoint' ? 'var(--accent)' : 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                fontSize: '11px', padding: '3px 10px', cursor: 'pointer',
              }}>{copiedKey === 'endpoint' ? 'copied!' : 'copy'}</button>
            </div>

            {/* Access summary */}
            <div style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)', padding: '16px', marginBottom: '24px' }}>
              <div style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>What your agent can access</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <div><span style={{ color: 'var(--accent)', marginRight: '8px' }}>✓</span>{registration.allowedTools.filter(t => t.startsWith('agentos.') && !t.startsWith('agentos.skill.')).length} AgentOS primitives (agentos.*)</div>
                <div><span style={{ color: 'var(--accent)', marginRight: '8px' }}>✓</span>Skills marketplace (agentos.skill.*) once installed</div>
                <div><span style={{ color: 'var(--accent)', marginRight: '8px' }}>✓</span>External MCP servers (mcp.*) when configured</div>
              </div>
            </div>

            {/* Code snippet tabs */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)', marginBottom: '0' }}>
                {([['env', '.env'], ['node', 'Node.js'], ['python', 'Python'], ['curl', 'curl']] as const).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setSnippetTab(key)} style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: snippetTab === key ? '2px solid var(--accent)' : '2px solid transparent',
                    padding: '8px 16px',
                    fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                    fontSize: '12px',
                    color: snippetTab === key ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    marginBottom: '-1px',
                  }}>{label}</button>
                ))}
              </div>
              <div style={{ position: 'relative', background: 'var(--code-bg)', border: '1px solid var(--code-border)', borderTop: 'none', padding: '16px' }}>
                <button type="button" onClick={() => copyText(`snip-${snippetTab}`, currentSnippet)} style={{
                  position: 'absolute', top: '12px', right: '12px',
                  background: 'none', border: '1px solid var(--border)', borderRadius: '2px',
                  color: copiedKey === `snip-${snippetTab}` ? 'var(--accent)' : 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
                  fontSize: '11px', padding: '3px 10px', cursor: 'pointer',
                }}>{copiedKey === `snip-${snippetTab}` ? 'copied!' : 'copy'}</button>
                <pre style={{ margin: 0, fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', color: 'var(--text-secondary)', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{currentSnippet}</pre>
              </div>
            </div>

            <button type="button" onClick={() => setStep(3)} className="btn-primary" style={{ padding: '12px 28px', fontSize: '14px' }}>
              Continue →
            </button>
          </div>
        )}

        {/* Step 3: Test */}
        {step === 3 && registration && (
          <div style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)', padding: '32px' }}>
            <h2 style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '24px', fontWeight: 700, marginBottom: '8px', marginTop: 0 }}>Test it live.</h2>
            <p style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>Run a real tool call right now and confirm your agent is connected.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
              <div>
                <label style={fieldLabelStyle}>Tool</label>
                <select value={testTool} onChange={e => { setTestTool(e.target.value); setTestInput(getToolExample(e.target.value)); }} className="input-dark">
                  {primitiveTools.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={fieldLabelStyle}>Input JSON</label>
                <textarea value={testInput} onChange={e => setTestInput(e.target.value)} rows={8} className="input-dark"
                  style={{ minHeight: '180px', resize: 'vertical', fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px' }} />
              </div>
            </div>

            <button type="button" onClick={() => void runTest()} disabled={testLoading || primitiveTools.length === 0} className="btn-primary"
              style={{ padding: '12px 28px', fontSize: '14px', opacity: testLoading || primitiveTools.length === 0 ? 0.7 : 1 }}>
              {testLoading ? 'Running...' : 'Run Test'}
            </button>

            {primitiveTools.length === 0 && (
              <div style={{ color: 'var(--warning)', fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', marginTop: '12px' }}>
                No primitive tools were granted to this agent.
              </div>
            )}

            {output && (
              <div style={{ marginTop: '24px' }}>
                <div style={{ color: output.success ? 'var(--accent)' : 'var(--danger)', fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontWeight: 700, marginBottom: '8px', fontSize: '13px' }}>{output.label}</div>
                <div style={{ background: 'var(--code-bg)', border: `1px solid ${output.success ? 'rgba(0,255,136,0.3)' : 'rgba(255,68,68,0.3)'}`, padding: '16px' }}>
                  <pre style={{ margin: 0, fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{output.body}</pre>
                </div>
              </div>
            )}

            {hasSuccessfulTest && (
              <div style={{ marginTop: '32px', background: 'var(--code-bg)', border: '1px solid var(--code-border)', padding: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                  {['Agent registered', 'Token saved', 'Connection live'].map(item => (
                    <div key={item} style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', color: 'var(--accent)' }}>✓ {item}</div>
                  ))}
                </div>
                <div style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Your agent is now powered by AgentOS.</div>
                <div style={{ fontFamily: 'var(--font-sans), IBM Plex Sans, sans-serif', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                  One token. Primitives, skills, and every connected MCP server.
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <Link href="/docs" className="btn-primary">View Docs</Link>
                  <button type="button" onClick={resetFlow} className="btn-ghost">Connect Another Agent</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
