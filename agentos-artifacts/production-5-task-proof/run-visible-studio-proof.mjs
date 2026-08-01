import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const BASE_URL = process.env.AGENTOS_PROOF_URL || 'https://www.agentos.services';
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runToken = crypto.randomBytes(5).toString('hex');
const root = path.resolve('agentos-artifacts', 'production-5-task-proof', `visible-${runId}`);
const videoDir = path.join(root, 'video');
const openaiKey = process.env.E2E_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
const anthropicKey = process.env.E2E_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const reuseLatestProofAccount = process.env.AGENTOS_PROOF_REUSE_LATEST === '1';
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL || '';
const sensitiveValues = [openaiKey, anthropicKey, supabaseServiceRoleKey, dbUrl].filter(Boolean);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const evidence = {
  runId,
  runToken,
  baseUrl: BASE_URL,
  startedAt: new Date().toISOString(),
  commit: null,
  artifactsRoot: root,
  inputs: {
    openaiKeyPresent: Boolean(openaiKey),
    anthropicKeyPresent: Boolean(anthropicKey),
    reuseLatestProofAccount,
    supabaseVerificationConfigured: Boolean(supabaseUrl && supabaseServiceRoleKey),
    directDatabaseVerificationConfigured: Boolean(dbUrl),
  },
  auth: {},
  api: [],
  tasks: [],
  db: { attempted: false, status: 'not_run', rows: {} },
  browser: { console: [], pageErrors: [] },
  videos: [],
};

const network = [];
let currentPanelLines = [];

function log(icon, color, message) {
  console.log(`${colors[color] || ''}${icon}${colors.reset} ${message}`);
}

function redactText(value) {
  if (typeof value !== 'string') return value;
  let next = value;
  for (const secret of sensitiveValues) {
    if (secret) next = next.split(secret).join('[redacted-secret]');
  }
  next = next.replace(/sk-(proj-|ant-api03-)?[A-Za-z0-9_-]{16,}/g, '[redacted-provider-key]');
  next = next.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[redacted-token]');
  next = next.replace(/agent_[A-Za-z0-9_-]+/g, '[redacted-agent-id]');
  return next;
}

function redactDeep(value, key = '') {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(item => redactDeep(item));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      if (/credential|password|apiKey|token|authorization|secret|cookie|bearer/i.test(childKey)) {
        out[childKey] = '[redacted]';
      } else if (/agentId|ownerAgentId|publisherId|author_id|agent_id/i.test(childKey)) {
        out[childKey] = '[redacted-agent-id]';
      } else {
        out[childKey] = redactDeep(childValue, childKey);
      }
    }
    return out;
  }
  return value;
}

function decodeAgentId(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

function task(name, status, proof = {}, details = {}) {
  const record = {
    name,
    status,
    proof: redactDeep(proof),
    details: redactDeep(details),
    at: new Date().toISOString(),
  };
  evidence.tasks.push(record);
  log(status === 'PASS' ? '[OK]' : '[FAIL]', status === 'PASS' ? 'green' : 'red', `${name}: ${status}`);
  return record;
}

async function saveJson(name, value) {
  await fs.writeFile(path.join(root, name), `${JSON.stringify(redactDeep(value), null, 2)}\n`, 'utf8');
}

async function supabaseSelect(table, params) {
  if (!supabaseUrl || !supabaseServiceRoleKey) return { error: 'Supabase REST verification is not configured.' };
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: {
      apikey: supabaseServiceRoleKey,
      authorization: `Bearer ${supabaseServiceRoleKey}`,
      accept: 'application/json',
    },
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) return { error: json?.message || text || `status ${response.status}`, status: response.status, code: json?.code ?? null };
  return json ?? [];
}

async function supabaseSelectWithFallback(table, attempts) {
  let last = null;
  for (const params of attempts) {
    const result = await supabaseSelect(table, params);
    if (!result || !('error' in result)) return result;
    last = result;
  }
  return last ?? { error: 'No verification attempts ran.' };
}

