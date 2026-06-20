import { describe, it } from 'vitest';
import { expectRoute, expectSourceContains } from './contract.js';

describe('connector-lifecycle', () => {
  it('keeps MCP execution observable while exposing user-facing Connectors in Library', () => {
    expectRoute('app', 'api', 'mcp', 'route.ts');
    expectRoute('app', 'api', 'mcp', 'execute', 'route.ts');
    expectSourceContains(['src', 'execution', 'service.ts'], 'MCP_EXECUTION');
    expectSourceContains(['components', 'os', 'application-shell.tsx'], 'Library', 'FFP');
    expectSourceContains(['components', 'pages', 'LibraryPage.tsx'], 'Connectors', 'Configure', 'Reconnect', 'Disable');
  });
});
