import { ValidationError } from '../utils/errors.js';

const DEFAULT_APP_URL = 'https://agentos-app.vercel.app';

function getEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function requireEnv(label: string, ...keys: string[]): string {
  const value = getEnv(...keys);
  if (!value) {
    throw new Error(`${label} environment variable is required (${keys.join(' or ')})`);
  }
  return value;
}

export function getPublicAppUrl(): string {
  return getEnv('NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_API_URL') ?? DEFAULT_APP_URL;
}

export function getSupabaseUrl(): string {
  return requireEnv('Supabase URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
}

export function getSupabaseServiceRoleKey(): string {
  return requireEnv('Supabase service role key', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY');
}

export function getAdminToken(): string {
  return requireEnv('Admin token', 'ADMIN_TOKEN');
}

export function getCronSecret(): string | undefined {
  return getEnv('CRON_SECRET');
}

export function getConsensusWaitMs(): number {
  const raw = getEnv('MCP_CONSENSUS_WAIT_MS');
  if (!raw) return 3000;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ValidationError('MCP_CONSENSUS_WAIT_MS must be a positive integer');
  }
  return parsed;
}

export function getConsensusDefaultThreshold(): number {
  const raw = getEnv('MCP_CONSENSUS_DEFAULT_THRESHOLD');
  if (!raw) return 0.67;

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new ValidationError('MCP_CONSENSUS_DEFAULT_THRESHOLD must be between 0 and 1');
  }
  return parsed;
}

export function isFfpEnabled(): boolean {
  return getEnv('FFP_MODE') === 'enabled';
}
