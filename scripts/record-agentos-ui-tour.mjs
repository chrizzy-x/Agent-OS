import { chromium } from 'playwright';
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.TOUR_BASE_URL ?? 'http://127.0.0.1:3000';
const OUTPUT_DIR = path.resolve('agentos-artifacts/ui-tour');
const RAW_VIDEO = path.join(OUTPUT_DIR, 'agentos-ui-tour-raw.webm');
const now = '2026-07-29T12:00:00.000Z';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

await mkdir(OUTPUT_DIR, { recursive: true });

const workspace = { id: 'workspace-tour', name: 'AgentOS Demo Workspace', slug: 'agentos-demo', plan: 'enterprise_max' };
const project = { id: 'project-tour', workspaceId: workspace.id, name: 'Enterprise Partnership Research', description: 'Research and partnership brief generated inside AgentOS.', status: 'active', pinned: true, updatedAt: now };
const workflows = [{
  id: 'workflow-tour',
  name: 'Enterprise Partner Intelligence',
  summary: 'Research, compare, verify, and package enterprise partnership opportunities.',
  steps: [
    { order: 1, tool: 'research', description: 'Collect current infrastructure partner information', input: {} },
    { order: 2, tool: 'compare', description: 'Score strategic fit and implementation value', input: {} },
    { order: 3, tool: 'verify', description: 'Challenge the leading recommendation', input: {} },
    { order: 4, tool: 'document', description: 'Create the one-page partnership brief', input: {} },
  ],
  graph_state: {},
  code_state: null,
  canonical_doc: {},
  status: 'active',
  visibility: 'workspace',
  schedule: '0 9 * * 1',
  last_result: { recommendation: 'Microsoft for Startups Founders Hub' },
  last_error: null,
  last_run_at: now,
  version: 3,
}];
const primeAgents = [
  { id: 'agent-research', name: 'Infrastructure Researcher', description: 'Finds credible enterprise infrastructure opportunities.', instructions: 'Prioritize primary sources and implementation fit.', status: 'active', workspaceId: workspace.id, visibility: 'workspace', exposedCapabilities: ['web-research', 'skill:source-verifier'] },
  { id: 'agent-strategy', name: 'Partnership Strategist', description: 'Scores strategic fit and prepares outreach rationale.', instructions: 'Challenge weak assumptions before recommending a partner.', status: 'active', workspaceId: workspace.id, visibility: 'private', exposedCapabilities: ['comparison', 'brief-generation'] },
];
const libraryItems = [
  { id: 'lib-brief', kind: 'saved_output', name: 'AgentOS Enterprise Partnership Brief', description: 'One-page verified partnership recommendation.', href: '/studio?session=session-tour', workspaceId: workspace.id, projectId: project.id, visibility: 'workspace', updatedAt: now, metadata: { status: 'complete', ownerName: 'Super AgentOS', category: 'Document' } },
  { id: 'lib-workflow', kind: 'saved_workflow', name: workflows[0].name, description: workflows[0].summary, href: '/workflows/workflow-tour', workspaceId: workspace.id, projectId: project.id, visibility: 'workspace', updatedAt: now, metadata: { status: 'active', version: '3', ownerName: 'AgentOS Demo Workspace' } },
  { id: 'lib-agent', kind: 'subagent', name: primeAgents[0].name, description: primeAgents[0].description, href: '/subagents', workspaceId: workspace.id, projectId: project.id, visibility: 'workspace', updatedAt: now, metadata: { status: 'active', ownerName: 'AgentOS Demo Workspace' } },
  { id: 'lib-skill', kind: 'installed_skill', name: 'Source Verifier', description: 'Checks source quality and contradiction risk.', href: '/skillstore', workspaceId: workspace.id, projectId: project.id, visibility: 'workspace', updatedAt: now, metadata: { status: 'installed', version: '1.4.0', slug: 'source-verifier', skillId: 'skill-source-verifier', publisherName: 'AgentOS', permissionsApproved: ['web.read'], capabilities: [{ name: 'verify_sources' }] } },
  { id: 'lib-app', kind: 'installed_app', name: 'deZypher', description: 'DeFi intelligence application connected to AgentOS.', href: '/appstore', workspaceId: workspace.id, projectId: null, visibility: 'workspace', updatedAt: now, metadata: { status: 'installed', version: '1.0.0', slug: 'dezypher', publisherName: 'deZypher', compatibility: ['AgentOS', 'Web'] } },
  { id: 'lib-mcp', kind: 'mcp_connection', name: 'GitHub MCP', description: 'Repository and engineering context connection.', href: '/mcp', workspaceId: workspace.id, projectId: null, visibility: 'private', updatedAt: now, metadata: { status: 'connected', ownerName: 'AgentOS Demo Workspace' } },
];

