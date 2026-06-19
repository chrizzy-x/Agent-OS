'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  { command: '/mcp ', label: 'Call an MCP tool' },
  { command: '/file ', label: 'Analyze an uploaded file' },
];

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
    session,
    currentProject,
    installedSkills,
    installedApps,
    workflows,
    composerAttachments,
    composerInvocations,
    addComposerAttachment,
    removeComposerAttachment,
    addComposerInvocation,
    removeComposerInvocation,
  } = useStudio();
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [resourceMenu, setResourceMenu] = useState<'skill' | 'app' | 'workflow' | 'mcp' | null>(null);
  const [uploading, setUploading] = useState(false);
  const activeConversation = messages.length > 0;
  const lastUserMessage = useMemo(
    () => [...messages].reverse().find(message => message.role === 'user')?.content ?? '',
    [messages],
  );

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

  function submitComposer() {
    const nextMessage = composerValue.trim();
    if (sending || !nextMessage) return;
    void sendMessage(nextMessage);
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
        : resourceMenu === 'mcp'
          ? [{ ref: 'universal-mcp', label: 'Universal MCP' }]
          : [];

  return (
    <div className={`nl-studio-panel${activeConversation ? ' active' : ' empty'}`}>
      <main className="nl-conversation" ref={conversationRef} aria-live="polite">
        {!activeConversation ? (
          <section className="nl-empty-state">
            <img src="/logo.png" alt="AgentOS" className="nl-empty-logo" />
            <div>
              <h1>Super AgentOS</h1>
              <p>Ask anything. Build, automate, research, or execute.</p>
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
            {messages.map(message => (
              <article key={message.id} className={`nl-message ${message.role} ${message.state ?? 'complete'}`}>
                {message.role === 'assistant' ? (
                  <div className="nl-assistant-avatar">
                    <img src="/logo.png" alt="" />
                  </div>
                ) : null}
                <div className="nl-message-content">
                  {message.role === 'system' ? <div className="nl-system-label">System</div> : null}
                  {message.content ? (
                    <div className="nl-markdown">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ children, ...props }) => (
                            <a {...props} target="_blank" rel="noreferrer">{children}</a>
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : message.state === 'streaming' ? (
                    <div className="nl-stream-status">{streamingStatus ?? 'Generating…'}</div>
                  ) : null}
                  {message.state === 'streaming' ? <span className="nl-stream-cursor" aria-hidden="true" /> : null}
                  {message.state === 'stopped' ? <div className="nl-message-state">Stopped</div> : null}
                  {message.state !== 'streaming' && message.content ? (
                    <div className="nl-message-actions">
                      <button type="button" onClick={() => void navigator.clipboard?.writeText(message.content)}>Copy</button>
                      {message.role === 'user' ? (
                        <button type="button" onClick={() => setComposerValue(message.content)}>Edit</button>
                      ) : null}
                      {message.role === 'assistant' && message.state === 'error' && lastUserMessage ? (
                        <button type="button" onClick={() => void sendMessage(lastUserMessage)}>Retry</button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
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
            {composerAttachments.map(item => (
              <button key={item.id} type="button" onClick={() => removeComposerAttachment(item.id)} title="Remove attachment">
                {item.name} ×
              </button>
            ))}
            {composerInvocations.map(item => (
              <button key={item.id} type="button" onClick={() => removeComposerInvocation(item.id)} title="Remove invocation">
                {item.kind}: {item.label} ×
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
            placeholder="Message Super AgentOS…"
            rows={1}
            aria-label="Message Super AgentOS"
          />
          <div className="nl-composer-tools" aria-label="Composer tools">
            <input ref={fileInputRef} type="file" multiple hidden onChange={event => void uploadFiles(event.target.files)} />
            <input ref={imageInputRef} type="file" multiple accept="image/*" hidden onChange={event => void uploadFiles(event.target.files)} />
            <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Upload file">{uploading ? 'Uploading…' : 'File'}</button>
            <button type="button" onClick={() => imageInputRef.current?.click()} aria-label="Upload image">Image</button>
            <button type="button" onClick={() => setResourceMenu(resourceMenu === 'skill' ? null : 'skill')}>Skills</button>
            <button type="button" onClick={() => setResourceMenu(resourceMenu === 'app' ? null : 'app')}>Apps</button>
            <button type="button" onClick={() => setResourceMenu(resourceMenu === 'workflow' ? null : 'workflow')}>Workflow</button>
            <button type="button" onClick={() => setResourceMenu(resourceMenu === 'mcp' ? null : 'mcp')}>MCP</button>
          </div>
          {sending ? (
            <button type="button" className="nl-composer-action stop" onClick={() => void stopGeneration()} aria-label="Stop generation">
              <span />
            </button>
          ) : (
            <button type="submit" className="nl-composer-action send" disabled={!composerValue.trim()} aria-label="Send message">
              ↑
            </button>
          )}
          {resourceMenu ? (
            <div className="nl-resource-menu" role="menu" aria-label={`${resourceMenu} resources`}>
              {resourceItems.length > 0 ? resourceItems.map(item => (
                <button
                  key={item.ref}
                  type="button"
                  onClick={() => {
                    addComposerInvocation({ kind: resourceMenu, ref: item.ref, label: item.label });
                    setResourceMenu(null);
                  }}
                >
                  {item.label}
                </button>
              )) : <span>No connected resources.</span>}
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
          width: min(720px, calc(100% - 32px));
          min-height: 100%;
          margin: 0 auto;
          padding: 48px 0 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 24px;
          text-align: center;
        }

        .nl-empty-logo {
          width: 76px;
          height: 76px;
          border-radius: 20px;
          object-fit: cover;
          box-shadow: 0 16px 44px rgba(0, 0, 0, 0.2);
        }

        .nl-empty-state h1 {
          margin: 0;
          font-size: clamp(2rem, 5vw, 3rem);
          line-height: 1.05;
          letter-spacing: -0.035em;
        }

        .nl-empty-state p {
          margin: 10px 0 0;
          color: var(--text-secondary);
          font-size: clamp(0.95rem, 2vw, 1.08rem);
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
          width: min(900px, calc(100% - 40px));
          margin: 0 auto;
          padding: 28px 0 72px;
          display: flex;
          flex-direction: column;
          gap: 28px;
        }

        .nl-message {
          display: grid;
          grid-template-columns: 32px minmax(0, 1fr);
          gap: 12px;
          align-items: start;
        }

        .nl-message.user {
          width: fit-content;
          max-width: min(78%, 680px);
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
          color: var(--text-primary);
          line-height: 1.68;
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
        .nl-message-state,
        .nl-system-label {
          color: var(--text-tertiary);
          font-size: 0.78rem;
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
          grid-template-columns: minmax(0, 1fr) 38px;
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
          width: 36px;
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
          font-size: 1.25rem;
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
            width: 64px;
            height: 64px;
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
            min-height: 54px;
            padding: 13px 10px 8px 14px;
            border-radius: 17px;
          }

          .nl-message-actions {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
