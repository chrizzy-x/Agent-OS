import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('phase 45 panic button production contract', () => {
  it('keeps panic control visible with an honest backend-unavailable state', () => {
    const source = read('components/os/PanicButton.tsx');

    expect(source).toContain('fallbackStatus');
    expect(source).toContain('available: false');
    expect(source).toContain('Panic backend is unavailable. Refresh sign-in and workspace access, then retry.');
    expect(source).toContain('Current function: Panic pauses or stops active executions scoped to the active workspace/session.');
  });

  it('disables destructive panic actions when no active execution can be controlled', () => {
    const source = read('components/os/PanicButton.tsx');

    expect(source).toContain('panicActionDisabledReason');
    expect(source).toContain('No active executions in this workspace/session.');
    expect(source).toContain('disabled={Boolean(disabledReason)}');
    expect(source).toContain('disabledReason={disabledReason}');
  });

  it('does not poll session refresh from public auth routes', () => {
    const panicSource = read('components/os/PanicButton.tsx');
    const guardSource = read('components/os/BrowserSessionFetchGuard.tsx');

    expect(panicSource).toContain('PANIC_EXCLUDED_PREFIXES');
    expect(panicSource).toContain("'/signin'");
    expect(panicSource).toContain('if (excluded || !status) return null;');
    expect(guardSource).toContain('SESSION_REFRESH_EXCLUDED_PREFIXES');
    expect(guardSource).toContain('isRefreshExcludedPath()');
  });

  it('documents the panic scope without overclaiming external control', () => {
    const docs = read('docs/panic-control.md');

    expect(docs).toContain('Lockdown');
    expect(docs).toContain('disables MCP runtime access and Vault runtime grants until re-authentication');
    expect(docs).toContain('does not claim to stop unavailable external systems');
    expect(docs).toContain('Secrets are never displayed in Panic Control');
  });
});
