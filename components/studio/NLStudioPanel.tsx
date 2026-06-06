'use client';

import { Button } from '@/components/os/ui';
import { useStudio } from '@/components/studio/StudioProvider';

const SUGGESTIONS = ['Research', 'Build', 'Analyze', 'Trade', 'Create Workflow', 'Install App'];

export default function NLStudioPanel() {
  const {
    browserSession,
    messages,
    composerValue,
    setComposerValue,
    sendMessage,
    pendingApproval,
    approvePending,
    sending,
  } = useStudio();

  return (
    <div style={{ display: 'grid', gridTemplateRows: '1fr auto', minHeight: 0 }}>
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
          messages.map(message => (
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
              {message.content}
            </article>
          ))
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
          <Button onClick={() => void sendMessage()}>{sending ? 'Working...' : 'Send'}</Button>
        </div>
      </div>
    </div>
  );
}
