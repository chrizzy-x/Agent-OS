import { ValidationError } from '../utils/errors.js';

const DEFAULT_APP_URL = 'https://agentos-app.vercel.app';
const DEFAULT_X_OAUTH_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

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

export function getXClientId(): string {
  return requireEnv('X client ID', 'X_CLIENT_ID');
}

export function getXClientSecret(): string | undefined {
  return getEnv('X_CLIENT_SECRET');
}

export function getXRedirectUri(): string {
  return requireEnv('X redirect URI', 'X_REDIRECT_URI');
}

export function getSocialTokenEncryptionKey(): string {
  return requireEnv('Social token encryption key', 'SOCIAL_TOKEN_ENCRYPTION_KEY', 'X_TOKEN_ENCRYPTION_KEY');
}

export function getXTokenEncryptionKey(): string {
  return getSocialTokenEncryptionKey();
}

export function hasXOAuthConfig(): boolean {
  return Boolean(getEnv('X_CLIENT_ID') && getEnv('X_REDIRECT_URI'));
}

export function getMetaAppId(): string | undefined {
  return getEnv('META_APP_ID');
}

export function getMetaAppSecret(): string | undefined {
  return getEnv('META_APP_SECRET');
}

export function getMetaRedirectUri(): string | undefined {
  return getEnv('META_REDIRECT_URI');
}

export function hasMetaOAuthConfig(): boolean {
  return Boolean(getMetaAppId() && getMetaAppSecret() && getMetaRedirectUri());
}

export function getTelegramBotToken(): string | undefined {
  return getEnv('TELEGRAM_BOT_TOKEN');
}

export function getTelegramBotUsername(): string | undefined {
  return getEnv('TELEGRAM_BOT_USERNAME');
}

export function hasTelegramBotConfig(): boolean {
  return Boolean(getTelegramBotToken());
}

export function getGoogleClientId(): string | undefined {
  return getEnv('GOOGLE_CLIENT_ID');
}

export function getGoogleClientSecret(): string | undefined {
  return getEnv('GOOGLE_CLIENT_SECRET');
}

export function getGoogleRedirectUri(): string | undefined {
  return getEnv('GOOGLE_REDIRECT_URI');
}

export function hasGoogleOAuthConfig(): boolean {
  return Boolean(getGoogleClientId() && getGoogleClientSecret() && getGoogleRedirectUri());
}

export function getXOAuthScopes(): string[] {
  const raw = getEnv('X_OAUTH_SCOPES');
  if (!raw) return [...DEFAULT_X_OAUTH_SCOPES];

  const scopes = raw
    .split(/[\s,]+/)
    .map(scope => scope.trim())
    .filter(Boolean);

  if (scopes.length === 0) {
    throw new ValidationError('X_OAUTH_SCOPES must contain at least one scope');
  }

  return scopes;
}

export function isFfpEnabled(): boolean {
  return getEnv('FFP_MODE') === 'enabled';
}
