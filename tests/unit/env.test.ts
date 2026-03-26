import { beforeEach, describe, expect, it } from 'vitest';
import {
  getConsensusDefaultThreshold,
  getConsensusWaitMs,
  getPublicAppUrl,
  getSocialTokenEncryptionKey,
  getSupabaseServiceRoleKey,
  getXOAuthScopes,
  getXRedirectUri,
  getXTokenEncryptionKey,
  hasGoogleOAuthConfig,
  hasMetaOAuthConfig,
  hasTelegramBotConfig,
  hasXOAuthConfig,
  isFfpEnabled,
} from '../../src/config/env.js';
import { ValidationError } from '../../src/utils/errors.js';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
});

describe('env helpers', () => {
  it('prefers NEXT_PUBLIC_APP_URL for the public app URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://agentos-app.vercel.app';
    process.env.NEXT_PUBLIC_API_URL = 'https://legacy.example.com';
    expect(getPublicAppUrl()).toBe('https://agentos-app.vercel.app');
  });

  it('falls back to the legacy Supabase service key alias', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_KEY = 'legacy-service-key';
    expect(getSupabaseServiceRoleKey()).toBe('legacy-service-key');
  });

  it('parses consensus wait and threshold values', () => {
    process.env.MCP_CONSENSUS_WAIT_MS = '4500';
    process.env.MCP_CONSENSUS_DEFAULT_THRESHOLD = '0.8';
    expect(getConsensusWaitMs()).toBe(4500);
    expect(getConsensusDefaultThreshold()).toBe(0.8);
  });

  it('rejects invalid consensus wait values', () => {
    process.env.MCP_CONSENSUS_WAIT_MS = '0';
    expect(() => getConsensusWaitMs()).toThrow(ValidationError);
  });

  it('rejects invalid consensus thresholds', () => {
    process.env.MCP_CONSENSUS_DEFAULT_THRESHOLD = '1.5';
    expect(() => getConsensusDefaultThreshold()).toThrow(ValidationError);
  });

  it('uses the shared social token key when present', () => {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = 'shared-social-key';
    process.env.X_TOKEN_ENCRYPTION_KEY = 'legacy-x-key';

    expect(getSocialTokenEncryptionKey()).toBe('shared-social-key');
    expect(getXTokenEncryptionKey()).toBe('shared-social-key');
  });

  it('falls back to the legacy X token key for shared secret encryption', () => {
    delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
    process.env.X_TOKEN_ENCRYPTION_KEY = 'legacy-x-key';

    expect(getSocialTokenEncryptionKey()).toBe('legacy-x-key');
  });

  it('reads X OAuth settings and splits scopes', () => {
    process.env.X_CLIENT_ID = 'test-x-client-id';
    process.env.X_REDIRECT_URI = 'https://agentos-app.vercel.app/api/x/callback';
    process.env.X_OAUTH_SCOPES = 'tweet.read,tweet.write users.read';

    expect(getXRedirectUri()).toBe('https://agentos-app.vercel.app/api/x/callback');
    expect(hasXOAuthConfig()).toBe(true);
    expect(getXOAuthScopes()).toEqual(['tweet.read', 'tweet.write', 'users.read']);
  });

  it('reports readiness for Meta, Telegram, and Google social providers', () => {
    process.env.META_APP_ID = 'meta-app-id';
    process.env.META_APP_SECRET = 'meta-app-secret';
    process.env.META_REDIRECT_URI = 'https://agentos-app.vercel.app/api/meta/callback';
    process.env.TELEGRAM_BOT_TOKEN = 'telegram-bot-token';
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
    process.env.GOOGLE_REDIRECT_URI = 'https://agentos-app.vercel.app/api/youtube/callback';

    expect(hasMetaOAuthConfig()).toBe(true);
    expect(hasTelegramBotConfig()).toBe(true);
    expect(hasGoogleOAuthConfig()).toBe(true);
  });

  it('reports FFP mode from the environment', () => {
    process.env.FFP_MODE = 'enabled';
    expect(isFfpEnabled()).toBe(true);
    process.env.FFP_MODE = 'disabled';
    expect(isFfpEnabled()).toBe(false);
  });
});
