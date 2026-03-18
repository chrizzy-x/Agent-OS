import { describe, expect, it } from 'vitest';
import { buildSandboxEnv } from '../../src/runtime/sandbox.js';

describe('sandbox environment', () => {
  it('strips server secrets from child process environment', () => {
    process.env.ADMIN_TOKEN = 'top-secret-admin';
    process.env.SUPABASE_SERVICE_KEY = 'top-secret-service';
    process.env.JWT_SECRET = 'top-secret-jwt';
    process.env.PATH = process.env.PATH ?? 'C:\\Windows\\System32';

    const env = buildSandboxEnv('C:/tmp/agent-sandbox');

    expect(env.ADMIN_TOKEN).toBeUndefined();
    expect(env.SUPABASE_SERVICE_KEY).toBeUndefined();
    expect(env.JWT_SECRET).toBeUndefined();
    expect(env.PATH).toBeTruthy();
    expect(env.HOME).toBe('C:/tmp/agent-sandbox');
  });
});
