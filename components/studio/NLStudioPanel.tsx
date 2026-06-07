'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/os/ui';
import { useStudio } from '@/components/studio/StudioProvider';

const SUGGESTIONS = ['Research', 'Build', 'Analyze', 'Trade', 'Create Workflow', 'Install App'];

type SearchMatch = {
  messageId: string;
  matchPositions: Array<{ start: number; end: number }>;
};

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
  } = useStudio();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [activeFlatMatchIndex, setActiveFlatMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: 0 }}>
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

      <div style={{ overflow: 'auto', padding: 28, display: 'grid', gap: 20 }}>
        {messages.length === 0 ? (
          <div style={{ display: 'grid', gap: 20, alignContent: 'center', minHeight: '100%' }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ color: 'var(--text-secondary)' }}>
                Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'} {browserSession?.agentName ?? 'there'}
              </div>
              <h1 style={{ margin: 0, fontSize: 'clamp(34px, 5vw, 56px)', letterSpacing: '-0.05em' }}>
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
                  whiteSpace: 'pre-wrap',
                }}
              >
                {renderHighlightedContent(message.content, positions, activeLocalIndex, message.id)}
              </article>
            );
          })
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: 20, display: 'grid', gap: 12 }}>
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
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 12,
            padding: 12,
            borderRadius: 22,
            border: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          <textarea
            value={composerValue}
            onChange={event => setComposerValue(event.target.value)}
            placeholder="Message your Super AgentOS"
            style={{
              width: '100%',
              minHeight: 92,
              border: 'none',
              outline: 'none',
              resize: 'none',
              background: 'transparent',
              color: 'inherit',
              font: 'inherit',
            }}
          />
          <div style={{ display: 'grid', gap: 10 }}>
            <Button variant="secondary" onClick={() => {
              setSearchOpen(true);
              window.setTimeout(() => searchInputRef.current?.focus(), 0);
            }}
            >
              Search
            </Button>
            <Button onClick={() => void sendMessage()}>{sending ? 'Working...' : 'Send'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
