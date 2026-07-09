'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/os/ui';
import { useStudio } from '@/components/studio/StudioProvider';
import { fetchWithBrowserSession } from '@/src/auth/browser-session';

const SUGGESTIONS = [
  'Research a topic',
  'Build an app',
  'Create a workflow',
  'Analyze a file',
];

const SLASH_COMMANDS = [
  { command: '/skill ', label: 'Run a skill' },
  { command: '/app ', label: 'Run an app' },
  { command: '/workflow ', label: 'Run a workflow' },
  { command: '/subagent ', label: 'Delegate to a private subagent' },
  { command: '/mcp ', label: 'Call an MCP tool' },
  { command: '/file ', label: 'Analyze an uploaded file' },
  { command: '/project ', label: 'Switch project context' },
];

type ResourceMenu = 'skill' | 'app' | 'workflow' | 'mcp' | 'subagent' | 'project' | 'context';

type ChatSearchMatch = {
  messageId: string;
  start: number;
  end: number;
  index: number;
};

const INTERNAL_JSON_KEYS = new Set([
  'executionId',
  'traceId',
  'router',
  'stack',
  'payload',
  'confirmToken',
  'sourceType',
  'whatFailed',
  'possibleFix',
]);

function hasInternalJsonKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasInternalJsonKey);
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => (
    INTERNAL_JSON_KEYS.has(key) || hasInternalJsonKey(child)
  ));
}

function visibleMessageContent(message: { role: string; content: string }): string {
  if (message.role === 'user') return message.content;
  const trimmed = message.content.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return message.content;
  try {
    return hasInternalJsonKey(JSON.parse(trimmed))
      ? 'Super AgentOS returned a structured execution result. Open Context logs for details.'
      : message.content;
  } catch {
    return message.content;
  }
}

