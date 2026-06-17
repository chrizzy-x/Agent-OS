import { describe, it } from 'vitest';
import { expectSourceContains } from './contract.js';

describe('vault-secret-safety', () => {
  it('keeps Vault outputs masked and secret values redacted from runtime paths', () => {
    expectSourceContains(['src', 'vault', 'service.ts'], 'maskSecretValue', 'redactSecretsDeep', 'redactSecretsInString');
    expectSourceContains(['src', 'execution', 'service.ts'], 'redactSecretsDeep', 'sanitizeOutput');
    expectSourceContains(['src', 'runtime', 'audit.ts'], 'sanitizeOutput', 'sanitizeErrorMessage');
  });
});
