import { describe, it } from 'vitest';
import { expectMigrationContains, expectSourceContains } from './contract.js';

describe('external-connection-token', () => {
  it('keeps external agents/tools on Bearer Token or MCP boundaries, not SDK app discovery', () => {
    expectMigrationContains('EXTERNAL_CONNECTION_EXECUTION', 'external_connection');
    expectSourceContains(['src', 'auth', 'bearer-tokens.ts'], 'external_agent', 'mcp_connector');
    expectSourceContains(['src', 'appstore', 'catalog.ts'], "export type AgentAppSource = 'internal' | 'external_sdk'");
  });
});
