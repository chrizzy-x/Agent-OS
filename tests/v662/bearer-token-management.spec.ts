import { describe, it } from 'vitest';
import { expectMigrationContains, expectRoute, expectSourceContains } from './contract.js';

describe('bearer-token-management', () => {
  it('supports named scoped bearer tokens with one-time reveal, rotation, revocation, and last-used state', () => {
    expectRoute('app', 'api', 'bearer-tokens', 'route.ts');
    expectMigrationContains('CREATE TABLE IF NOT EXISTS bearer_tokens', 'token_hash', 'masked_token', 'last_used_at', 'rotated_at', 'revoked_at');
    expectSourceContains(['src', 'auth', 'bearer-tokens.ts'], 'oneTimeToken', 'rotate', 'revoke', 'maskedToken');
    expectSourceContains(['src', 'auth', 'agent-identity.ts'], 'bearerTokenId', 'last_used_at');
  });
});
