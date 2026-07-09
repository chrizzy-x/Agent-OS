import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source() {
  return readFileSync(join(process.cwd(), 'components', 'studio', 'NLStudioPanel.tsx'), 'utf8');
}

describe('NL Studio layout contract', () => {
  it('keeps empty state separate from active conversation', () => {
    const panel = source();

    expect(panel).toContain("data-active-conversation={activeConversation ? 'true' : 'false'}");
    expect(panel).toContain("{!activeConversation ? (");
    expect(panel).toContain('className="nl-empty-state"');
    expect(panel).toContain('className="nl-message-list"');
  });

  it('uses a readable active chat column and compact composer controls', () => {
    const panel = source();

    expect(panel).toContain('width: min(820px, calc(100% - 40px));');
    expect(panel).toContain('max-width: 760px;');
    expect(panel).toContain('Message Super AgentOS...');
    expect(panel).toContain('Generating...');
    expect(panel).toContain('Send');
  });

  it('shows response states without exposing internal JSON payloads', () => {
    const panel = source();

    expect(panel).toContain('className="nl-execution-card"');
    expect(panel).toContain('Preparing Super AgentOS execution');
    expect(panel).toContain('Response stopped');
    expect(panel).toContain('Response failed');
    expect(panel).toContain('Super AgentOS returned a structured execution result. Open Context logs for details.');
    expect(panel).toContain('INTERNAL_JSON_KEYS');
  });
});
