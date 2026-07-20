import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), 'utf8');
}

describe('Phase 37 Vault permission flow', () => {
  it('exposes grant, deny, and revoke controls in the Vault UI', () => {
    const page = source('components/pages/VaultPage.tsx');

    expect(page).toContain('Request permission');
    expect(page).toContain('Grant permission');
    expect(page).toContain('Deny');
    expect(page).toContain('Revoke grant');
    expect(page).toContain('temporary runtime grant');
    expect(page).toContain('Plaintext can be consumed by an authorized SDK runtime and is never shown in this UI.');
  });

  it('supports runtime deny and cleanup through the browser Vault access route', () => {
    const route = source('app/api/vault/access/route.ts');
    const service = source('src/vault/service.ts');

    expect(route).toContain("action === 'deny'");
    expect(route).toContain("action === 'cleanup'");
    expect(route).toContain('recordRuntimeSecretAccessDenied');
    expect(route).toContain('cleanupRuntimeSecretGrant');
    expect(service).toContain('export async function recordRuntimeSecretAccessDenied');
    expect(service).toContain("action: 'runtime_access_denied'");
    expect(service).toContain("type: 'secret_access_denied'");
  });

  it('documents temporary grants without exposing secret values', () => {
    const docs = source('docs/vault.md');

    expect(docs).toContain('grant temporary runtime access without showing the plaintext value');
    expect(docs).toContain('deny runtime access with an audit record');
    expect(docs).toContain('revoke a temporary runtime grant before it is consumed');
    expect(docs).toContain('returns a temporary grant id, not the secret value');
  });
});
