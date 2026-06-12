'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/os/ui';
import { useStudio } from '@/components/studio/StudioProvider';

const SUGGESTIONS = ['Research', 'Build', 'Analyze', 'Trade', 'Create Workflow', 'Install App'];

type SearchMatch = {
  messageId: string;
  matchPositions: Array<{ start: number; end: number }>;
};

type MessageRecord = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
};

function renderMarkdown(content: string) {
  const parts = content.split(/(```[\s\S]*?```)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const raw = part.slice(3, -3);
      const firstNewline = raw.indexOf('\n');
      const language = firstNewline > 0 ? raw.slice(0, firstNewline).trim() : '';
      const code = firstNewline > 0 ? raw.slice(firstNewline + 1) : raw;
      return (
        <pre key={`code-${index}`} style={{ overflowX: 'auto', padding: 14, borderRadius: 12, background: 'rgba(15, 23, 42, 0.08)', border: '1px solid var(--border)', lineHeight: 1.5 }}>
          {language ? <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginBottom: 8 }}>{language}</div> : null}
          <code>{code}</code>
        </pre>
      );
    }

    return part.split(/\n{2,}/).map((block, blockIndex) => {
      const trimmed = block.trim();
      if (!trimmed) return null;
      if (trimmed.startsWith('# ')) return <h2 key={`h-${index}-${blockIndex}`} style={{ margin: '8px 0', fontSize: 22 }}>{trimmed.slice(2)}</h2>;
      if (trimmed.startsWith('## ')) return <h3 key={`h-${index}-${blockIndex}`} style={{ margin: '8px 0', fontSize: 18 }}>{trimmed.slice(3)}</h3>;
      if (/^[-*]\s+/m.test(trimmed)) {
        return (
          <ul key={`ul-${index}-${blockIndex}`} style={{ margin: '8px 0', paddingLeft: 22 }}>
            {trimmed.split('\n').map((line, lineIndex) => (
              <li key={`li-${lineIndex}`}>{line.replace(/^[-*]\s+/, '')}</li>
            ))}
          </ul>
        );
      }
      return <p key={`p-${index}-${blockIndex}`} style={{ margin: '8px 0' }}>{trimmed}</p>;
    });
  });
}

