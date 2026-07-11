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
        { order: 1, tool: 'net_http_get', description: 'Fetch', input: { url: 'https://example.com' }, output: { body: 'html' } },
        { order: 2, tool: 'mem_set', description: 'Cache', input: { key: 'x', value: 'y' }, output: { stored: true } },
      ],
    });

    expect(synced.steps).toHaveLength(2);
    expect(synced.steps[0].tool).toBe('agentos.net_http_get');
    expect(synced.steps[0].output).toEqual({ body: 'html' });
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
          { id: 'start', type: 'trigger', label: 'Manual', order: 1, tool: 'agentos.trigger.manual', description: 'Start manually', input: { trigger: 'manual' }, output: { event: 'started' } },
          { id: 'a', type: 'skill', label: 'Step A', order: 2, tool: 'skill.research.run', description: 'Write memory', input: { key: 'a', value: 1 }, output: { notes: 'text' } },
          { id: 'b', type: 'output', label: 'Save', order: 3, tool: 'agentos.output.save', description: 'Save output', input: { destination: 'library' }, output: { artifact: 'saved' } },
        ],
        edges: [{ id: 'e1', source: 'start', target: 'a' }, { id: 'e2', source: 'a', target: 'b' }],
      },
    });

    expect(synced.steps).toHaveLength(1);
    expect(synced.steps[0].tool).toBe('skill.research.run');
    expect(synced.steps[0].output).toEqual({ notes: 'text' });
    expect(synced.graphState.nodes).toHaveLength(3);
    expect(synced.graphState.nodes[0].type).toBe('trigger');
    expect(synced.graphState.nodes[2].type).toBe('output');
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
