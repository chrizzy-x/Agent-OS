import { describe, expect, it } from 'vitest';
import { parseStudioSseFrames } from '../../src/studio/sse.js';

describe('Studio SSE parser', () => {
  it('keeps split frames until the next chunk arrives', () => {
    const first = parseStudioSseFrames('event: delta\ndata: {"text":"Hel');
    expect(first.events).toEqual([]);

    const second = parseStudioSseFrames(`${first.remainder}lo"}\n\nevent: done\ndata: {"status":"COMPLETED"}\n\n`);
    expect(second.events).toEqual([
      { event: 'delta', data: { text: 'Hello' } },
      { event: 'done', data: { status: 'COMPLETED' } },
    ]);
    expect(second.remainder).toBe('');
  });

  it('parses multiple events and ignores malformed data', () => {
    const parsed = parseStudioSseFrames([
      'event: status',
      'data: {"text":"Searching…"}',
      '',
      'event: delta',
      'data: not-json',
      '',
      'event: delta',
      'data: {"text":"Result"}',
      '',
      '',
    ].join('\n'));

    expect(parsed.events).toEqual([
      { event: 'status', data: { text: 'Searching…' } },
      { event: 'delta', data: { text: 'Result' } },
    ]);
  });
});
