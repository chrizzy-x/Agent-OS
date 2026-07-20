import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), 'utf8');
}

describe('Phase 36 Vault core secret management', () => {
  it('exposes lifecycle controls without revealing plaintext values', () => {
    const page = source('components/pages/VaultPage.tsx');

    expect(page).toContain('Create secret');
    expect(page).toContain('Edit label');
    expect(page).toContain('Rotate');
    expect(page).toContain('Revoke access');
    expect(page).toContain('Delete secret');
    expect(page).toContain('Masked value');
    expect(page).toContain('type="password"');
    expect(page).toContain('Provider-specific secret tests are not connected yet.');
  });

  it('supports rename through the Vault API and service audit path', () => {
    const route = source('app/api/vault/route.ts');
    const service = source('src/vault/service.ts');

    expect(route).toContain("action === 'rename'");
    expect(route).toContain('renameVaultSecret');
    expect(service).toContain('export async function renameVaultSecret');
    expect(service).toContain("action: 'secret_renamed'");
    expect(service).toContain('Secret name must be 2-120 uppercase letters');
  });

  it('documents Vault as separate from memory and fake test claims', () => {
    const docs = source('docs/vault.md');

    expect(docs).toContain('keeps credentials separate from memory');
    expect(docs).toContain('provider-specific test actions disabled');
    expect(docs).toContain('runtime logs must never include plaintext secrets');
    expect(docs).toContain('the value remains inside Vault');
  });
});
