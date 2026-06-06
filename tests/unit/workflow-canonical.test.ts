import { describe, expect, it } from 'vitest';
import {
  hydrateWorkflowDocument,
  syncWorkflowDocument,
} from '../../src/workflows/canonical.js';

describe('workflow canonical sync', () => {
  it('projects conversation steps into canonical graph and code', () => {
    const synced = syncWorkflowDocument({
      mode: 'conversation',
      steps: [
        { order: 1, tool: 'net_http_get', description: 'Fetch', input: { url: 'https://example.com' } },
        { order: 2, tool: 'mem_set', description: 'Cache', input: { key: 'x', value: 'y' } },
      ],
    });

    expect(synced.steps).toHaveLength(2);
    expect(synced.steps[0].tool).toBe('agentos.net_http_get');
    expect(synced.graphState.nodes).toHaveLength(2);
    expect(synced.graphState.edges).toHaveLength(1);
    expect(synced.codeState).toContain('"steps"');
    expect(synced.canonical.updatedFrom).toBe('conversation');
  });

  it('projects visual graph edits back to steps and code', () => {
    const synced = syncWorkflowDocument({
      mode: 'visual',
      graph: {
        nodes: [
          { id: 'a', type: 'step', label: 'Step A', order: 1, tool: 'mem_set', description: 'Write memory', input: { key: 'a', value: 1 } },
          { id: 'b', type: 'step', label: 'Step B', order: 2, tool: 'db_query', description: 'Read DB', input: { query: 'select 1' } },
        ],
        edges: [{ id: 'e1', source: 'a', target: 'b' }],
      },
    });

    expect(synced.steps).toHaveLength(2);
    expect(synced.steps[0].tool).toBe('agentos.mem_set');
    expect(synced.steps[1].tool).toBe('agentos.db_query');
    expect(synced.codeState).toContain('"graph"');
    expect(synced.canonical.updatedFrom).toBe('visual');
  });

  it('parses code mode and hydrates canonical documents', () => {
    const code = JSON.stringify({
      version: '1.0.0',
      steps: [
        { order: 3, tool: 'net_http_get', description: 'Fetch data', input: { url: 'https://example.com' } },
      ],
    });
    const synced = syncWorkflowDocument({ mode: 'code', code });
    expect(synced.steps[0].order).toBe(1);
    expect(synced.canonical.updatedFrom).toBe('code');

    const hydrated = hydrateWorkflowDocument({
      canonicalDoc: synced.canonical,
      steps: [],
      graphState: { nodes: [], edges: [] },
      codeState: null,
    });
    expect(hydrated.steps).toHaveLength(1);
    expect(hydrated.codeState).toContain('"version"');
  });

  it('preserves external MCP and skill tool identifiers without agentos prefixing', () => {
    const synced = syncWorkflowDocument({
      mode: 'conversation',
      steps: [
        { order: 1, tool: 'mcp.gmail.send_email', description: 'Send mail', input: { to: 'ops@example.com' } },
        { order: 2, tool: 'skill.research_notes.run', description: 'Summarize', input: { topic: 'beta' } },
      ],
    });

    expect(synced.steps[0].tool).toBe('mcp.gmail.send_email');
    expect(synced.steps[1].tool).toBe('skill.research_notes.run');
  });

  it('rejects invalid code payloads', () => {
    expect(() => syncWorkflowDocument({ mode: 'code', code: '{bad json' })).toThrow('valid JSON');
  });
});