function studioPayload(messages = []) {
  return {
    session: { id: 'session-tour', workspaceId: workspace.id, projectId: project.id, title: 'Enterprise Partner Research', visibility: 'private', updatedAt: now },
    sessions: [{ id: 'session-tour', workspaceId: workspace.id, projectId: project.id, title: 'Enterprise Partner Research', visibility: 'private', updatedAt: now }],
    lineage: { parent: null, children: [] },
    messages,
    events: [],
    workspaces: [workspace],
    projects: [project],
    currentProject: project,
    workflows,
    vaultSecrets: [{ id: 'secret-tour', name: 'Enterprise Research Provider', provider: 'external', maskedValue: '••••••••••••', status: 'active' }],
    installedSkills: [{ id: 'skill-source-verifier', name: 'Source Verifier', slug: 'source-verifier', description: 'Verifies source quality and contradictions.' }],
    installedApps: [{ id: 'app-dezypher', name: 'deZypher', slug: 'dezypher', description: 'DeFi intelligence application.' }],
    superAgent: { id: 'super-tour', name: 'Super AgentOS', instructions: 'Plan, delegate, execute, verify, and preserve outputs.', status: 'active' },
    subagents: primeAgents,
    memoryEntries: [{ id: 'memory-tour', title: 'AgentOS enterprise positioning', content: 'Infrastructure, orchestration, edge compute, and autonomous execution.', updatedAt: now }],
    fileEntries: [{ id: 'file-tour', name: 'AgentOS_Enterprise_Partnership_Brief.md', type: 'text/markdown', size: 4820, updatedAt: now }],
    fileTree: [],
  };
}

const completedMessages = [
  { id: 'message-user', role: 'user', content: 'Research three enterprise AI infrastructure partners for AgentOS, compare their strategic fit, identify the strongest opportunity, and create a one-page partnership brief.', createdAt: now, state: 'complete' },
  { id: 'message-assistant', role: 'assistant', content: `## Enterprise infrastructure partner comparison\n\n1. **Microsoft for Startups Founders Hub** — strongest immediate fit for cloud infrastructure, enterprise distribution, developer tooling, and partner credibility.\n2. **Intel Partner Alliance** — strong fit for edge computing, hardware acceleration, robotics, and enterprise deployment.\n3. **NVIDIA Inception** — strong fit for GPU acceleration, model serving, and autonomous systems.\n\n### Recommended partner\n**Microsoft for Startups Founders Hub** is the strongest near-term opportunity because it can support AgentOS across infrastructure, marketplace access, technical enablement, and enterprise go-to-market.\n\n### Verification\nThe recommendation was challenged against hardware specialization, GPU depth, deployment readiness, and integration cost. Microsoft remains the best first partnership, while Intel and NVIDIA should remain parallel strategic tracks.\n\n### Deliverable\nA one-page partnership brief has been created and saved to Library.`, createdAt: now, state: 'complete' },
];

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  screen: { width: 1920, height: 1080 },
  colorScheme: 'light',
  deviceScaleFactor: 1,
  recordVideo: { dir: OUTPUT_DIR, size: { width: 1920, height: 1080 } },
});

await context.addInitScript(() => {
  localStorage.setItem('agentos:theme', 'light');
  document.documentElement.dataset.theme = 'light';
  window.addEventListener('DOMContentLoaded', () => {
    const cursor = document.createElement('div');
    cursor.id = 'agentos-tour-cursor';
    Object.assign(cursor.style, {
      position: 'fixed', width: '18px', height: '18px', borderRadius: '50%',
      border: '2px solid rgba(255,255,255,.95)', background: 'rgba(20,20,24,.72)',
      boxShadow: '0 2px 12px rgba(0,0,0,.28)', zIndex: '2147483647',
      pointerEvents: 'none', transform: 'translate(-50%,-50%)', left: '960px', top: '540px',
      transition: 'width .18s ease,height .18s ease,background .18s ease',
    });
    document.body.appendChild(cursor);
    document.addEventListener('mousemove', event => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
    });
    document.addEventListener('mousedown', () => { cursor.style.width = '28px'; cursor.style.height = '28px'; cursor.style.background = 'rgba(37,99,235,.75)'; });
    document.addEventListener('mouseup', () => { cursor.style.width = '18px'; cursor.style.height = '18px'; cursor.style.background = 'rgba(20,20,24,.72)'; });
  });
});