async function attachPanel(page) {
  await page.evaluate(() => {
    if (document.getElementById('agentos-live-proof-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'agentos-live-proof-panel';
    panel.style.cssText = [
      'position:fixed',
      'right:12px',
      'top:84px',
      'z-index:2147483647',
      'width:min(380px,calc(100vw - 24px))',
      'max-height:42vh',
      'overflow:auto',
      'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'color:#eaf7ff',
      'background:rgba(4,10,18,.92)',
      'border:1px solid rgba(78,201,176,.55)',
      'box-shadow:0 16px 46px rgba(0,0,0,.34)',
      'border-radius:8px',
      'padding:10px',
      'white-space:pre-wrap',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(panel);
  }).catch(() => undefined);
}

async function panel(page, lines) {
  currentPanelLines = lines;
  const recent = network
    .filter(item => item.type === 'response')
    .slice(-4)
    .map(item => `net ${item.status} ${new URL(item.url, BASE_URL).pathname}`.slice(0, 76));
  await attachPanel(page);
  await page.evaluate(text => {
    const node = document.getElementById('agentos-live-proof-panel');
    if (node) node.textContent = text;
  }, [...lines, ...recent].join('\n')).catch(() => undefined);
}

async function waitForStudio(page, timeout = 120000) {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await page.locator('textarea[aria-label="Message Super AgentOS"], textarea[placeholder^="Message Super AgentOS"]').first()
    .waitFor({ state: 'visible', timeout });
}

async function openStudio(page, sessionId = null) {
  const session = sessionId ? `&session=${encodeURIComponent(sessionId)}` : '';
  const url = `${BASE_URL}/studio?mode=nl${session}`;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await waitForStudio(page, 120000);
      return;
    } catch (error) {
      lastError = error;
      await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
    }
  }
  throw lastError ?? new Error('Studio did not load');
}

async function fillControlled(page, selector, value) {
  const input = page.locator(selector);
  await input.waitFor({ state: 'visible', timeout: 30000 });
  await input.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(value, { delay: 8 });
  await page.waitForFunction(({ selector, value }) => {
    const node = document.querySelector(selector);
    return node instanceof HTMLInputElement && node.value === value;
  }, { selector, value }, { timeout: 10000 });
}

async function waitForSubmitEnabled(page) {
  await page.waitForFunction(() => {
    const button = document.querySelector('form button[type="submit"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, null, { timeout: 15000 });
}

async function latestAssistantText(page) {
  const count = await page.locator('.nl-message.assistant').count();
  if (!count) return '';
  return (await page.locator('.nl-message.assistant').nth(count - 1).innerText({ timeout: 10000 })).trim();
}

async function waitForQuiet(page, timeout = 120000) {
  await page.waitForFunction(() => {
    return !document.querySelector('.nl-message.assistant.streaming')
      && !document.querySelector('button[aria-label="Stop generation"]');
  }, null, { timeout });
}

async function assistantHistoryKey(page) {
  return await page.evaluate(() => {
    const messages = Array.from(document.querySelectorAll('.nl-message.assistant'));
    const latest = messages[messages.length - 1];
    return {
      count: messages.length,
      text: latest?.textContent?.trim() ?? '',
      streaming: Boolean(document.querySelector('.nl-message.assistant.streaming')),
      stop: Boolean(document.querySelector('button[aria-label="Stop generation"]')),
    };
  }).catch(() => ({ count: 0, text: '', streaming: false, stop: false }));
}

async function waitForAssistantHistorySettled(page, timeout = 15000) {
  const deadline = Date.now() + timeout;
  let lastKey = '';
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    const sample = await assistantHistoryKey(page);
    const key = `${sample.count}:${sample.text.length}:${sample.text.slice(0, 160)}`;
    if (!sample.streaming && !sample.stop && key === lastKey && Date.now() - stableSince >= 1200) return sample;
    if (key !== lastKey || sample.streaming || sample.stop) {
      lastKey = key;
      stableSince = Date.now();
    }
    await page.waitForTimeout(250);
  }
  return assistantHistoryKey(page);
}

async function submitPrompt(page, prompt) {
  await waitForStudio(page);
  const input = page.getByLabel('Message Super AgentOS');
  await input.fill(prompt);
  await page.getByLabel('Send message').click();
  await page.waitForFunction(text => document.body.innerText.includes(text), prompt, { timeout: 20000 });
}

async function observeStreaming(page, beforeAssistantCount, timeout = 45000) {
  const deadline = Date.now() + timeout;
  let sawStreaming = false;
  let sawStop = false;
  let grew = false;
  let maxLen = 0;
  while (Date.now() < deadline) {
    const sample = await page.evaluate(index => {
      const messages = Array.from(document.querySelectorAll('.nl-message.assistant'));
      const latest = messages[messages.length - 1];
      return {
        count: messages.length,
        text: latest?.textContent ?? '',
        streaming: Boolean(document.querySelector('.nl-message.assistant.streaming')),
        stop: Boolean(document.querySelector('button[aria-label="Stop generation"]')),
      };
    }, beforeAssistantCount).catch(() => ({ count: 0, text: '', streaming: false, stop: false }));
    if (sample.streaming) sawStreaming = true;
    if (sample.stop) sawStop = true;
    if (sample.text.length > maxLen + 12) grew = maxLen > 0 || sample.text.length > 24;
    maxLen = Math.max(maxLen, sample.text.length);
    if (!sample.streaming && sample.count > beforeAssistantCount) break;
    await page.waitForTimeout(250);
  }
  return { sawStreaming, sawStop, grew, maxLen };
}

async function sendAndWait(page, prompt, opts = {}) {
  await panel(page, opts.panelLines ?? ['Studio task running', prompt.slice(0, 120)]);
  await waitForAssistantHistorySettled(page, opts.historyTimeout ?? 15000);
  const before = await page.locator('.nl-message.assistant').count();
  await submitPrompt(page, prompt);
  const stream = await observeStreaming(page, before, opts.streamTimeout ?? 45000);
  await waitForQuiet(page, opts.timeout ?? 180000);
  const responseArrived = await page.waitForFunction(count => {
    return document.querySelectorAll('.nl-message.assistant').length > count;
  }, before, { timeout: opts.responseTimeout ?? 15000 }).then(() => true).catch(() => false);
  if (!responseArrived) {
    const stale = await latestAssistantText(page).catch(() => '');
    throw new Error(`No new assistant response appeared after prompt; latest stale text: ${stale.slice(0, 500)}`);
  }
  const text = await latestAssistantText(page);
  if (opts.expect && !opts.expect.test(text)) {
    throw new Error(`Expected assistant text to match ${opts.expect}; got ${text.slice(0, 500)}`);
  }
  return { text, stream };
}

async function sendForApproval(page, prompt, expected, timeout = 300000) {
  await panel(page, ['Approval-backed Studio task', prompt.slice(0, 120)]);
  await submitPrompt(page, prompt);
  await page.locator('.nl-approval-row').waitFor({ state: 'visible', timeout });
  const approvalText = (await page.locator('.nl-approval-row').innerText()).trim();
  if (expected && !expected.test(approvalText)) {
    throw new Error(`Expected approval text ${expected}; got ${approvalText}`);
  }
  return approvalText;
}

async function approve(page, opts = {}) {
  const approvalText = (await page.locator('.nl-approval-row').innerText()).trim();
  await page.locator('.nl-approval-row').getByRole('button', { name: 'Approve' }).click();
  if (opts.waitForUrl) {
    await page.waitForURL(opts.waitForUrl, { timeout: opts.timeout ?? 90000 });
  } else {
    await waitForQuiet(page, opts.timeout ?? 120000);
    await page.locator('.nl-approval-row').waitFor({ state: 'detached', timeout: 30000 }).catch(() => undefined);
  }
  if (opts.expectText) {
    await page.waitForFunction(pattern => new RegExp(pattern, 'i').test(document.body.innerText), opts.expectText.source, { timeout: 90000 })
      .catch(async error => {
        if (!opts.sessionId) throw error;
        await openStudio(page, opts.sessionId);
        await page.waitForFunction(pattern => new RegExp(pattern, 'i').test(document.body.innerText), opts.expectText.source, { timeout: 90000 });
      });
  }
  return { approvalText, text: await latestAssistantText(page).catch(() => '') };
}

async function selectIntelligence(page, label, modelId) {
  await waitForStudio(page);
  await page.getByLabel('Choose intelligence').click();
  await page.locator('.nl-intelligence-menu').waitFor({ state: 'visible', timeout: 30000 });
  const option = page.locator('.nl-intelligence-option').filter({ hasText: modelId }).first();
  if (await option.count() === 0) {
    const menuText = await page.locator('.nl-intelligence-menu').innerText().catch(() => '');
    throw new Error(`${label} model ${modelId} is not selectable. Menu: ${menuText.slice(0, 1000)}`);
  }
  await option.locator('button[role="menuitemradio"]').first().click();
  await page.waitForFunction(model => {
    const trigger = document.querySelector('button[aria-label="Choose intelligence"]');
    return Boolean(trigger?.textContent?.includes(model));
  }, modelId, { timeout: 30000 });
  await panel(page, [`Selected intelligence: ${label} / ${modelId}`]);
}

async function selectNative(page) {
  await waitForStudio(page);
  await page.getByLabel('Choose intelligence').click();
  await page.locator('.nl-intelligence-section.native button[role="menuitemradio"]').click();
  await page.waitForFunction(() => {
    const trigger = document.querySelector('button[aria-label="Choose intelligence"]');
    return Boolean(trigger?.textContent?.includes('Native Super AgentOS'));
  }, null, { timeout: 30000 });
  await panel(page, ['Selected intelligence: Native Super AgentOS']);
}

async function connectIntelligenceThroughVault(page, params) {
  await page.goto(`${BASE_URL}/vault`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
  await panel(page, [
    'Vault connection setup through UI',
    `Adding ${params.label} / ${params.modelId}`,
  ]);
  await page.getByRole('tab', { name: 'Connected Intelligence' }).click();
  await page.getByLabel('Connection vendor').selectOption(params.vendor);
  await page.getByLabel('Exact model').selectOption(params.modelId);
  await page.getByPlaceholder('Connection name').fill(params.displayName);
  await page.getByPlaceholder('Credential value').fill(params.credential);
  await page.waitForFunction(() => {
    const button = Array.from(document.querySelectorAll('button'))
      .find(node => node.textContent?.includes('Validate and connect'));
    return button instanceof HTMLButtonElement && !button.disabled;
  }, null, { timeout: 15000 });
  const connectResponse = page.waitForResponse(response => {
    try {
      const url = new URL(response.url());
      return url.pathname === '/api/intelligence/connections' && response.request().method() === 'POST';
    } catch {
      return false;
    }
  }, { timeout: 120000 });
  await page.getByRole('button', { name: 'Validate and connect' }).click();
  const response = await connectResponse;
  const payload = await response.json().catch(() => ({}));
  evidence.api.push({
    at: new Date().toISOString(),
    label: `vault-ui-connect-${params.vendor}`,
    path: '/api/intelligence/connections',
    status: response.status(),
    ok: response.ok(),
    body: redactDeep({
      connectionStatus: payload?.connection?.status,
      selectedModelId: payload?.connection?.selectedModelId,
      validated: payload?.validated,
      error: payload?.error,
    }),
  });
  await page.waitForFunction(() => /Connection validated|Connection saved as invalid/i.test(document.body.innerText), null, { timeout: 90000 });
  if (!response.ok() || payload?.connection?.status !== 'active') {
    throw new Error(`${params.label} connection failed: ${response.status()}`);
  }
  return payload.connection;
}

async function api(page, pathName, { method = 'GET', body, label = pathName, sensitive = false } = {}) {
  const result = await page.evaluate(async ({ pathName, method, body }) => {
    const response = await fetch(pathName, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    return { status: response.status, ok: response.ok, json, text: json ? null : text.slice(0, 3000) };
  }, { pathName, method, body });
  evidence.api.push({
    at: new Date().toISOString(),
    label,
    path: pathName,
    status: result.status,
    ok: result.ok,
    body: sensitive ? { redacted: true, keys: result.json ? Object.keys(result.json) : [] } : redactDeep(result.json ?? result.text),
  });
  return result;
}

async function dbVerify(ids) {
  if (dbUrl && ids.agentId) {
    try {
      const pg = await import('pg');
      const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
      await client.connect();
      const queries = {
        account: ['select id,name,created_at from agents where id = $1 limit 1', [ids.agentId]],
        connections: ['select vendor,status,selected_model_id,created_at from intelligence_connections where owner_agent_id = $1 order by created_at desc limit 8', [ids.agentId]],
        invocations: ['select vendor,model_id,status,streamed,created_at from intelligence_invocations where owner_agent_id = $1 order by created_at desc limit 8', [ids.agentId]],
        sessions: ['select id,title,updated_at from nl_studio_sessions where owner_agent_id = $1 order by updated_at desc limit 5', [ids.agentId]],
        messages: ['select role,left(content,160) as content,created_at from nl_studio_messages where owner_agent_id = $1 order by created_at desc limit 12', [ids.agentId]],
        app: ['select slug,visibility,published,created_at from agent_apps where slug = $1 limit 1', [ids.appSlug]],
        skill: ['select id,slug,published,visibility,created_at from skills where slug = $1 limit 1', [ids.skillSlug]],
        skillUsage: ['select su.capability_name,su.success,su.created_at,s.slug from skill_usage su join skills s on s.id = su.skill_id where su.agent_id = $1 and s.slug = $2 order by su.created_at desc limit 5', [ids.agentId, ids.skillSlug]],
        primeAgents: ['select id,name,status,created_at from private_subagents where owner_agent_id = $1 order by created_at desc limit 5', [ids.agentId]],
        memory: ['select key,namespace_type,visibility,updated_at from agent_memory_store where owner_agent_id = $1 and key like $2 order by updated_at desc limit 10', [ids.agentId, `%${runToken}%`]],
        executions: ['select source_type,status,title,created_at from agent_executions where agent_id = $1 order by created_at desc limit 15', [ids.agentId]],
      };
      const rows = {};
      for (const [name, [sql, params]] of Object.entries(queries)) {
        try { rows[name] = (await client.query(sql, params)).rows; }
        catch (error) { rows[name] = { error: error instanceof Error ? error.message : String(error) }; }
      }
      await client.end();
      evidence.db = { attempted: true, status: 'completed', method: 'postgres', rows };
      return;
    } catch (error) {
      evidence.db = { attempted: true, status: 'failed', method: 'postgres', error: error instanceof Error ? error.message : String(error), rows: {} };
    }
  }

  if (!supabaseUrl || !supabaseServiceRoleKey || !ids.agentId) return;
  evidence.db = {
    attempted: true,
    status: 'completed',
    method: 'supabase_rest',
    rows: {
      account: await supabaseSelect('agents', { id: `eq.${ids.agentId}`, select: 'id,name,created_at', limit: '1' }),
      connections: await supabaseSelectWithFallback('intelligence_connections', [
        { owner_agent_id: `eq.${ids.agentId}`, select: 'vendor,status,selected_model_id,created_at', order: 'created_at.desc', limit: '8' },
      ]),
      invocations: await supabaseSelectWithFallback('intelligence_invocations', [
        { owner_agent_id: `eq.${ids.agentId}`, select: 'vendor,model_id,status,streamed,created_at', order: 'created_at.desc', limit: '8' },
      ]),
      sessions: await supabaseSelect('nl_studio_sessions', { owner_agent_id: `eq.${ids.agentId}`, select: 'id,title,updated_at', order: 'updated_at.desc', limit: '5' }),
      messages: await supabaseSelect('nl_studio_messages', { owner_agent_id: `eq.${ids.agentId}`, select: 'role,content,created_at', order: 'created_at.desc', limit: '12' }),
      app: await supabaseSelectWithFallback('agent_apps', [
        { slug: `eq.${ids.appSlug}`, select: 'slug,visibility,published,created_at', limit: '1' },
      ]),
      skill: await supabaseSelect('skills', { slug: `eq.${ids.skillSlug}`, select: 'id,slug,published,visibility,created_at', limit: '1' }),
      skillUsage: await supabaseSelect('skill_usage', { agent_id: `eq.${ids.agentId}`, select: 'skill_id,capability_name,success,created_at', order: 'created_at.desc', limit: '8' }),
      primeAgents: await supabaseSelect('private_subagents', { owner_agent_id: `eq.${ids.agentId}`, select: 'id,name,status,created_at', order: 'created_at.desc', limit: '5' }),
      memory: await supabaseSelectWithFallback('agent_memory_store', [
        { owner_agent_id: `eq.${ids.agentId}`, key: `like.*${runToken}*`, select: 'key,namespace_type,visibility,updated_at', order: 'updated_at.desc', limit: '10' },
        { agent_id: `eq.${ids.agentId}`, key: `like.*${runToken}*`, select: 'key,updated_at', order: 'updated_at.desc', limit: '10' },
      ]),
      executions: await supabaseSelectWithFallback('agent_executions', [
        { agent_id: `eq.${ids.agentId}`, select: 'source_type,status,title,created_at', order: 'created_at.desc', limit: '15' },
      ]),
    },
  };
}

async function findLatestReusableProofAccount() {
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  const agents = await supabaseSelect('agents', {
    select: 'id,name,metadata,created_at',
    order: 'created_at.desc',
    limit: '80',
  });
  if (!Array.isArray(agents)) return null;

  for (const agent of agents) {
    const email = typeof agent?.metadata?.email === 'string' ? agent.metadata.email : '';
    const token = /^agentos-proof-([a-f0-9]{10})@example\.com$/i.exec(email)?.[1];
    if (!token) continue;
    const connections = await supabaseSelect('intelligence_connections', {
      owner_agent_id: `eq.${agent.id}`,
      select: 'vendor,status,selected_model_id,created_at',
      order: 'created_at.desc',
      limit: '10',
    });
    if (!Array.isArray(connections)) continue;
    const hasOpenAI = connections.some(item => item.vendor === 'openai' && item.status === 'active' && item.selected_model_id === 'gpt-5-mini');
    const hasAnthropic = connections.some(item => item.vendor === 'anthropic' && item.status === 'active' && item.selected_model_id === 'claude-sonnet-4-6');
    if (hasOpenAI && hasAnthropic) {
      return {
        agentId: String(agent.id),
        email,
        password: `ProofPass-${token}!9`,
        createdAt: agent.created_at,
        connections,
      };
    }
  }

  return null;
}

async function main() {
  await fs.mkdir(videoDir, { recursive: true });
  try {
    const { execSync } = await import('node:child_process');
    evidence.commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {}

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1365, height: 768 },
    recordVideo: { dir: videoDir, size: { width: 1365, height: 768 } },
  });
  const page = await context.newPage();

  page.on('request', request => {
    const url = request.url();
    const pathName = (() => { try { return new URL(url).pathname; } catch { return url; } })();
    const sensitive = /\/api\/(?:signup|signin|session\/token|intelligence\/connections|vault)/.test(pathName);
    network.push({
      at: new Date().toISOString(),
      type: 'request',
      method: request.method(),
      url: redactText(url),
      postData: sensitive ? '[redacted-sensitive-body]' : redactText(request.postData() || ''),
    });
  });
  page.on('response', response => {
    network.push({ at: new Date().toISOString(), type: 'response', status: response.status(), url: redactText(response.url()) });
    void panel(page, currentPanelLines.length ? currentPanelLines : ['Network active']);
  });
  page.on('console', msg => evidence.browser.console.push(redactText(`${msg.type()}: ${msg.text()}`).slice(0, 500)));
  page.on('pageerror', error => evidence.browser.pageErrors.push(redactText(error.stack || error.message).slice(0, 1000)));

  const ids = { agentId: null, workspaceId: null, projectId: null, sessionId: null, appSlug: null, skillSlug: 'text-utils' };
  const reusableAccount = reuseLatestProofAccount ? await findLatestReusableProofAccount() : null;
  let email = `agentos-proof-${runToken}@example.com`;
  let password = `ProofPass-${runToken}!9`;
  if (reusableAccount) {
    email = reusableAccount.email;
    password = reusableAccount.password;
    ids.agentId = reusableAccount.agentId;
    evidence.reusedAccount = {
      agentId: reusableAccount.agentId,
      createdAt: reusableAccount.createdAt,
      connections: reusableAccount.connections.map(item => ({
        vendor: item.vendor,
        status: item.status,
        model: item.selected_model_id,
      })),
    };
  }
  const appName = `Quick Proof App ${runToken}`;
  const primeAgentName = `Proof Prime Agent ${runToken}`;
  const primeflowName = `Proof Primeflow ${runToken}`;

  try {
    log('[>]', 'cyan', `Visible proof run ${runId}`);
    if (reusableAccount) {
      await page.goto(`${BASE_URL}/signin`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
      await panel(page, ['Task 1: Auth + Studio', 'Logging into existing proof account through UI']);
      await fillControlled(page, '#email', email);
      await fillControlled(page, '#password', password);
      await waitForSubmitEnabled(page);
      const firstSigninResponse = page.waitForResponse(response => {
        try {
          const url = new URL(response.url());
          return url.pathname === '/api/signin' && response.request().method() === 'POST';
        } catch {
          return false;
        }
      }, { timeout: 90000 });
      await page.getByRole('button', { name: 'Sign in' }).click();
      const firstSigninResult = await firstSigninResponse;
      if (firstSigninResult.status() !== 200) throw new Error(`Reusable account signin API returned ${firstSigninResult.status()}`);
      await page.waitForFunction(async () => {
        const payload = await fetch('/api/session?optional=1', { credentials: 'include' }).then(response => response.json());
        return payload.authenticated === true;
      }, null, { timeout: 30000 });

      await page.goto(`${BASE_URL}/studio?mode=nl`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitForStudio(page);
      const bootstrap = await api(page, '/api/studio/bootstrap?mode=nl', { label: 'studio-bootstrap-desktop' });
      ids.workspaceId = bootstrap.json?.workspaces?.[0]?.id ?? bootstrap.json?.currentProject?.workspaceId ?? null;
      ids.projectId = bootstrap.json?.currentProject?.id ?? bootstrap.json?.projects?.[0]?.id ?? null;
      if (!ids.workspaceId) throw new Error('Studio did not provide a workspace.');

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${BASE_URL}/studio?mode=nl`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitForStudio(page);
      await page.waitForTimeout(900);
      await page.setViewportSize({ width: 1365, height: 768 });
      await page.goto(`${BASE_URL}/studio?mode=nl`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitForStudio(page);

      const logoutResponse = page.waitForResponse(response => {
        try {
          const url = new URL(response.url());
          return url.pathname === '/api/session' && response.request().method() === 'DELETE';
        } catch {
          return false;
        }
      }, { timeout: 90000 });
      await page.getByLabel('Open account menu').click();
      await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
      const logoutResult = await logoutResponse;
      if (logoutResult.status() !== 200) throw new Error(`Logout API returned ${logoutResult.status()}`);
      await page.waitForURL(/\/signin/, { timeout: 30000 }).catch(() => undefined);
      await page.waitForTimeout(2600);
      const signedOut = await api(page, '/api/session?optional=1', { label: 'session-after-logout' });
      if (signedOut.json?.authenticated) throw new Error('Logout did not clear the browser session.');

      await page.goto(`${BASE_URL}/signin`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
      await fillControlled(page, '#email', email);
      await fillControlled(page, '#password', password);
      await waitForSubmitEnabled(page);
      const signinResponse = page.waitForResponse(response => {
        try {
          const url = new URL(response.url());
          return url.pathname === '/api/signin' && response.request().method() === 'POST';
        } catch {
          return false;
        }
      }, { timeout: 90000 });
      await page.getByRole('button', { name: 'Sign in' }).click();
      const signinResult = await signinResponse;
      if (signinResult.status() !== 200) throw new Error(`Signin API returned ${signinResult.status()}`);
      await page.waitForFunction(async () => {
        const payload = await fetch('/api/session?optional=1', { credentials: 'include' }).then(response => response.json());
        return payload.authenticated === true;
      }, null, { timeout: 30000 });
      const sessionAfterLogin = await api(page, '/api/session?optional=1', { label: 'session-after-login' });
      if (!sessionAfterLogin.json?.authenticated) throw new Error('Login did not restore authentication.');
      await page.goto(`${BASE_URL}/studio?mode=nl`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitForStudio(page);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitForStudio(page);
      const tokenResult = await api(page, '/api/session/token', { method: 'POST', label: 'issue-agent-token-for-db-correlation', sensitive: true });
      ids.agentId = decodeAgentId(tokenResult.json?.credentials?.bearerToken ?? '') ?? ids.agentId;
      task('Auth + desktop/mobile Studio', 'PASS', {
        registered: false,
        reusedExistingProofAccount: true,
        loginRestored: true,
        desktopStudioLoaded: true,
        mobileStudioLoaded: true,
        persistentAfterReload: true,
        workspaceId: ids.workspaceId,
        agentId: ids.agentId,
      });
    } else {
    await page.goto(`${BASE_URL}/signup`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
    await panel(page, ['Task 1: Auth + Studio', 'Registering a real account through UI']);
    await fillControlled(page, '#email', email);
    await fillControlled(page, '#password', password);
    await fillControlled(page, '#confirmPassword', password);
    await fillControlled(page, '#agentName', `Proof Workspace ${runToken}`);
    await page.getByRole('button', { name: 'Enterprise' }).click();
    await page.getByRole('button', { name: 'Enterprise Plus' }).click();
    await waitForSubmitEnabled(page);
    const signupResponse = page.waitForResponse(response => {
      try {
        const url = new URL(response.url());
        return url.pathname === '/api/signup' && response.request().method() === 'POST';
      } catch {
        return false;
      }
    }, { timeout: 120000 });
    await page.getByRole('button', { name: 'Create AgentOS account' }).click();
    const signupResult = await signupResponse;
    if (signupResult.status() !== 201) throw new Error(`Signup API returned ${signupResult.status()}`);
    await page.waitForFunction(async () => {
      const payload = await fetch('/api/session?optional=1', { credentials: 'include' }).then(response => response.json());
      return payload.authenticated === true;
    }, null, { timeout: 30000 });
    const sessionAfterSignup = await api(page, '/api/session?optional=1', { label: 'session-after-signup' });
    if (!sessionAfterSignup.json?.authenticated) throw new Error('Signup did not create a browser session.');

    await page.goto(`${BASE_URL}/studio?mode=nl`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitForStudio(page);
    const bootstrap = await api(page, '/api/studio/bootstrap?mode=nl', { label: 'studio-bootstrap-desktop' });
    ids.workspaceId = bootstrap.json?.workspaces?.[0]?.id ?? bootstrap.json?.currentProject?.workspaceId ?? null;
    ids.projectId = bootstrap.json?.currentProject?.id ?? bootstrap.json?.projects?.[0]?.id ?? null;
    if (!ids.workspaceId) throw new Error('Studio did not provide a workspace.');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/studio?mode=nl`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitForStudio(page);
    await page.waitForTimeout(900);
    await page.setViewportSize({ width: 1365, height: 768 });
    await page.goto(`${BASE_URL}/studio?mode=nl`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitForStudio(page);

    await page.getByLabel('Open account menu').click();
    await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
    await page.waitForTimeout(1200);
    const signedOut = await api(page, '/api/session?optional=1', { label: 'session-after-logout' });
    if (signedOut.json?.authenticated) throw new Error('Logout did not clear the browser session.');

    await page.goto(`${BASE_URL}/signin`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
    await fillControlled(page, '#email', email);
    await fillControlled(page, '#password', password);
    await waitForSubmitEnabled(page);
    const signinResponse = page.waitForResponse(response => {
      try {
        const url = new URL(response.url());
        return url.pathname === '/api/signin' && response.request().method() === 'POST';
      } catch {
        return false;
      }
    }, { timeout: 90000 });
    await page.getByRole('button', { name: 'Sign in' }).click();
    const signinResult = await signinResponse;
    if (signinResult.status() !== 200) throw new Error(`Signin API returned ${signinResult.status()}`);
    await page.waitForFunction(async () => {
      const payload = await fetch('/api/session?optional=1', { credentials: 'include' }).then(response => response.json());
      return payload.authenticated === true;
    }, null, { timeout: 30000 });
    const sessionAfterLogin = await api(page, '/api/session?optional=1', { label: 'session-after-login' });
    if (!sessionAfterLogin.json?.authenticated) throw new Error('Login did not restore authentication.');
    await page.goto(`${BASE_URL}/studio?mode=nl`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitForStudio(page);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitForStudio(page);
    const tokenResult = await api(page, '/api/session/token', { method: 'POST', label: 'issue-agent-token-for-db-correlation', sensitive: true });
    ids.agentId = decodeAgentId(tokenResult.json?.credentials?.bearerToken ?? '');
    task('Auth + desktop/mobile Studio', 'PASS', {
      registered: true,
      loginRestored: true,
      desktopStudioLoaded: true,
      mobileStudioLoaded: true,
      persistentAfterReload: true,
      workspaceId: ids.workspaceId,
      agentId: ids.agentId,
    });
    }

    if (reusableAccount) {
      const existingConnections = await api(page, `/api/intelligence/connections?workspaceId=${encodeURIComponent(ids.workspaceId)}&includeRevoked=1`, { label: 'existing-vault-connections' });
      const connections = Array.isArray(existingConnections.json?.connections) ? existingConnections.json.connections : [];
      const hasOpenAI = connections.some(item => item.vendor === 'openai' && item.status === 'active' && item.selectedModelId === 'gpt-5-mini');
      const hasAnthropic = connections.some(item => item.vendor === 'anthropic' && item.status === 'active' && item.selectedModelId === 'claude-sonnet-4-6');
      if (!hasOpenAI || !hasAnthropic) throw new Error('Reusable proof account does not have both required active Vault-backed connections.');
    } else {
      if (!openaiKey) throw new Error('OpenAI proof credential is missing from local env.');
      if (!anthropicKey) throw new Error('Anthropic proof credential is missing from local env.');
      await connectIntelligenceThroughVault(page, {
        vendor: 'openai',
        label: 'OpenAI',
        modelId: 'gpt-5-mini',
        displayName: `OpenAI proof ${runToken}`,
        credential: openaiKey,
      });
      await connectIntelligenceThroughVault(page, {
        vendor: 'anthropic',
        label: 'Anthropic',
        modelId: 'claude-sonnet-4-6',
        displayName: `Anthropic proof ${runToken}`,
        credential: anthropicKey,
      });
    }

    await page.goto(`${BASE_URL}/studio?mode=nl`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitForStudio(page);
    await selectIntelligence(page, 'OpenAI', 'gpt-5-mini');
    const research = await sendAndWait(page,
      `Research a quick app idea for AgentOS builders: a tiny deployment checklist app. Compare user need, risks, required AgentOS capabilities, and a 3-step implementation path. Proof token ${runToken}.`,
      {
        expect: /deployment|checklist|AgentOS|capabilities/i,
        panelLines: ['Task 2: Connected research', 'OpenAI / gpt-5-mini selected in composer'],
        timeout: 300000,
      });
    ids.sessionId = new URL(page.url()).searchParams.get('session');
    await selectIntelligence(page, 'Anthropic', 'claude-sonnet-4-6');
    const followup = await sendAndWait(page,
      `Use the previous answer in this same session. Return only the top three acceptance checks for the deployment checklist app. Proof token ${runToken}.`,
      {
        expect: /acceptance|check/i,
        panelLines: ['Task 2: Context follow-up', 'Anthropic / claude-sonnet-4-6 selected in composer'],
        timeout: 300000,
      });
    const streamPass = research.stream.sawStreaming && research.stream.grew;
    task('Connected research + context follow-up', streamPass ? 'PASS' : 'FAIL', {
      openaiModelSelectable: true,
      anthropicModelSelectable: true,
      visibleStreaming: research.stream,
      contextFollowupText: followup.text.slice(0, 700),
      sessionId: ids.sessionId,
    });

    await selectNative(page);
    await sendForApproval(page, `Create private app ${appName}`, /Create private app/i);
    await approve(page, { waitForUrl: /\/appstore\//, timeout: 90000 });
    ids.appSlug = new URL(page.url()).pathname.split('/').filter(Boolean).pop();
    const appVisible = await page.locator('body').innerText({ timeout: 30000 });
    await page.goto(`${BASE_URL}/studio?mode=nl&session=${encodeURIComponent(ids.sessionId ?? '')}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitForStudio(page);
    await selectNative(page);
    const paper = await sendAndWait(page,
      `Paper trade without Derek: place one sandbox buy order for BTC or a stock and return the order id. If AgentOS lacks a connected non-Derek broker, say the missing capability and do not create an order. Proof token ${runToken}.`,
      {
        expect: /missing|unsupported|broker|No order was placed|not connected|cannot/i,
        panelLines: ['Task 3: Native app creation + honest unsupported trade'],
        timeout: 120000,
      });
    const fakeOrder = /\border\s*(id|#|number)\b\s*[:#-]?\s*[A-Z0-9_-]{4,}/i.test(paper.text);
    task('Native app creation + unsupported paper trade', ids.appSlug && /Quick Proof App/i.test(appVisible) && !fakeOrder ? 'PASS' : 'FAIL', {
      appSlug: ids.appSlug,
      appVisible: /Quick Proof App/i.test(appVisible),
      paperTradeUnsupportedText: paper.text.slice(0, 800),
      fakeOrderDetected: fakeOrder,
    });

    await openStudio(page, ids.sessionId);
    await sendForApproval(page, `install app dezypher`, /deZypher|Install app/i);
    const installApp = await approve(page, { expectText: /Installed app|Installed/i, sessionId: ids.sessionId });
    await openStudio(page, ids.sessionId);
    await sendForApproval(page, `open app dezypher`, /Open app/i);
    const openApp = await approve(page, { expectText: /Opened app/i, sessionId: ids.sessionId });
    await openStudio(page, ids.sessionId);
    await sendForApproval(page, `install skill ${ids.skillSlug}`, /Install skill|Previewing install|Text Utilities/i);
    const installSkill = await approve(page, { expectText: /Installed/i, sessionId: ids.sessionId });
    await openStudio(page, ids.sessionId);
    await sendForApproval(page, `skills use ${ids.skillSlug} slugify --json {"text":"Quick App Proof ${runToken}"}`, /slugify|Quick App Proof|skills\.use/i);
    const runSkill = await approve(page, { expectText: /Executed/i, sessionId: ids.sessionId });
    await openStudio(page, ids.sessionId);
    await sendForApproval(page, `mcp call agentos mem_set --json {"key":"proof.${runToken}.mcp","value":"mcp ok ${runToken}"}`, /proof|mcp|mem_set/i);
    const mcpSet = await approve(page, { expectText: /Executed/i, sessionId: ids.sessionId });
    await openStudio(page, ids.sessionId);
    const mcpGet = await sendAndWait(page,
      `tool run agentos.mem_get --json {"key":"proof.${runToken}.mcp"}`,
      { expect: /mcp ok|Executed/i, panelLines: ['Task 4: Universal MCP verification'] });
    task('deZypher + Skill + Universal MCP', /Installed|Opened|Executed/i.test(`${installApp.text} ${openApp.text} ${installSkill.text} ${runSkill.text} ${mcpSet.text} ${mcpGet.text}`) ? 'PASS' : 'FAIL', {
      dezypherInstall: installApp.text.slice(0, 300),
      dezypherOpen: openApp.text.slice(0, 300),
      skillInstall: installSkill.text.slice(0, 300),
      skillRun: runSkill.text.slice(0, 500),
      mcpSet: mcpSet.text.slice(0, 400),
      mcpGet: mcpGet.text.slice(0, 500),
    });

    await openStudio(page, ids.sessionId);
    await sendForApproval(page, `Create Prime Agent ${primeAgentName}`, /Create Prime Agent/i);
    await approve(page, { timeout: 90000 });
    await page.goto(`${BASE_URL}/studio?mode=nl&session=${encodeURIComponent(ids.sessionId ?? '')}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitForStudio(page);
    await sendForApproval(page, `Run Prime Agent ${primeAgentName} with tools list`, /Run Prime Agent/i);
    const runPrimeAgent = await approve(page, { expectText: /Prime Agent|Loaded|tools/i, timeout: 120000, sessionId: ids.sessionId });
    await sendForApproval(page, `Create Primeflow ${primeflowName}`, /Create a native AgentOS Primeflow|Create Primeflow/i);
    const createPrimeflow = await approve(page, { expectText: /Primeflow|Done/i, timeout: 120000, sessionId: ids.sessionId });
    await sendForApproval(page, `Run Primeflow ${primeflowName}`, /Run Primeflow/i);
    const runPrimeflow = await approve(page, { expectText: /Ran Primeflow|Done/i, timeout: 120000, sessionId: ids.sessionId });
    const executions = await api(page, `/api/executions?workspaceId=${encodeURIComponent(ids.workspaceId)}&limit=20`, { label: 'executions-after-primeflow' });
    const executionId = executions.json?.executions?.find?.(item => `${item.title ?? ''}`.includes('Primeflow') || item.sourceType === 'workflow' || item.source_type === 'workflow')?.id
      ?? executions.json?.items?.find?.(item => `${item.title ?? ''}`.includes('Primeflow') || item.sourceType === 'workflow' || item.source_type === 'workflow')?.id
      ?? null;
    await sendForApproval(page, `Pause Primeflow ${primeflowName}`, /Pause Primeflow/i);
    const pausePrimeflow = await approve(page, { expectText: /Paused Primeflow|Done/i, timeout: 120000, sessionId: ids.sessionId });
    await sendForApproval(page, `Resume Primeflow ${primeflowName}`, /Resume Primeflow/i);
    const resumePrimeflow = await approve(page, { expectText: /Resumed Primeflow|Done/i, timeout: 120000, sessionId: ids.sessionId });
    let retryPrimeflow = { text: '' };
    if (executionId) {
      await sendForApproval(page, `Retry execution ${executionId}`, /Retry execution/i);
      retryPrimeflow = await approve(page, { expectText: /retry|completed|Done/i, timeout: 120000, sessionId: ids.sessionId });
    }
    await sendForApproval(page, `Delete Primeflow ${primeflowName}`, /Delete Primeflow/i);
    const deletePrimeflow = await approve(page, { expectText: /Deleted Primeflow|Done/i, timeout: 120000, sessionId: ids.sessionId });
    task('Prime Agent + Primeflow lifecycle', executionId ? 'PASS' : 'FAIL', {
      primeAgentRun: runPrimeAgent.text.slice(0, 500),
      createPrimeflow: createPrimeflow.text.slice(0, 400),
      runPrimeflow: runPrimeflow.text.slice(0, 400),
      executionId,
      pausePrimeflow: pausePrimeflow.text.slice(0, 300),
      resumePrimeflow: resumePrimeflow.text.slice(0, 300),
      retryPrimeflow: retryPrimeflow.text.slice(0, 300),
      deletePrimeflow: deletePrimeflow.text.slice(0, 300),
    });

    evidence.backend = {
      connections: (await api(page, `/api/intelligence/connections?workspaceId=${encodeURIComponent(ids.workspaceId)}&includeRevoked=1`, { label: 'postrun-connections' })).json,
      apps: (await api(page, `/api/apps?mine=1&search=${encodeURIComponent(runToken)}`, { label: 'postrun-apps' })).json,
      skills: (await api(page, `/api/skills?mine=1&search=${encodeURIComponent(runToken)}`, { label: 'postrun-skills' })).json,
      primeAgents: (await api(page, `/api/subagents?workspaceId=${encodeURIComponent(ids.workspaceId)}`, { label: 'postrun-prime-agents' })).json,
      primeflows: (await api(page, `/api/agent/workflows?workspaceId=${encodeURIComponent(ids.workspaceId)}`, { label: 'postrun-primeflows' })).json,
      executions: (await api(page, `/api/executions?workspaceId=${encodeURIComponent(ids.workspaceId)}&limit=50`, { label: 'postrun-executions' })).json,
      memory: (await api(page, `/api/memory?workspaceId=${encodeURIComponent(ids.workspaceId)}&search=${encodeURIComponent(runToken)}&limit=20`, { label: 'postrun-memory' })).json,
    };
    await dbVerify(ids);
    evidence.completedAt = new Date().toISOString();
    evidence.overall = evidence.tasks.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL';
    await panel(page, [
      'Super AgentOS visible production proof complete',
      `overall ${evidence.overall}`,
      ...evidence.tasks.map(item => `${item.status}: ${item.name}`),
    ]);
    await page.waitForTimeout(2500);
  } catch (error) {
    evidence.completedAt = new Date().toISOString();
    evidence.overall = 'FAIL';
    evidence.fatal = redactText(error instanceof Error ? error.stack || error.message : String(error));
    task('Runner fatal error', 'FAIL', { error: evidence.fatal });
    await panel(page, ['Visible production proof failed', evidence.fatal.slice(0, 600)]).catch(() => undefined);
    await page.waitForTimeout(2500).catch(() => undefined);
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    for (const file of await fs.readdir(videoDir).catch(() => [])) {
      if (file.endsWith('.webm')) evidence.videos.push(path.join(videoDir, file));
    }
    await saveJson('network.json', network);
    await saveJson('proof.json', evidence);
    await saveJson('final-verdict.json', {
      overall: evidence.overall,
      tasks: evidence.tasks.map(({ name, status }) => ({ name, status })),
      artifactsRoot: root,
      videos: evidence.videos,
      dbStatus: evidence.db.status,
      completedAt: evidence.completedAt,
    });
    await fs.writeFile(path.join(root, 'summary.md'), [
      `# Super AgentOS Visible Production Proof ${runId}`,
      '',
      `Base URL: ${BASE_URL}`,
      `Commit: ${evidence.commit ?? 'unknown'}`,
      `Overall: ${evidence.overall}`,
      '',
      ...evidence.tasks.map(item => `- ${item.status}: ${item.name}`),
      '',
      `Video: ${evidence.videos.join(', ') || 'not found'}`,
      `Network log: ${path.join(root, 'network.json')}`,
      `DB verification: ${evidence.db.status}`,
      '',
    ].join('\n'), 'utf8');
    log(evidence.overall === 'PASS' ? '[OK]' : '[FAIL]', evidence.overall === 'PASS' ? 'green' : 'red', `overall ${evidence.overall}`);
    log('[i]', 'cyan', root);
  }
}

await main();
