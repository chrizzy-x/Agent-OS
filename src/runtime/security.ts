import { lookup } from 'dns/promises';
import { SecurityError } from '../utils/errors.js';
import { sanitizePath } from '../utils/validation.js';

// RFC1918 private address ranges and other blocked IP prefixes
const BLOCKED_IP_PREFIXES = [
  '10.',
  '172.16.', '172.17.', '172.18.', '172.19.',
  '172.20.', '172.21.', '172.22.', '172.23.',
  '172.24.', '172.25.', '172.26.', '172.27.',
  '172.28.', '172.29.', '172.30.', '172.31.',
  '192.168.',
  '127.',
  '169.254.',  // Link-local / AWS EC2 metadata
  '100.64.',   // Shared address space (RFC 6598)
  '::1',       // IPv6 loopback
  'fc00:',     // IPv6 unique local
  'fe80:',     // IPv6 link-local
];

// Cloud provider metadata endpoints that must always be blocked
const BLOCKED_HOSTNAMES = [
  'metadata.google.internal',
  'metadata.internal',
  'instance-data',
];

// Verify that a URL's hostname does not resolve to a private/internal IP address.
// This prevents SSRF attacks where agents craft URLs pointing at cloud metadata or internal services.
export async function checkSsrf(url: string): Promise<void> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new SecurityError(`Invalid URL: ${url}`);
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Block by hostname
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    throw new SecurityError(`Access to ${hostname} is not permitted`);
  }

  // Block if the URL is not HTTPS (only allow secure connections to external services)
  if (parsedUrl.protocol !== 'https:') {
    throw new SecurityError(`Only HTTPS URLs are permitted, got: ${parsedUrl.protocol}`);
  }

  // Resolve hostname to IPs and check each one
  let addresses: string[];
  try {
    const results = await lookup(hostname, { all: true });
    addresses = results.map(r => r.address);
  } catch {
    throw new SecurityError(`Failed to resolve hostname: ${hostname}`);
  }

  for (const addr of addresses) {
    for (const prefix of BLOCKED_IP_PREFIXES) {
      if (addr.startsWith(prefix)) {
        throw new SecurityError(`Resolved IP ${addr} is in a blocked range`);
      }
    }
  }
}

// Verify that a domain is in the agent's allowlist or the global allowlist.
export function checkDomainAllowed(url: string, agentAllowedDomains: string[]): void {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new SecurityError(`Invalid URL: ${url}`);
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Build combined allowlist from global env + agent-specific domains
  const globalDomains = (process.env.ALLOWED_DOMAINS ?? '')
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);

  const allowed = new Set([...globalDomains, ...agentAllowedDomains.map(d => d.toLowerCase())]);

  if (allowed.has('*')) {
    return;
  }

  // If no allowlist is configured, allow all external domains (SSRF protection above handles private IPs)
  if (allowed.size === 0) {
    return;
  }

  // Check if hostname matches any allowed domain (exact or subdomain)
  const isAllowed = [...allowed].some(domain => {
    return hostname === domain || hostname.endsWith(`.${domain}`);
  });

  if (!isAllowed) {
    throw new SecurityError(`Domain ${hostname} is not in the allowed list`);
  }
}

// Validate that a filesystem path does not escape the agent's namespace.
// Returns the sanitized path component (without agent prefix).
export function checkFilePath(path: string): string {
  return sanitizePath(path);
}

// Validate that an agent-scoped DB table name is safe to use.
// Prevents accessing system schemas or other agents' schemas.
export function checkTableName(agentId: string, table: string): string {
  // Sanitize agentId to create valid schema name
  const schemaName = `agent_${agentId.replace(/[^a-zA-Z0-9_]/g, '_')}`;

  // Table must only contain alphanumeric chars and underscores
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(table)) {
    throw new SecurityError(`Invalid table name: ${table}`);
  }

  // Block access to system schemas
  const blockedSchemas = ['public', 'pg_catalog', 'information_schema', 'pg_toast'];
  if (blockedSchemas.includes(table.toLowerCase())) {
    throw new SecurityError(`Access to system table ${table} is not permitted`);
  }

  return `${schemaName}.${table}`;
}

// Validate SQL for obvious injection patterns when building parameterized queries.
// This is defense-in-depth — parameterized queries are the primary protection.
export function checkSqlSafety(sql: string): void {
  // Block SQL that references system schemas directly
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

