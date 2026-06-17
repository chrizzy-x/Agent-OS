import { describe, it } from 'vitest';
import { expectRoute, expectSourceContains } from './contract.js';

describe('mcp-lifecycle', () => {
  it('keeps Universal MCP execution observable and health states canonical', () => {
    expectRoute('app', 'api', 'mcp', 'route.ts');
    expectRoute('app', 'api', 'mcp', 'execute', 'route.ts');
    expectSourceContains(['src', 'execution', 'service.ts'], 'MCP_EXECUTION');
    expectSourceContains(['components', 'os', 'workspace-shell.tsx'], 'Universal MCP', 'FFP (temp)');
  });
});
