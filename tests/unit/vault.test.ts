import { describe, expect, it } from 'vitest';
import { decryptVaultSecret, encryptVaultSecret, maskSecretValue, redactSecretsDeep } from '../../src/vault/service.js';

process.env.VAULT_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('Vault security helpers', () => {
  it('encrypts at rest and decrypts only inside runtime helpers', () => {
    const plaintext = 'sk-live-secret-value';
    const encrypted = encryptVaultSecret(plaintext);

    expect(encrypted).not.toContain(plaintext);
    expect(encrypted).toMatch(/^v1:/);
    expect(decryptVaultSecret(encrypted)).toBe(plaintext);
  });

  it('masks metadata without exposing plaintext', () => {
    const masked = maskSecretValue('sk-live-secret-value');
    expect(masked).not.toContain('sk-live-secret');
    expect(masked.endsWith('alue')).toBe(true);
  });

  it('redacts nested secret-shaped values from logs and events', () => {
    const redacted = redactSecretsDeep({
      token: 'abc',
      nested: {
        api_key: 'def',
        visible: 'ok',
        accessToken: 'ghi',
      },
    });

    expect(redacted).toEqual({
      token: '[redacted]',
      nested: {
        api_key: '[redacted]',
        visible: 'ok',
        accessToken: '[redacted]',
      },
    });
  });
});
