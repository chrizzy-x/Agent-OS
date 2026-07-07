import { describe, it } from 'vitest';
import { expectRoute, expectSourceContains } from './contract.js';
import { getProductSurfaceById } from '../../src/product/surfaces.js';

describe('mcp-lifecycle', () => {
  it('keeps Universal MCP execution observable and health states canonical', () => {
    expectRoute('app', 'api', 'mcp', 'route.ts');
    expectRoute('app', 'api', 'mcp', 'execute', 'route.ts');
    expectSourceContains(['src', 'execution', 'service.ts'], 'MCP_EXECUTION');
    expectSourceContains(['components', 'os', 'application-shell.tsx'], 'NAVIGATION_SURFACES');
    expect(getProductSurfaceById('universal-mcp')).toMatchObject({ label: 'Universal MCP', href: '/mcp' });
    expect(getProductSurfaceById('ffp')).toMatchObject({ label: 'FFP', status: 'coming_soon' });
    expectSourceContains(['components', 'pages', 'McpDiagnosticsPage.tsx'], 'Connected Agents', 'Connected Services', 'Connected Tools', 'External MCP Registry');
  });
});