function MessageActions(props: {
  message: MessageRecord;
  onRetry: (content: string) => void;
  onEdit: (content: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
      <button type="button" onClick={() => void navigator.clipboard?.writeText(props.message.content)} style={actionStyle}>Copy</button>
      {props.message.role === 'user' ? (
        <>
          <button type="button" onClick={() => props.onRetry(props.message.content)} style={actionStyle}>Retry</button>
          <button type="button" onClick={() => props.onEdit(props.message.content)} style={actionStyle}>Edit</button>
        </>
      ) : null}
    </div>
  );
}

const actionStyle = {
  minHeight: 30,
  padding: '0 10px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'rgba(255,255,255,0.04)',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 12,
} as const;

function renderHighlightedContent(
  content: string,
  positions: Array<{ start: number; end: number }>,
  activeLocalIndex: number,
  messageId: string,
) {
  if (positions.length === 0) return content;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  positions.forEach((position, index) => {
    if (position.start > cursor) {
      nodes.push(<span key={`${messageId}-text-${cursor}`}>{content.slice(cursor, position.start)}</span>);
    }
    nodes.push(
      <mark
        key={`${messageId}-match-${position.start}-${index}`}
        data-search-hit={`${messageId}:${index}`}
        style={{
          background: index === activeLocalIndex ? 'rgba(20, 184, 166, 0.45)' : 'rgba(250, 204, 21, 0.34)',
          color: 'inherit',
          padding: 0,
          borderRadius: 4,
        }}
      >
        {content.slice(position.start, position.end)}
      </mark>,
    );
    cursor = position.end;
  });
  if (cursor < content.length) {
    nodes.push(<span key={`${messageId}-tail-${cursor}`}>{content.slice(cursor)}</span>);
  }
  return nodes;
}

const composerButtonStyle = {
  minHeight: 32,
  padding: '0 10px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 13,
  lineHeight: 1,
} as const;

export default function NLStudioPanel() {
  const {
    browserSession,
    session,
    messages,
    composerValue,
    setComposerValue,
    sendMessage,
    pendingApproval,
    approvePending,
    sending,
    executions,
    requestExecutionAction,
  } = useStudio();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [activeFlatMatchIndex, setActiveFlatMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);

  const matchBounds = useMemo(() => {
    const bounds = new Map<string, { start: number; count: number }>();
    let cursor = 0;
    for (const item of searchMatches) {
      bounds.set(item.messageId, { start: cursor, count: item.matchPositions.length });
      cursor += item.matchPositions.length;
    }
    return bounds;
  }, [searchMatches]);

  const totalMatchCount = useMemo(
    () => searchMatches.reduce((count, item) => count + item.matchPositions.length, 0),
    [searchMatches],
  );

  useEffect(() => {
    if (!searchOpen || !session?.id || !searchQuery.trim()) {
      setSearchMatches([]);
      setActiveFlatMatchIndex(0);
      return;
    }

    let active = true;
    void fetch(`/api/studio/sessions/${session.id}/search?q=${encodeURIComponent(searchQuery.trim())}`, {
      cache: 'no-store',
    })
      .then(async response => response.ok ? response.json() : { matches: [] })
      .then(payload => {
        if (!active) return;
        const matches = Array.isArray(payload.matches) ? payload.matches as SearchMatch[] : [];
        setSearchMatches(matches);
        setActiveFlatMatchIndex(0);
      })
      .catch(() => {
        if (!active) return;
        setSearchMatches([]);
        setActiveFlatMatchIndex(0);
      });

    return () => {
      active = false;
    };
  }, [searchOpen, searchQuery, session?.id]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      if (event.key === 'Escape' && searchOpen) {
        event.preventDefault();
        setSearchOpen(false);
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen || totalMatchCount === 0) return;
    const target = document.querySelectorAll('[data-search-hit]')[activeFlatMatchIndex] as HTMLElement | undefined;
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeFlatMatchIndex, searchOpen, totalMatchCount]);

  useEffect(() => {
    const input = composerInputRef.current;
    if (!input) return;
    input.style.height = '0px';
    input.style.height = `${Math.min(160, Math.max(44, input.scrollHeight))}px`;
  }, [composerValue]);

  function moveMatch(direction: 1 | -1) {
    if (totalMatchCount === 0) return;
    setActiveFlatMatchIndex(current => (current + direction + totalMatchCount) % totalMatchCount);
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchMatches([]);
    setActiveFlatMatchIndex(0);
  }

  function submitComposer() {
    if (sending || !composerValue.trim()) return;
    void sendMessage();
  }

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', minHeight: 0, height: '100%' }}>
      {searchOpen ? (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', gap: 10, alignItems: 'center' }}>
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  moveMatch(event.shiftKey ? -1 : 1);
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  closeSearch();
                }
              }}
              placeholder="Search this chat"
              style={{
                minHeight: 42,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.03)',
                color: 'inherit',
                padding: '0 12px',
                font: 'inherit',
              }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              {searchQuery.trim() ? `${Math.min(activeFlatMatchIndex + 1, totalMatchCount || 0)}/${totalMatchCount}` : '0/0'}
            </span>
            <Button variant="secondary" onClick={() => moveMatch(-1)}>Prev</Button>
            <Button variant="secondary" onClick={() => moveMatch(1)}>Next</Button>
          </div>
          {searchQuery.trim() && totalMatchCount === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No matches in this chat.</div>
          ) : null}
        </div>
      ) : null}

      <div style={{ minHeight: 0, overflow: 'auto', padding: 28, display: 'grid', gap: 20 }}>
        {messages.length === 0 ? (
          <div style={{ display: 'grid', gap: 20, alignContent: 'center', minHeight: '100%' }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ color: 'var(--text-secondary)' }}>
                Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'} {browserSession?.agentName ?? 'there'}
              </div>
              <h1 style={{ margin: 0, fontSize: 'clamp(34px, 5vw, 56px)', letterSpacing: 0 }}>
                What would you like your Super AgentOS to do?
              </h1>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {SUGGESTIONS.map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setComposerValue(item)}
                  style={{
                    minHeight: 42,
                    padding: '0 16px',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,0.03)',
                    color: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(message => {
            const positions = searchMatches.find(item => item.messageId === message.id)?.matchPositions ?? [];
            const bounds = matchBounds.get(message.id);
            const activeLocalIndex = bounds && activeFlatMatchIndex >= bounds.start && activeFlatMatchIndex < bounds.start + bounds.count
              ? activeFlatMatchIndex - bounds.start
              : -1;

            return (
              <article
                key={message.id}
                style={{
                  maxWidth: 840,
                  justifySelf: message.role === 'user' ? 'end' : 'start',
                  padding: '18px 20px',
                  borderRadius: 22,
                  background: message.role === 'user' ? 'rgba(20, 184, 166, 0.16)' : 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  lineHeight: 1.8,
                }}
              >
                {positions.length > 0
                  ? renderHighlightedContent(message.content, positions, activeLocalIndex, message.id)
                  : renderMarkdown(message.content)}
                <MessageActions
                  message={message}
                  onRetry={content => void sendMessage(content)}
                  onEdit={content => setComposerValue(content)}
                />
              </article>
            );
          })
        )}
        {executions.length > 0 ? (
          <div style={{ maxWidth: 840, display: 'grid', gap: 10 }}>
            {executions.slice(0, 4).map(execution => (
              <div key={execution.id} style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)', display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <strong>{execution.title}</strong>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{execution.status}</span>
                </div>
                {execution.failure ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    {String(execution.failure.whatFailed ?? execution.failure.why ?? 'Execution failed')}
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(['pause', 'resume', 'retry', 'cancel'] as const).map(action => (
                    <button key={action} type="button" onClick={() => void requestExecutionAction(execution.id, action)} style={actionStyle}>{action}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: '10px clamp(12px, 3vw, 24px) 14px', display: 'grid', gap: 10, background: 'var(--bg-primary)', zIndex: 2 }}>
        {pendingApproval ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 16,
              border: '1px solid rgba(251, 191, 36, 0.24)',
              background: 'rgba(251, 191, 36, 0.08)',
            }}
          >
            <span>{pendingApproval.reply}</span>
            <Button onClick={approvePending}>Approve</Button>
          </div>
        ) : null}
        <div
          style={{
            display: 'grid',
            gridTemplateRows: 'auto 34px',
            gap: 4,
            width: 'min(780px, 100%)',
            justifySelf: 'center',
            padding: '8px 10px 8px',
            borderRadius: 20,
            border: '1px solid rgba(148, 163, 184, 0.24)',
            background: 'rgba(255,255,255,0.055)',
            boxShadow: '0 14px 45px rgba(0,0,0,0.16)',
          }}
        >
          <textarea
            ref={composerInputRef}
            value={composerValue}
            onChange={event => setComposerValue(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submitComposer();
              }
            }}
            placeholder="Message your Super AgentOS"
            rows={1}
            style={{
              width: '100%',
              minHeight: 38,
              maxHeight: 132,
              border: 'none',
              outline: 'none',
              resize: 'none',
              overflowY: 'auto',
              background: 'transparent',
              color: 'inherit',
              font: 'inherit',
              lineHeight: 1.5,
              padding: '7px 6px 4px',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(true);
                  window.setTimeout(() => searchInputRef.current?.focus(), 0);
                }}
                style={composerButtonStyle}
              >
                Search
              </button>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Shift+Enter for newline
              </span>
            </div>
            <button
              type="button"
              aria-label={sending ? 'Super AgentOS is working' : 'Send message'}
              disabled={sending || !composerValue.trim()}
              onClick={submitComposer}
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                border: '1px solid rgba(20, 184, 166, 0.45)',
                background: sending || !composerValue.trim() ? 'rgba(255,255,255,0.08)' : 'var(--accent)',
                color: sending || !composerValue.trim() ? 'var(--text-tertiary)' : '#021014',
                cursor: sending || !composerValue.trim() ? 'default' : 'pointer',
                font: 'inherit',
                fontWeight: 800,
                lineHeight: 1,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {sending ? '...' : '↑'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