async function fileData(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? '').split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function NLStudioPanel() {
  const {
    messages,
    composerValue,
    setComposerValue,
    sendMessage,
    stopGeneration,
    pendingApproval,
    approvePending,
    sending,
    streamingStatus,
    activeExecutionId,
    session,
    currentProject,
    projects,
    installedSkills,
    installedApps,
    workflows,
    subagents,
    composerAttachments,
    composerInvocations,
    addComposerAttachment,
    removeComposerAttachment,
    addComposerInvocation,
    removeComposerInvocation,
    selectProject,
    openContext,
  } = useStudio();
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const chatSearchInputRef = useRef<HTMLInputElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [resourceMenu, setResourceMenu] = useState<ResourceMenu | null>(null);
  const [uploading, setUploading] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [activeChatMatchIndex, setActiveChatMatchIndex] = useState(0);
  const activeConversation = messages.length > 0;
  const normalizedChatSearch = chatSearchQuery.trim().toLowerCase();
  const lastUserMessage = useMemo(
    () => [...messages].reverse().find(message => message.role === 'user')?.content ?? '',
    [messages],
  );
  const chatSearchMatches = useMemo(() => {
    if (!normalizedChatSearch) return [];
    const next: ChatSearchMatch[] = [];
    for (const message of messages) {
      const content = visibleMessageContent(message);
      const lowerContent = content.toLowerCase();
      let start = lowerContent.indexOf(normalizedChatSearch);
      while (start >= 0) {
        next.push({
          messageId: message.id,
          start,
          end: start + normalizedChatSearch.length,
          index: next.length,
        });
        start = lowerContent.indexOf(normalizedChatSearch, start + normalizedChatSearch.length);
      }
    }
    return next;
  }, [messages, normalizedChatSearch]);
  const activeChatMatch = chatSearchMatches[activeChatMatchIndex] ?? null;
  const chatSearchStatus = !normalizedChatSearch
    ? 'Search active chat'
    : chatSearchMatches.length > 0
      ? `${activeChatMatchIndex + 1}/${chatSearchMatches.length} matches`
      : '0 matches';

  useEffect(() => {
    const input = composerRef.current;
    if (!input) return;
    input.style.height = '24px';
    input.style.height = `${Math.min(180, Math.max(24, input.scrollHeight))}px`;
  }, [composerValue]);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (!conversation) return;
    conversation.scrollTo({
      top: conversation.scrollHeight,
      behavior: sending ? 'auto' : 'smooth',
    });
  }, [messages, sending]);

  useEffect(() => {
    if (chatSearchMatches.length === 0) {
      setActiveChatMatchIndex(0);
      return;
    }
    setActiveChatMatchIndex(current => Math.min(current, chatSearchMatches.length - 1));
  }, [chatSearchMatches.length]);

  useEffect(() => {
    if (!activeChatMatch) return;
    messageRefs.current[activeChatMatch.messageId]?.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    });
  }, [activeChatMatch]);

  function submitComposer() {
    const nextMessage = composerValue.trim();
    if (sending || !nextMessage) return;
    void sendMessage(nextMessage);
  }

  async function branchConversation() {
    if (!session?.id) return;
    const response = await fetchWithBrowserSession(`/api/studio/sessions/${encodeURIComponent(session.id)}/branch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `${session.title ?? 'Session'} Branch` }),
    });
    if (!response.response.ok) return;
    const payload = await response.response.json() as { session?: { id: string; projectId?: string | null } };
    if (payload.session?.id) {
      window.location.assign(`/studio?mode=nl&session=${encodeURIComponent(payload.session.id)}${payload.session.projectId ? `&project=${encodeURIComponent(payload.session.projectId)}` : ''}`);
    }
  }

  function searchConversation(message: string) {
    const query = message.trim().slice(0, 120);
    if (!query) return;
    setChatSearchQuery(query);
    setActiveChatMatchIndex(0);
    requestAnimationFrame(() => chatSearchInputRef.current?.focus());
  }

  function updateChatSearchQuery(value: string) {
    setChatSearchQuery(value);
    setActiveChatMatchIndex(0);
  }

  function navigateChatSearch(direction: 1 | -1) {
    if (chatSearchMatches.length === 0) return;
    setActiveChatMatchIndex(current => (
      current + direction + chatSearchMatches.length
    ) % chatSearchMatches.length);
  }

  function renderHighlightedContent(messageId: string, content: string) {
    if (!normalizedChatSearch) return null;
    const matches = chatSearchMatches.filter(match => match.messageId === messageId);
    if (matches.length === 0) return content;
    const nodes: ReactNode[] = [];
    let cursor = 0;
    for (const match of matches) {
      if (match.start > cursor) nodes.push(content.slice(cursor, match.start));
      nodes.push(
        <mark
          key={`${messageId}-${match.index}`}
          className={`nl-chat-search-hit${match.index === activeChatMatchIndex ? ' active' : ''}`}
          data-active-match={match.index === activeChatMatchIndex ? 'true' : 'false'}
        >
          {content.slice(match.start, match.end)}
        </mark>,
      );
      cursor = match.end;
    }
    if (cursor < content.length) nodes.push(content.slice(cursor));
    return <div className="nl-search-highlighted-text">{nodes}</div>;
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 8)) {
        const path = `uploads/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, '-')}`;
        const response = await fetchWithBrowserSession('/api/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: session?.workspaceId ?? currentProject?.workspaceId ?? null,
            sessionId: session?.id ?? null,
            path,
            data: await fileData(file),
            contentEncoding: 'base64',
            contentType: file.type || 'application/octet-stream',
            visibility: 'private',
            kind: 'file',
            metadata: { originalName: file.name, uploadedFrom: 'studio_composer' },
          }),
        });
        if (!response.response.ok) continue;
        const payload = await response.response.json() as { entry?: { id: string; path: string; contentType?: string | null } };
        if (payload.entry) {
          addComposerAttachment({
            id: payload.entry.id,
            name: file.name,
            path: payload.entry.path,
            contentType: payload.entry.contentType ?? file.type ?? null,
          });
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  }

  const resourceItems = resourceMenu === 'skill'
    ? installedSkills.map(item => ({ ref: item.slug, label: item.name }))
    : resourceMenu === 'app'
      ? installedApps.map(item => ({ ref: item.slug, label: item.name }))
      : resourceMenu === 'workflow'
        ? workflows.map(item => ({ ref: item.id, label: item.name }))
        : resourceMenu === 'subagent'
          ? subagents.map(item => ({ ref: item.id, label: item.name }))
          : resourceMenu === 'project'
            ? projects.map(item => ({ ref: item.id, label: item.name }))
            : resourceMenu === 'mcp'
              ? [{ ref: 'universal-mcp', label: 'Universal MCP' }]
              : [];

  return (
    <div className={`nl-studio-panel${activeConversation ? ' active' : ' empty'}`} data-active-conversation={activeConversation ? 'true' : 'false'}>
      <main className="nl-conversation" ref={conversationRef} aria-live="polite">
        {!activeConversation ? (
          <section className="nl-empty-state">
            <img src="/logo.png" alt="AgentOS" className="nl-empty-logo" />
            <div>
              <h1>What should Super AgentOS do?</h1>
              <p>Start with a request, a file, an app, a skill, or a workflow.</p>
            </div>
            <div className="nl-empty-suggestions" aria-label="Prompt suggestions">
              {SUGGESTIONS.map(suggestion => (
                <button key={suggestion} type="button" onClick={() => void sendMessage(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div className="nl-message-list">
            <section className="nl-chat-search" role="search" aria-label="Active chat search controls">
              <input
                ref={chatSearchInputRef}
                value={chatSearchQuery}
                onChange={event => updateChatSearchQuery(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    navigateChatSearch(event.shiftKey ? -1 : 1);
                  }
                }}
                placeholder="Search this chat"
                aria-label="Search active conversation"
              />
              <span aria-live="polite">{chatSearchStatus}</span>
              <button
                type="button"
                onClick={() => navigateChatSearch(-1)}
                disabled={chatSearchMatches.length === 0}
                title={chatSearchMatches.length === 0 ? 'No matches in this chat' : 'Previous match'}
                aria-label="Previous match"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => navigateChatSearch(1)}
                disabled={chatSearchMatches.length === 0}
                title={chatSearchMatches.length === 0 ? 'No matches in this chat' : 'Next match'}
                aria-label="Next match"
              >
                Next
              </button>
              <button
                type="button"
                onClick={() => updateChatSearchQuery('')}
                disabled={!chatSearchQuery}
                title={!chatSearchQuery ? 'Search is already clear' : 'Clear chat search'}
                aria-label="Clear chat search"
              >
                Clear
              </button>
            </section>
            {messages.map(message => {
              const visibleContent = visibleMessageContent(message);
              const highlightedContent = renderHighlightedContent(message.id, visibleContent);
              return (
              <article
                key={message.id}
                ref={element => { messageRefs.current[message.id] = element; }}
                className={`nl-message ${message.role} ${message.state ?? 'complete'}`}
                data-message-id={message.id}
                data-search-active={activeChatMatch?.messageId === message.id ? 'true' : 'false'}
              >
                {message.role === 'assistant' ? (
                  <div className="nl-assistant-avatar">
                    <img src="/logo.png" alt="" />
                  </div>
                ) : null}
                <div className="nl-message-content">
                  {message.role === 'system' ? <div className="nl-system-label">System</div> : null}
                  {visibleContent ? (
                    <div className="nl-markdown">
                      {highlightedContent ?? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ children, ...props }) => (
                              <a {...props} target="_blank" rel="noreferrer">{children}</a>
                            ),
                          }}
                        >
                          {visibleContent}
                        </ReactMarkdown>
                      )}
                    </div>
                  ) : message.state === 'streaming' ? (
                    <div className="nl-stream-status">{streamingStatus ?? 'Generating...'}</div>
                  ) : null}
                  {message.role === 'assistant' && message.state === 'streaming' ? (
                    <div className="nl-execution-card" role="status" aria-live="polite">
                      <div>
                        <strong>{streamingStatus ?? 'Generating...'}</strong>
                        <span>{activeExecutionId ? 'Execution started' : 'Preparing Super AgentOS execution'}</span>
                      </div>
                      {composerInvocations.length > 0 ? (
                        <div className="nl-execution-chips" aria-label="Selected execution resources">
                          {composerInvocations.map(item => (
                            <span key={item.id}>{item.kind}: {item.label}</span>
                          ))}
                        </div>
                      ) : null}
                      <button type="button" onClick={() => void stopGeneration()}>Stop</button>
                    </div>
                  ) : null}
                  {message.state === 'streaming' ? <span className="nl-stream-cursor" aria-hidden="true" /> : null}
                  {message.state === 'stopped' ? (
                    <div className="nl-response-state stopped">
                      <strong>Response stopped</strong>
                      <span>Partial output is kept when available. Retry or continue when ready.</span>
                    </div>
                  ) : null}
                  {message.state === 'error' ? (
                    <div className="nl-response-state error" role="alert">
                      <strong>Response failed</strong>
                      <span>Super AgentOS could not finish this response. Retry is available below.</span>
                    </div>
                  ) : null}
                  {message.state !== 'streaming' && visibleContent ? (
                    <div className="nl-message-actions">
                      <button type="button" onClick={() => void navigator.clipboard?.writeText(visibleContent)}>Copy</button>
                      {message.role === 'user' ? (
                        <button type="button" onClick={() => setComposerValue(message.content)}>Edit</button>
                      ) : null}
                      {message.role === 'assistant' && lastUserMessage ? (
                        <button type="button" onClick={() => void sendMessage(lastUserMessage)}>{message.state === 'error' ? 'Retry' : 'Regenerate'}</button>
                      ) : null}
                      {message.role === 'assistant' ? (
                        <button type="button" onClick={() => void sendMessage('Continue')}>Continue</button>
                      ) : null}
                      {message.role === 'assistant' && session ? (
                        <button type="button" onClick={() => void branchConversation()}>Branch</button>
                      ) : null}
                      {message.role === 'assistant' || message.role === 'user' ? (
                        <button type="button" onClick={() => searchConversation(visibleContent)}>Search chat</button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
              );
            })}
          </div>
        )}
      </main>

      <section className="nl-composer-zone">
        {pendingApproval ? (
          <div className="nl-approval-row">
            <span>{pendingApproval.reply}</span>
            <Button onClick={approvePending}>Approve</Button>
          </div>
        ) : null}
        <form className="nl-composer" onSubmit={event => {
          event.preventDefault();
          submitComposer();
        }}>
          <div className="nl-composer-meta">
            {currentProject ? (
              <button type="button" onClick={() => setResourceMenu(resourceMenu === 'project' ? null : 'project')} title="Change project context">
                Project: {currentProject.name}
              </button>
            ) : null}
            {composerAttachments.map(item => (
              <button key={item.id} type="button" onClick={() => removeComposerAttachment(item.id)} title="Remove attachment">
                {item.name} x
              </button>
            ))}
            {composerInvocations.map(item => (
              <button key={item.id} type="button" onClick={() => removeComposerInvocation(item.id)} title="Remove invocation">
                {item.kind}: {item.label} x
              </button>
            ))}
          </div>
          <textarea
            ref={composerRef}
            value={composerValue}
            onChange={event => setComposerValue(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submitComposer();
              }
            }}
            placeholder="Message Super AgentOS..."
            rows={1}
            aria-label="Message Super AgentOS"
          />
          <div className="nl-composer-tools" aria-label="Composer tools">
            <input ref={fileInputRef} type="file" multiple hidden onChange={event => void uploadFiles(event.target.files)} />
            <input ref={imageInputRef} type="file" multiple accept="image/*" hidden onChange={event => void uploadFiles(event.target.files)} />
            <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Upload file">{uploading ? 'Uploading...' : 'File'}</button>
            <button type="button" onClick={() => imageInputRef.current?.click()} aria-label="Upload image">Image</button>
            <button type="button" onClick={() => setResourceMenu(resourceMenu === 'skill' ? null : 'skill')}>Skills</button>
            <button type="button" onClick={() => setResourceMenu(resourceMenu === 'app' ? null : 'app')}>Apps</button>
            <button type="button" onClick={() => setResourceMenu(resourceMenu === 'workflow' ? null : 'workflow')}>Workflow</button>
            <button type="button" onClick={() => setResourceMenu(resourceMenu === 'subagent' ? null : 'subagent')}>Subagents</button>
            <button type="button" onClick={() => setResourceMenu(resourceMenu === 'project' ? null : 'project')}>Project</button>
            <button type="button" onClick={() => setResourceMenu(resourceMenu === 'context' ? null : 'context')}>Context</button>
            <button type="button" onClick={() => setResourceMenu(resourceMenu === 'mcp' ? null : 'mcp')}>MCP</button>
          </div>
          {sending ? (
            <button type="button" className="nl-composer-action stop" onClick={() => void stopGeneration()} aria-label="Stop generation">
              <span />
            </button>
          ) : (
            <button type="submit" className="nl-composer-action send" disabled={!composerValue.trim()} aria-label="Send message">
              Send
            </button>
          )}
          {resourceMenu ? (
            <div className="nl-resource-menu" role="menu" aria-label={`${resourceMenu} resources`}>
              {resourceMenu === 'context' ? (
                <>
                  <button type="button" onClick={() => { openContext('files'); setResourceMenu(null); }}>Attached files</button>
                  <button type="button" onClick={() => { openContext('memory'); setResourceMenu(null); }}>Memory</button>
                  <button type="button" onClick={() => { openContext('vault'); setResourceMenu(null); }}>Vault permissions</button>
                  <button type="button" onClick={() => { openContext('logs'); setResourceMenu(null); }}>Execution logs</button>
                </>
              ) : resourceItems.length > 0 ? resourceItems.map(item => (
                <button
                  key={item.ref}
                  type="button"
                  onClick={() => {
                    if (resourceMenu === 'project') {
                      selectProject(item.ref);
                    } else {
                      addComposerInvocation({ kind: resourceMenu, ref: item.ref, label: item.label });
                    }
                    setResourceMenu(null);
                  }}
                >
                  {item.label}
                </button>
              )) : <span>{resourceMenu === 'project' ? 'No projects available.' : `No connected ${resourceMenu} resources.`}</span>}
            </div>
          ) : null}
          {composerValue.startsWith('/') ? (
            <div className="nl-resource-menu slash" role="menu" aria-label="Slash commands">
              {SLASH_COMMANDS.filter(item => item.command.startsWith(composerValue) || composerValue === '/').map(item => (
                <button key={item.command} type="button" onClick={() => setComposerValue(item.command)}>
                  <strong>{item.command.trim()}</strong>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </form>
      </section>

      <style>{`
        .nl-studio-panel {
          min-height: 0;
          height: 100%;
          display: grid;
          grid-template-rows: minmax(0, 1fr) auto;
          overflow: hidden;
          background: var(--bg-primary);
        }

        .nl-conversation {
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
        }

        .nl-empty-state {
          width: min(620px, calc(100% - 32px));
          min-height: 100%;
          margin: 0 auto;
          padding: 32px 0 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 18px;
          text-align: center;
        }

        .nl-empty-logo {
          width: 54px;
          height: 54px;
          border-radius: 14px;
          object-fit: cover;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
        }

        .nl-empty-state h1 {
          margin: 0;
          font-size: 1.78rem;
          line-height: 1.15;
          letter-spacing: 0;
        }

        .nl-empty-state p {
          max-width: 480px;
          margin: 8px auto 0;
          color: var(--text-secondary);
          font-size: 0.95rem;
          line-height: 1.5;
        }

        .nl-empty-suggestions {
          width: min(620px, 100%);
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .nl-empty-suggestions button {
          min-height: 44px;
          padding: 10px 14px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: rgba(255,255,255,0.025);
          color: var(--text-secondary);
          text-align: left;
          cursor: pointer;
        }

        .nl-empty-suggestions button:hover {
          border-color: rgba(20, 184, 166, 0.34);
          background: rgba(20, 184, 166, 0.08);
          color: var(--text-primary);
        }

        .nl-message-list {
          width: min(820px, calc(100% - 40px));
          margin: 0 auto;
          padding: 24px 0 60px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .nl-chat-search {
          position: sticky;
          top: 10px;
          z-index: 3;
          display: grid;
          grid-template-columns: minmax(180px, 1fr) auto auto auto auto;
          gap: 8px;
          align-items: center;
          padding: 8px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: color-mix(in srgb, var(--bg-primary) 92%, transparent);
          box-shadow: 0 10px 26px rgba(0,0,0,0.18);
          backdrop-filter: blur(12px);
        }

        .nl-chat-search input {
          min-width: 0;
          min-height: 32px;
          padding: 0 10px;
          border: 1px solid var(--border);
          border-radius: 8px;
          outline: 0;
          background: rgba(255,255,255,0.03);
          color: var(--text-primary);
          font: inherit;
          font-size: 0.78rem;
        }

        .nl-chat-search input:focus {
          border-color: rgba(20, 184, 166, 0.5);
        }

        .nl-chat-search span {
          min-width: 86px;
          color: var(--text-secondary);
          font-size: 0.73rem;
          white-space: nowrap;
        }

        .nl-chat-search button {
          min-height: 32px;
          padding: 0 10px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: rgba(255,255,255,0.025);
          color: var(--text-secondary);
          font-size: 0.72rem;
          cursor: pointer;
        }

        .nl-chat-search button:disabled {
          opacity: 0.55;
          cursor: default;
        }

        .nl-search-highlighted-text {
          white-space: pre-wrap;
        }

        .nl-chat-search-hit {
          padding: 0 2px;
          border-radius: 4px;
          background: rgba(251, 191, 36, 0.32);
          color: inherit;
        }

        .nl-chat-search-hit.active {
          background: rgba(20, 184, 166, 0.42);
          box-shadow: 0 0 0 1px rgba(20, 184, 166, 0.5);
        }

        .nl-message[data-search-active="true"] .nl-message-content {
          border-radius: 10px;
          outline: 1px solid rgba(20, 184, 166, 0.34);
          outline-offset: 6px;
        }

        .nl-message {
          display: grid;
          grid-template-columns: 32px minmax(0, 1fr);
          gap: 12px;
          align-items: start;
        }

        .nl-message.user {
          width: fit-content;
          max-width: min(72%, 620px);
          align-self: flex-end;
          grid-template-columns: minmax(0, 1fr);
          padding: 11px 15px;
          border-radius: 18px 18px 5px 18px;
          background: rgba(148, 163, 184, 0.12);
        }

        .nl-message.system {
          grid-template-columns: minmax(0, 1fr);
          color: var(--text-secondary);
          font-size: 0.82rem;
        }

        .nl-assistant-avatar {
          width: 30px;
          height: 30px;
          border-radius: 9px;
          overflow: hidden;
          background: var(--bg-secondary);
          box-shadow: inset 0 0 0 1px var(--border);
        }

        .nl-assistant-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .nl-message-content {
          min-width: 0;
          max-width: 760px;
          color: var(--text-primary);
          line-height: 1.68;
        }

        .nl-message.assistant .nl-message-content {
          padding-top: 1px;
        }

        .nl-markdown > :first-child {
          margin-top: 0;
        }

        .nl-markdown > :last-child {
          margin-bottom: 0;
        }

        .nl-markdown p,
        .nl-markdown ul,
        .nl-markdown ol,
        .nl-markdown blockquote,
        .nl-markdown pre,
        .nl-markdown table {
          margin: 0 0 14px;
        }

        .nl-markdown h1,
        .nl-markdown h2,
        .nl-markdown h3 {
          margin: 22px 0 10px;
          line-height: 1.25;
        }

        .nl-markdown ul,
        .nl-markdown ol {
          padding-left: 24px;
        }

        .nl-markdown li + li {
          margin-top: 5px;
        }

        .nl-markdown a {
          color: var(--accent);
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .nl-markdown code {
          padding: 0.12em 0.36em;
          border-radius: 5px;
          background: rgba(148, 163, 184, 0.12);
          font-family: var(--font-mono), monospace;
          font-size: 0.88em;
        }

        .nl-markdown pre {
          max-width: 100%;
          padding: 14px 16px;
          overflow-x: auto;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--code-bg);
        }

        .nl-markdown pre code {
          padding: 0;
          background: transparent;
        }

        .nl-markdown blockquote {
          padding-left: 14px;
          border-left: 3px solid rgba(20, 184, 166, 0.45);
          color: var(--text-secondary);
        }

        .nl-markdown table {
          width: 100%;
          display: block;
          overflow-x: auto;
          border-collapse: collapse;
        }

        .nl-markdown th,
        .nl-markdown td {
          padding: 8px 10px;
          border: 1px solid var(--border);
          text-align: left;
        }

        .nl-stream-status,
        .nl-system-label {
          color: var(--text-tertiary);
          font-size: 0.78rem;
        }

        .nl-execution-card,
        .nl-response-state {
          width: fit-content;
          max-width: 100%;
          display: grid;
          gap: 8px;
          margin-top: 10px;
          padding: 10px 12px;
          border: 1px solid rgba(20, 184, 166, 0.24);
          border-radius: 10px;
          background: rgba(20, 184, 166, 0.075);
          color: var(--text-secondary);
          font-size: 0.76rem;
        }

        .nl-execution-card > div:first-child,
        .nl-response-state {
          line-height: 1.45;
        }

        .nl-execution-card strong,
        .nl-response-state strong {
          display: block;
          color: var(--text-primary);
          font-size: 0.78rem;
        }

        .nl-execution-card button {
          width: fit-content;
          min-height: 26px;
          padding: 0 9px;
          border: 1px solid rgba(248, 113, 113, 0.28);
          border-radius: 8px;
          background: rgba(248, 113, 113, 0.12);
          color: #fecaca;
          cursor: pointer;
        }

        .nl-execution-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }

        .nl-execution-chips span {
          max-width: 220px;
          padding: 4px 7px;
          overflow: hidden;
          border: 1px solid var(--border);
          border-radius: 999px;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text-tertiary);
        }

        .nl-response-state.error {
          border-color: rgba(248, 113, 113, 0.3);
          background: rgba(248, 113, 113, 0.095);
        }

        .nl-response-state.stopped {
          border-color: rgba(251, 191, 36, 0.3);
          background: rgba(251, 191, 36, 0.095);
        }

        .nl-stream-cursor {
          width: 7px;
          height: 1.1em;
          display: inline-block;
          margin-left: 3px;
          vertical-align: -0.15em;
          border-radius: 2px;
          background: var(--accent);
          animation: nl-cursor-blink 0.8s steps(1) infinite;
        }

        @keyframes nl-cursor-blink {
          50% { opacity: 0; }
        }

        .nl-message-actions {
          min-height: 24px;
          display: flex;
          gap: 10px;
          margin-top: 7px;
          opacity: 0;
          transition: opacity 120ms ease;
        }

        .nl-message:hover .nl-message-actions,
        .nl-message.error .nl-message-actions {
          opacity: 1;
        }

        .nl-message-actions button {
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--text-tertiary);
          font-size: 0.73rem;
          cursor: pointer;
        }

        .nl-message-actions button:hover {
          color: var(--text-primary);
        }

        .nl-composer-zone {
          position: relative;
          z-index: 4;
          padding: 10px 20px calc(16px + env(safe-area-inset-bottom));
          background: linear-gradient(180deg, transparent, var(--bg-primary) 30%);
        }

        .nl-composer {
          position: relative;
          width: min(860px, 100%);
          min-height: 58px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 48px;
          grid-template-rows: auto auto auto;
          align-items: end;
          gap: 10px;
          padding: 15px 14px 10px 18px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 20px;
          background: rgba(13, 23, 32, 0.96);
          box-shadow: 0 16px 42px rgba(0,0,0,0.24);
        }

        .nl-composer:focus-within {
          border-color: rgba(20, 184, 166, 0.5);
          box-shadow: 0 16px 42px rgba(0,0,0,0.24), 0 0 0 3px rgba(20, 184, 166, 0.08);
        }

        .nl-composer textarea {
          grid-column: 1;
          grid-row: 2;
          width: 100%;
          min-height: 24px;
          max-height: 180px;
          padding: 2px 0 6px;
          border: 0;
          outline: 0;
          resize: none;
          background: transparent;
          color: var(--text-primary);
          font: inherit;
          line-height: 1.5;
        }

        .nl-composer textarea::placeholder {
          color: var(--text-tertiary);
        }

        .nl-composer-action {
          grid-column: 2;
          grid-row: 2;
          width: 46px;
          height: 36px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 12px;
          cursor: pointer;
        }

        .nl-composer-action.send {
          background: var(--accent);
          color: #021014;
          font-size: 0.74rem;
          font-weight: 800;
        }

        .nl-composer-action.send:disabled {
          background: rgba(148, 163, 184, 0.13);
          color: var(--text-tertiary);
          cursor: default;
        }

        .nl-composer-action.stop {
          background: rgba(248, 113, 113, 0.15);
          color: #fecaca;
        }

        .nl-composer-action.stop span {
          width: 11px;
          height: 11px;
          border-radius: 2px;
          background: currentColor;
        }

        .nl-composer-meta {
          grid-column: 1 / -1;
          grid-row: 1;
          display: flex;
          gap: 5px;
          flex-wrap: wrap;
        }

        .nl-composer-meta:empty {
          display: none;
        }

        .nl-composer-meta button,
        .nl-composer-tools button {
          min-height: 25px;
          padding: 0 8px;
          border: 1px solid var(--border);
          border-radius: 7px;
          background: rgba(255,255,255,0.025);
          color: var(--text-secondary);
          font-size: 0.68rem;
          cursor: pointer;
        }

        .nl-composer-tools {
          grid-column: 1 / -1;
          grid-row: 3;
          display: flex;
          gap: 5px;
          padding-top: 5px;
          overflow-x: auto;
        }

        .nl-resource-menu {
          position: absolute;
          left: 12px;
          bottom: calc(100% + 8px);
          z-index: 12;
          width: min(320px, calc(100% - 24px));
          max-height: 240px;
          display: grid;
          gap: 3px;
          padding: 7px;
          overflow: auto;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--bg-secondary);
          box-shadow: 0 18px 50px rgba(0,0,0,0.28);
        }

        .nl-resource-menu button {
          min-height: 34px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 0 9px;
          border: 0;
          border-radius: 7px;
          background: transparent;
          color: var(--text-secondary);
          text-align: left;
          cursor: pointer;
        }

        .nl-resource-menu button:hover {
          background: rgba(255,255,255,0.055);
          color: var(--text-primary);
        }

        .nl-resource-menu > span {
          padding: 9px;
          color: var(--text-tertiary);
          font-size: 0.72rem;
        }

        .nl-resource-menu.slash button span {
          color: var(--text-tertiary);
          font-size: 0.68rem;
        }

        .nl-approval-row {
          width: min(860px, 100%);
          margin: 0 auto 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border: 1px solid rgba(251, 191, 36, 0.25);
          border-radius: 12px;
          background: rgba(251, 191, 36, 0.08);
          color: var(--text-secondary);
          font-size: 0.82rem;
        }

        :root[data-theme="light"] .nl-composer {
          background: rgba(255, 255, 255, 0.97);
        }

        @media (max-width: 720px) {
          .nl-empty-state {
            width: min(100% - 24px, 620px);
            padding-top: 24px;
            justify-content: center;
          }

          .nl-empty-logo {
            width: 48px;
            height: 48px;
          }

          .nl-empty-state h1 {
            font-size: 1.45rem;
          }

          .nl-empty-suggestions {
            grid-template-columns: minmax(0, 1fr);
          }

          .nl-message-list {
            width: calc(100% - 24px);
            padding-top: 20px;
            padding-bottom: 48px;
            gap: 24px;
          }

          .nl-chat-search {
            top: 8px;
            grid-template-columns: minmax(0, 1fr) auto auto auto;
            gap: 6px;
          }

          .nl-chat-search span {
            grid-column: 1 / -1;
            grid-row: 2;
            min-width: 0;
          }

          .nl-message {
            grid-template-columns: 28px minmax(0, 1fr);
            gap: 9px;
          }

          .nl-message.user {
            max-width: 88%;
          }

          .nl-assistant-avatar {
            width: 27px;
            height: 27px;
          }

          .nl-composer-zone {
            padding: 8px 10px calc(10px + env(safe-area-inset-bottom));
          }

          .nl-composer {
            grid-template-columns: minmax(0, 1fr) 44px;
            min-height: 54px;
            padding: 13px 10px 8px 14px;
            border-radius: 17px;
          }

          .nl-composer-action {
            width: 42px;
          }

          .nl-message-actions {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