await context.route('**/api/**', async route => {
  const request = route.request();
  const url = new URL(request.url());
  const pathname = url.pathname;
  const json = payload => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });

  if (pathname === '/api/session' || pathname.startsWith('/api/session/')) {
    return json({ authenticated: true, session: { agentName: 'AgentOS Demo', plan: 'enterprise_max', planLabel: 'Enterprise Max', accountType: 'enterprise', capabilities: ['access_developer_console', 'create_app', 'publish_app', 'create_skill', 'publish_skill'], expiresAt: '2030-01-01T00:00:00.000Z' } });
  }
  if (pathname === '/api/shell/bootstrap') {
    return json({ workspaces: [workspace], sessions: studioPayload().sessions, projects: [project], notifications: { unread: 2 }, agents: { connected: 2 } });
  }
  if (pathname === '/api/studio/bootstrap' || pathname.startsWith('/api/studio/sessions/')) {
    return json(studioPayload(pathname.startsWith('/api/studio/sessions/') ? completedMessages : []));
  }
  if (pathname === '/api/studio/intent/stream') {
    await sleep(9000);
    const events = [
      ['execution', { executionId: 'execution-tour', status: 'RUNNING' }],
      ['status', { text: 'Planning the complete objective...' }],
      ['status', { text: 'Delegating research and verification...' }],
      ['status', { text: 'Comparing enterprise infrastructure partners...' }],
      ['delta', { text: completedMessages[1].content }],
      ['done', { executionId: 'execution-tour', status: 'COMPLETED' }],
    ].map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
    return route.fulfill({ status: 200, contentType: 'text/event-stream; charset=utf-8', body: events });
  }
  if (pathname === '/api/library') {
    const groups = Object.fromEntries(['installed_app','installed_skill','saved_workflow','project','subagent','memory_collection','saved_output','template','file','published_asset','forked_asset','mcp_connection','external_connection','download','recent_activity'].map(kind => [kind, libraryItems.filter(item => item.kind === kind)]));
    const summary = Object.fromEntries(Object.entries(groups).map(([kind, items]) => [kind, items.length]));
    return json({ items: libraryItems, groups, summary });
  }
  if (pathname === '/api/workspaces') return json({ workspaces: [workspace] });
  if (pathname === '/api/projects' || pathname === '/api/dashboard') return json({ projects: [project], workspaces: [workspace], recentActivity: [], tasks: [], notifications: [] });
  if (pathname === '/api/subagents') return json({ subagents: primeAgents });
  if (pathname === '/api/skills/installed') return json({ installed_skills: [{ id: 'install-source-verifier', skill: { id: 'skill-source-verifier', name: 'Source Verifier', slug: 'source-verifier', description: 'Verifies sources and contradiction risk.' } }] });
  if (pathname === '/api/agent/workflows') {
    if (url.searchParams.get('discover') === 'public') return json({ workflows: [{ id: 'public-research', name: 'Enterprise Research Pack', summary: 'Public reusable enterprise research flow.', status: 'active', visibility: 'public', schedule: null, version: 2, stepCount: 4, starred: true, forked: false, monetization: 'not_monetized', pricingLabel: 'Free', requiresVaultConfiguration: false, privateContextRemoved: true, privacyNote: 'Private context removed' }] });
    return json({ workflows });
  }
  if (pathname.startsWith('/api/executions')) return json({ executions: [{ id: 'execution-tour', title: 'Enterprise Partner Intelligence', status: 'COMPLETED', workflowId: 'workflow-tour', output: { recommendation: 'Microsoft for Startups Founders Hub' }, durationMs: 18400, startedAt: now, completedAt: now, createdAt: now, updatedAt: now }] });
  if (pathname.startsWith('/api/recovery')) return json({ executions: [] });
  if (pathname.startsWith('/api/notifications')) return json({ notifications: [{ id: 'n1', title: 'Partnership brief completed', read: false, createdAt: now }, { id: 'n2', title: 'Source verification passed', read: false, createdAt: now }] });
  if (pathname.includes('/vault')) return json({ secrets: [{ id: 'secret-tour', name: 'Enterprise Research Provider', provider: 'external', maskedValue: '••••••••••••', status: 'active', createdAt: now }] });
  if (pathname.includes('/mcp')) return json({ connections: [{ id: 'mcp-github', name: 'GitHub MCP', status: 'connected', tools: 18, updatedAt: now }], servers: [{ id: 'mcp-github', name: 'GitHub MCP', status: 'connected' }] });
  if (pathname.includes('/apps')) return json({ apps: [{ id: 'app-dezypher', name: 'deZypher', slug: 'dezypher', description: 'Decode market intelligence with AgentOS.', category: 'Finance', status: 'published' }] });
  if (pathname.includes('/skills')) return json({ skills: [{ id: 'skill-source-verifier', name: 'Source Verifier', slug: 'source-verifier', description: 'Verifies source quality.', category: 'Research', status: 'published' }] });
  return json({ items: [], apps: [], skills: [], workflows: [], subagents: [], connections: [], secrets: [], workspaces: [workspace], projects: [project], executions: [], notifications: [] });
});

