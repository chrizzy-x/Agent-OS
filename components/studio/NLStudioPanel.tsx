'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/os/ui';
import { useStudio } from '@/components/studio/StudioProvider';

const SUGGESTIONS = ['Install App', 'Create Workflow', 'Create Project', 'Create Skill', 'Search Memory', 'Build App', 'Publish Skill'];
const COMPOSER_TOOLS = ['Files', 'Commands', 'Projects', 'Mentions'] as const;

function renderContent(content: string) {
  return content.split(/\n{2,}/).map((block, index) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('```')) {
      return <pre key={index} className="nl-message-code"><code>{trimmed.replace(/^```[\w-]*\n?/, '').replace(/```$/, '')}</code></pre>;
    }
    return <p key={index}>{trimmed}</p>;
  });
}

export default function NLStudioPanel() {
  const {
    browserSession,
    session,
    sessions,
    messages,
    composerValue,
    setComposerValue,
    sendMessage,
    stopGeneration,
    pendingApproval,
    approvePending,
    sending,
    executions,
    requestExecutionAction,
    currentProject,
    createSession,
    selectSession,
  } = useStudio();
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const recentChats = useMemo(() => sessions.filter(item => !item.archivedAt && !item.deletedAt).slice(0, 4), [sessions]);
  const lastUserMessage = useMemo(() => [...messages].reverse().find(message => message.role === 'user')?.content ?? '', [messages]);

  useEffect(() => {
    const input = composerRef.current;
    if (!input) return;
    input.style.height = '44px';
    input.style.height = `${Math.min(140, Math.max(44, input.scrollHeight))}px`;
  }, [composerValue]);

  useEffect(() => {
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  function submitComposer() {
    const nextMessage = (composerRef.current?.value ?? composerValue).trim();
    if (sending || !nextMessage) return;
    if (nextMessage !== composerValue) setComposerValue(nextMessage);
    void sendMessage(nextMessage);
  }

  function applyTool(tool: typeof COMPOSER_TOOLS[number]) {
    const project = currentProject?.name ?? 'this project';
    const prompts: Record<typeof COMPOSER_TOOLS[number], string> = {
      Files: `Use files from ${project} and `,
      Commands: '/',
      Projects: `Use ${project} context to `,
      Mentions: '@',
    };
    setComposerValue(prompts[tool]);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  return (
    <div className="nl-studio-panel">
      <section className="nl-chat-surface">
        <header className="nl-studio-header">
          <div>
            <div className="nl-kicker">Super AgentOS</div>
            <h1>{session?.title ?? 'Super AgentOS'}</h1>
            <div className="nl-chat-meta">
              <span>{sending ? 'Running' : 'Ready'}</span>
              <span>{messages.length} message{messages.length === 1 ? '' : 's'}</span>
              {currentProject ? <span>{currentProject.name}</span> : null}
            </div>
          </div>
          <div className="nl-recent-chats">
            <button type="button" className="nl-new-chat" onClick={() => void createSession()}>New Chat</button>
            {recentChats.length > 0 ? recentChats.map(chat => (
              <button
                key={chat.id}
                type="button"
                className={chat.id === session?.id ? 'active' : ''}
                onClick={() => selectSession(chat.id)}
              >
                {chat.title}
              </button>
            )) : <span>{browserSession?.agentName ? `Ready for ${browserSession.agentName}` : 'Ready'}</span>}
          </div>
        </header>

        <div className="nl-conversation" ref={conversationRef}>
          {messages.length === 0 ? (
            <div className="nl-empty-conversation">
              <span>Conversation</span>
              <strong>What would you like your Super AgentOS to do?</strong>
            </div>
          ) : messages.map(message => (
            <article key={message.id} className={`nl-message ${message.role}`}>
              <div className="nl-message-role">{message.role === 'assistant' ? 'Super AgentOS' : 'You'}</div>
              <div className="nl-message-body">{renderContent(message.content)}</div>
              <div className="nl-message-actions">
                <button type="button" onClick={() => void navigator.clipboard?.writeText(message.content)}>Copy</button>
                {message.role === 'user' ? <button type="button" onClick={() => setComposerValue(message.content)}>Edit</button> : null}
                {message.role === 'user' ? <button type="button" onClick={() => void sendMessage(message.content)}>Retry</button> : null}
                {message.role === 'assistant' && lastUserMessage ? <button type="button" onClick={() => void sendMessage(lastUserMessage)}>Regenerate</button> : null}
              </div>
            </article>
          ))}

          {sending ? (
            <div className="nl-message assistant nl-streaming">
              <div className="nl-message-role">Super AgentOS</div>
              <div className="nl-message-body"><p>Working...</p></div>
              <div className="nl-message-actions">
                <button type="button" onClick={() => void stopGeneration()}>Stop</button>
              </div>
            </div>
          ) : null}

          {executions.length > 0 ? (
            <div className="nl-runtime-strip">
              {executions.slice(0, 3).map(execution => (
                <div key={execution.id}>
                  <span>{execution.title}</span>
                  <strong>{execution.status}</strong>
                  {(['pause', 'resume', 'retry', 'cancel'] as const).map(action => (
                    <button key={action} type="button" onClick={() => void requestExecutionAction(execution.id, action)}>{action}</button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div className="nl-suggestion-chips">
        {SUGGESTIONS.map(item => (
          <button key={item} type="button" onClick={() => setComposerValue(item)}>{item}</button>
        ))}
      </div>

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
            placeholder="Message Super AgentOS"
            rows={1}
          />
          <div className="nl-composer-footer">
            <div>
              {COMPOSER_TOOLS.map(tool => (
                <button key={tool} type="button" onClick={() => applyTool(tool)}>{tool}</button>
              ))}
            </div>
            <button type="button" className="nl-send" disabled={sending || !composerValue.trim()} aria-label="Send message" onClick={submitComposer}>
              {sending ? '...' : '^'}
            </button>
            {sending ? <button type="button" className="nl-stop" onClick={() => void stopGeneration()}>Stop</button> : null}
          </div>
        </form>
      </section>

      <style>{`
        .nl-studio-panel {
          min-height: 0;
          height: 100%;
          display: grid;
          grid-template-rows: minmax(0, 1fr) auto auto;
          overflow: hidden;
        }

        .nl-chat-surface {
          min-height: 0;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          overflow: hidden;
        }

        .nl-studio-header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(160px, 280px);
          gap: 12px;
          padding: 14px 18px 8px;
        }

        .nl-kicker {
          color: var(--text-tertiary);
          font-size: 0.78rem;
        }

        .nl-chat-meta {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 8px;
        }

        .nl-chat-meta span {
          min-height: 22px;
          display: inline-flex;
          align-items: center;
          padding: 0 7px;
          border: 1px solid var(--border);
          border-radius: 999px;
          color: var(--text-secondary);
          background: rgba(255,255,255,0.025);
          font-size: 0.72rem;
        }

        .nl-studio-header h1 {
          margin: 0;
          font-size: clamp(2rem, 4vw, 3.4rem);
          line-height: 1;
          letter-spacing: 0;
        }

        .nl-recent-chats {
          display: grid;
          gap: 4px;
          align-content: start;
        }

        .nl-recent-chats button,
        .nl-recent-chats span {
          min-height: 28px;
          padding: 0 8px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: rgba(255,255,255,0.018);
          color: var(--text-secondary);
          font-size: 0.78rem;
          text-align: left;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .nl-recent-chats button.active,
        .nl-recent-chats button:hover {
          color: var(--text-primary);
          border-color: rgba(20, 184, 166, 0.3);
          background: rgba(20, 184, 166, 0.1);
        }

        .nl-recent-chats .nl-new-chat {
          justify-content: center;
          color: var(--text-primary);
          border-color: rgba(20, 184, 166, 0.34);
          background: rgba(20, 184, 166, 0.13);
        }

        .nl-conversation {
          min-height: 0;
          height: 100%;
          padding: 8px 18px 12px;
          overflow: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .nl-empty-conversation {
          min-height: 75%;
          display: grid;
          align-content: center;
          gap: 10px;
          color: var(--text-secondary);
        }

        .nl-empty-conversation strong {
          max-width: 720px;
          color: var(--text-primary);
          font-size: clamp(1.8rem, 4vw, 3.4rem);
          line-height: 1.12;
          font-weight: 600;
        }

        .nl-message {
          max-width: 760px;
          display: grid;
          gap: 6px;
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: rgba(255,255,255,0.025);
        }

        .nl-message.user {
          align-self: flex-end;
          background: rgba(20, 184, 166, 0.11);
        }

        .nl-streaming {
          border-color: rgba(20, 184, 166, 0.3);
        }

        .nl-message-role {
          color: var(--text-tertiary);
          font-size: 0.72rem;
          text-transform: capitalize;
        }

        .nl-message-body {
          color: var(--text-primary);
          line-height: 1.55;
        }

        .nl-message-body p {
          margin: 0 0 8px;
        }

        .nl-message-code {
          margin: 0;
          padding: 10px;
          overflow: auto;
          border-radius: 7px;
          background: var(--code-bg);
          font-size: 0.8rem;
        }

        .nl-message-actions,
        .nl-runtime-strip div {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .nl-message-actions button,
        .nl-runtime-strip button,
        .nl-suggestion-chips button,
        .nl-composer-footer button {
          min-height: 26px;
          padding: 0 8px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.025);
          color: var(--text-secondary);
          font-size: 0.75rem;
          cursor: pointer;
        }

        .nl-runtime-strip {
          display: grid;
          gap: 6px;
          max-width: 760px;
        }

        .nl-runtime-strip div {
          padding: 8px 10px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: rgba(255,255,255,0.018);
        }

        .nl-runtime-strip span {
          min-width: 0;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .nl-suggestion-chips {
          display: flex;
          gap: 6px;
          padding: 8px 18px;
          overflow-x: auto;
          border-top: 1px solid var(--border);
        }

        .nl-composer-zone {
          display: grid;
          gap: 8px;
          padding: 10px 18px 14px;
          background: linear-gradient(180deg, rgba(7,17,25,0.78), var(--bg-primary));
        }

        .nl-approval-row {
          width: min(820px, 100%);
          justify-self: center;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 10px;
          border: 1px solid rgba(251, 191, 36, 0.24);
          border-radius: 8px;
          background: rgba(251, 191, 36, 0.08);
        }

        .nl-composer {
          width: min(860px, 100%);
          justify-self: center;
          display: grid;
          gap: 8px;
          padding: 10px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 18px;
          background: rgba(13, 23, 32, 0.96);
        }

        .nl-composer textarea {
          width: 100%;
          min-height: 44px;
          max-height: 140px;
          border: 0;
          outline: 0;
          resize: none;
          background: transparent;
          color: var(--text-primary);
          line-height: 1.5;
        }

        .nl-composer-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .nl-composer-footer > div {
          min-width: 0;
          display: flex;
          gap: 6px;
          overflow-x: auto;
        }

        .nl-send {
          width: 32px;
          height: 32px;
          flex: 0 0 32px;
          display: grid;
          place-items: center;
          border-color: rgba(20, 184, 166, 0.45) !important;
          background: var(--accent) !important;
          color: #021014 !important;
        }

        .nl-send:disabled {
          background: rgba(255,255,255,0.06) !important;
          color: var(--text-tertiary) !important;
        }

        .nl-stop {
          border-color: rgba(248, 113, 113, 0.32) !important;
          color: #fecaca !important;
          background: rgba(127, 29, 29, 0.34) !important;
        }

        @media (max-width: 720px) {
          .nl-studio-header {
            grid-template-columns: minmax(0, 1fr);
            padding: 12px;
          }

          .nl-recent-chats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .nl-conversation,
          .nl-suggestion-chips,
          .nl-composer-zone {
            padding-left: 12px;
            padding-right: 12px;
          }

          .nl-studio-header h1 {
            font-size: 2rem;
          }
        }
      `}</style>
    </div>
  );
}
