import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), 'utf8');
}

describe('Phase 38 Universal MCP core', () => {
  it('exposes connector lifecycle, health, logs, and disabled unsupported actions', () => {
    const page = source('components/pages/McpDiagnosticsPage.tsx');

    expect(page).toContain('Connect external MCP tool');
    expect(page).toContain('Permission review');
    expect(page).toContain('Supported actions');
    expect(page).toContain('Recent MCP Logs');
    expect(page).toContain('Check health');
    expect(page).toContain('Disconnect');
    expect(page).toContain('MCP server registration backend is not available');
    expect(page).toContain('Disconnect/revoke requires the MCP connection management backend.');
  });

  it('keeps Universal MCP separate from SDK Appstore apps', () => {
    const page = source('components/pages/McpDiagnosticsPage.tsx');
    const docs = source('docs/universal-mcp.md');

    expect(page).toContain('Universal MCP connects external tools and agents.');
    expect(page).toContain('SDK apps are registered, verified, listed, installed, and monetized through the Appstore path.');
    expect(docs).toContain('without turning them into Appstore apps');
    expect(docs).toContain('SDK apps and MCP connectors are separate product layers');
  });

  it('documents honest data boundaries', () => {
    const docs = source('docs/universal-mcp.md');

    expect(docs).toContain('must not show fake connectors');
    expect(docs).toContain('fake logs');
    expect(docs).toContain('fake health checks');
    expect(docs).toContain('Empty states explain when real connector data does not exist.');
  });
});