const page = await context.newPage();
const video = page.video();

async function move(x, y, steps = 30) {
  await page.mouse.move(x, y, { steps });
}

async function overlay(kicker, title, detail = '') {
  await page.evaluate(({ kicker, title, detail }) => {
    document.getElementById('agentos-tour-overlay')?.remove();
    const panel = document.createElement('div');
    panel.id = 'agentos-tour-overlay';
    panel.innerHTML = `<div style="font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.68;margin-bottom:8px">${kicker}</div><div style="font-size:30px;font-weight:780;line-height:1.05;letter-spacing:-.03em">${title}</div>${detail ? `<div style="font-size:16px;line-height:1.45;opacity:.78;margin-top:10px;max-width:680px">${detail}</div>` : ''}`;
    Object.assign(panel.style, {
      position: 'fixed', left: '42px', bottom: '38px', zIndex: '2147483600',
      maxWidth: '760px', padding: '20px 24px', borderRadius: '18px', color: '#111827',
      background: 'rgba(255,255,255,.90)', border: '1px solid rgba(15,23,42,.12)',
      boxShadow: '0 24px 70px rgba(15,23,42,.20)', backdropFilter: 'blur(18px)',
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', opacity: '0', transform: 'translateY(12px)',
      transition: 'opacity .35s ease, transform .35s ease', pointerEvents: 'none',
    });
    document.body.appendChild(panel);
    requestAnimationFrame(() => { panel.style.opacity = '1'; panel.style.transform = 'translateY(0)'; });
  }, { kicker, title, detail });
}

async function clearOverlay() {
  await page.evaluate(() => {
    const panel = document.getElementById('agentos-tour-overlay');
    if (!panel) return;
    panel.style.opacity = '0';
    panel.style.transform = 'translateY(12px)';
    setTimeout(() => panel.remove(), 360);
  }).catch(() => {});
}

async function visit(route, kicker, title, detail, holdMs) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(1200);
  await overlay(kicker, title, detail);
  await move(1540, 160, 40);
  await move(980, 480, 40);
  await sleep(holdMs);
  await clearOverlay();
}

// 0:00–0:06 — landing
await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(1200);
await overlay('AgentOS', 'The operating system for autonomous intelligence.', 'A real product tour recorded from the current AgentOS interface.');
await move(960, 540, 45);
await move(960, 690, 35);
await sleep(4800);
await clearOverlay();

// 0:06–0:13 — workspace reveal
await visit('/studio?mode=nl&session=session-tour', 'Workspace', 'One operating environment for intelligence and execution.', 'Navigation, Studio, sessions, projects, and reusable assets remain visible together.', 5800);

// 0:13–0:22 — Studio modes
await overlay('Studio', 'Natural language, Primeflow building, and code execution.', 'Move between operating modes without leaving the AgentOS workspace.');
const workflowTab = page.getByRole('tab', { name: /Workflow Builder/i });
if (await workflowTab.count()) { await move(770, 154, 30); await workflowTab.first().click(); await sleep(2200); }
const codeTab = page.getByRole('tab', { name: /Code Studio/i });
if (await codeTab.count()) { await move(930, 154, 30); await codeTab.first().click(); await sleep(2200); }
const nlTab = page.getByRole('tab', { name: /NL Studio/i });
if (await nlTab.count()) { await move(610, 154, 30); await nlTab.first().click(); await sleep(2200); }
await sleep(1200);
await clearOverlay();

