import { describe, it } from 'vitest';
import { expectRoute, expectSourceContains } from './contract.js';

describe('mcp-lifecycle', () => {
  it('keeps Universal MCP execution observable and health states canonical', () => {
    expectRoute('app', 'api', 'mcp', 'route.ts');
    expectRoute('app', 'api', 'mcp', 'execute', 'route.ts');
    expectSourceContains(['src', 'execution', 'service.ts'], 'MCP_EXECUTION');
    expectSourceContains(['components', 'os', 'application-shell.tsx'], 'Universal MCP', 'FFP');
    expectSourceContains(['components', 'pages', 'McpDiagnosticsPage.tsx'], 'Connected Agents', 'Connected Services', 'Connected Tools', 'External MCP Registry');
  });
});
