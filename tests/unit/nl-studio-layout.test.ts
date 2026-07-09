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

  it('keeps composer resource pickers available without fake resources', () => {
    const panel = source();

    expect(panel).toContain("type ResourceMenu = 'skill' | 'app' | 'workflow' | 'mcp' | 'subagent' | 'project' | 'context'");
    expect(panel).toContain('Subagents</button>');
    expect(panel).toContain('Project</button>');
    expect(panel).toContain('Context</button>');
    expect(panel).toContain('Attached files');
    expect(panel).toContain('No connected ${resourceMenu} resources.');
    expect(panel).toContain("addComposerInvocation({ kind: resourceMenu, ref: item.ref, label: item.label })");
  });

  it('keeps active chat search direct inside the conversation', () => {
    const panel = source();

    expect(panel).toContain('Search this chat');
    expect(panel).toContain('aria-label="Search active conversation"');
    expect(panel).toContain('className="nl-chat-search"');
    expect(panel).toContain('className={`nl-chat-search-hit${match.index === activeChatMatchIndex ?');
    expect(panel).toContain('navigateChatSearch(event.shiftKey ? -1 : 1)');
    expect(panel).toContain('Search chat</button>');
  });
});
