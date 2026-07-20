import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Phase 39 Super AgentOS MCP routing', () => {
  it('detects natural-language MCP routing and resolves real connectors before previewing', () => {
    const route = source('app/api/studio/intent/route.ts');

    expect(route).toContain("kind: 'app' | 'skill' | 'workflow' | 'mcp'");
    expect(route).toContain('resolveMcpRoutePreview');
    expect(route).toContain(".from('mcp_servers')");
    expect(route).toContain(".eq('active', true)");
    expect(route).toContain('MCP route preview: Super AgentOS can route this through');
    expect(route).toContain('permissionRequired');
  });

  it('shows reconnect instead of pretending unavailable MCP actions ran', () => {
    const route = source('app/api/studio/intent/route.ts');

    expect(route).toContain('MCP routing unavailable: no connected MCP tool matched');
    expect(route).toContain('Open Universal MCP to reconnect or register the external tool before running this action.');
    expect(route).toContain("state: 'reconnect_required'");
    expect(route).toContain('reconnectRequired');
  });

  it('renders compact Studio MCP route cards without exposing raw routing payloads', () => {
    const panel = source('components/studio/NLStudioPanel.tsx');

    expect(panel).toContain('mcpRoutingCard');
    expect(panel).toContain('MCP route ready');
    expect(panel).toContain('MCP reconnect required');
    expect(panel).toContain('Permission review required before external execution.');
    expect(panel).toContain('Super AgentOS will ask before running connected external tools');
    expect(panel).not.toContain('JSON.stringify(routeCard');
  });
});
