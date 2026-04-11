import { lookup } from 'dns/promises';
import { SecurityError } from '../utils/errors.js';
import { sanitizePath } from '../utils/validation.js';

const BLOCKED_IP_PREFIXES = [
  '10.',
  '172.16.', '172.17.', '172.18.', '172.19.',
  '172.20.', '172.21.', '172.22.', '172.23.',
  '172.24.', '172.25.', '172.26.', '172.27.',
  '172.28.', '172.29.', '172.30.', '172.31.',
  '192.168.',
  '127.',
  '169.254.',
  '100.64.',
  '::1',
  'fc00:',
  'fd00:',
  'fe80:',
];

const BLOCKED_HOSTNAMES = [
  'localhost',
  'metadata.google.internal',
  'metadata.internal',
  'instance-data',
];

function ssrfError(reason: string): SecurityError {
  return new SecurityError(`SSRF blocked: ${reason}`);
}

export async function checkSsrf(url: string): Promise<void> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw ssrfError(`invalid URL '${url}'`);
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    throw ssrfError(`hostname ${hostname} is not permitted`);
  }

  if (parsedUrl.protocol !== 'https:') {
    throw ssrfError(`only HTTPS URLs are permitted, got ${parsedUrl.protocol}`);
  }

  let addresses: string[] = [];
  try {
    const results = await lookup(hostname, { all: true });
    addresses = results.map(result => result.address);
  } catch {
    throw ssrfError(`failed to resolve hostname ${hostname}`);
  }

  for (const address of addresses) {
    for (const prefix of BLOCKED_IP_PREFIXES) {
      if (address.startsWith(prefix)) {
        throw ssrfError(`resolved IP ${address} is in a blocked range`);
      }
    }
  }
}

export function checkDomainAllowed(url: string, agentAllowedDomains: string[]): void {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new SecurityError(`Invalid URL: ${url}`);
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const globalDomains = (process.env.ALLOWED_DOMAINS ?? '')
    .split(',')
    .map(domain => domain.trim().toLowerCase())
    .filter(Boolean);

  const allowed = new Set([...globalDomains, ...agentAllowedDomains.map(domain => domain.toLowerCase())]);

  if (allowed.has('*') || allowed.size === 0) {
    return;
  }

  const isAllowed = [...allowed].some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
  if (!isAllowed) {
    throw new SecurityError(`Domain ${hostname} is not in the allowed list`);
  }
}

export function checkFilePath(path: string): string {
  return sanitizePath(path);
}

export function checkTableName(agentId: string, table: string): string {
  const schemaName = `agent_${agentId.replace(/[^a-zA-Z0-9_]/g, '_')}`;

  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(table)) {
    throw new SecurityError(`Invalid table name: ${table}`);
  }

  const blockedSchemas = ['public', 'pg_catalog', 'information_schema', 'pg_toast'];
  if (blockedSchemas.includes(table.toLowerCase())) {
    throw new SecurityError(`Access to system table ${table} is not permitted`);
  }

  return `${schemaName}.${table}`;
}

export function checkSqlSafety(sql: string): void {
  const blockedPatterns = [
    /\bpg_catalog\b/i,
    /\binformation_schema\b/i,
    /\bpg_shadow\b/i,
    /\bpg_authid\b/i,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(sql)) {
      throw new SecurityError('SQL references restricted system catalog');
    }
  }
}