// 0:22–0:28 — command composition
await overlay('One command', 'Give AgentOS the complete objective.', 'Research, comparison, verification, and document creation begin from one instruction.');
const composer = page.getByLabel('Message Super AgentOS');
if (await composer.count()) {
  await composer.fill('Research three enterprise AI infrastructure partners for AgentOS, compare their strategic fit, identify the strongest opportunity, and create a one-page partnership brief.');
  await sleep(2400);
  await move(1710, 925, 35);
  const send = page.getByRole('button', { name: 'Send message' });
  if (await send.count()) await send.first().click();
}
await sleep(2400);
await clearOverlay();

// 0:28–0:42 — real execution state, deterministic API response
await overlay('Plan', 'Interpret the objective and assemble the execution graph.', 'Super AgentOS prepares the complete task before producing the result.');
await sleep(3000);
await overlay('Delegate', 'Assign research and verification responsibilities.', 'Specialised intelligence works within the same controlled execution.');
await sleep(3000);
await overlay('Execute', 'Compare infrastructure, strategic fit, and implementation value.', 'The workflow remains visible and interruptible while it runs.');
await sleep(3000);
await overlay('Verify', 'Challenge the leading recommendation before delivery.', 'Weak conclusions are revised before the final brief is preserved.');
await sleep(5000);
await clearOverlay();

// 0:42–0:49 — completed result
await overlay('Completed', 'A verified recommendation and partnership brief.', 'The result stays inside the session and becomes a reusable workspace asset.');
await page.mouse.wheel(0, 700);
await sleep(3500);
await page.mouse.wheel(0, 700);
await sleep(3500);
await clearOverlay();

// 0:49–0:55 — projects
await visit('/projects', 'Projects', 'Continuing objectives stay organised.', 'Sessions, activity, outputs, and project context remain connected.', 4800);

// 0:55–1:02 — library
await visit('/library', 'Library', 'Everything created or installed remains reusable.', 'Outputs, apps, skills, Prime Agents, Primeflows, files, and connections become workspace assets.', 5800);

// 1:02–1:07 — App Store
await visit('/appstore', 'App Store', 'Extend AgentOS with specialised applications.', 'Discover applications that operate inside the wider AgentOS environment.', 3800);

// 1:07–1:12 — Skill Store
await visit('/skillstore', 'Skill Store', 'Add focused capabilities without rebuilding the system.', 'Skills can be installed, permissioned, and called when a task requires them.', 3800);

// 1:12–1:18 — Prime Agents
await visit('/subagents', 'Prime Agents', 'Specialised intelligence with explicit instructions and access boundaries.', 'The current interface may still display the legacy Subagents label while terminology migration is completed.', 4800);

// 1:18–1:24 — Primeflows
await visit('/workflows', 'Primeflows', 'Turn successful multi-step work into repeatable execution.', 'Inspect steps, schedules, runtime history, and recovery state.', 4800);

// 1:24–1:28 — Vault
await visit('/vault', 'Vault', 'Protect provider credentials and sensitive access.', 'Secrets remain masked and are made available only to authorised execution paths.', 2800);

// 1:28–1:32 — Universal MCP
await visit('/mcp', 'Universal MCP', 'Connect AgentOS to external tools and systems.', 'Connections expand execution without fragmenting the user workspace.', 2800);

// 1:32–1:35 — FFP
await visit('/ffp', 'FFP', 'The future native consensus layer.', 'The interface presents FFP honestly as a coming layer for multi-intelligence coordination.', 1800);

// 1:35–1:40 — closing
await page.setContent(`<!doctype html><html><body style="margin:0;background:radial-gradient(circle at 50% 35%,#eef2ff 0,#f8fafc 36%,#e2e8f0 100%);font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#0f172a;display:grid;place-items:center;height:100vh"><main style="text-align:center"><div style="font-size:76px;font-weight:850;letter-spacing:-.065em">AgentOS</div><div style="font-size:30px;font-weight:700;margin-top:20px">One command. Every task, end to end.</div><div style="font-size:20px;opacity:.58;margin-top:22px">agentos.services</div></main></body></html>`, { waitUntil: 'domcontentloaded' });
await sleep(5000);

await context.close();
await browser.close();
if (!video) throw new Error('Playwright did not create a video.');
const recordedPath = await video.path();
await copyFile(recordedPath, RAW_VIDEO);
console.log(RAW_VIDEO);
