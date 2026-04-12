'use client';

import { useState } from 'react';

interface CodeBlockProps {
  code: string;
  language?: string;
  lineNumbers?: boolean;
  maxHeight?: string;
}

export default function CodeBlock({ code, language = 'typescript', lineNumbers = false, maxHeight }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const lines = code.split('\n');

  return (
    <div style={{
      position: 'relative',
      background: 'var(--code-bg)',
      border: '1px solid var(--code-border)',
      borderRadius: '4px',
      overflow: 'hidden',
      fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        borderBottom: '1px solid var(--code-border)',
        background: 'var(--bg-secondary)',
      }}>
        <span style={{
          fontSize: '11px',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
          textTransform: 'lowercase',
          letterSpacing: '0.02em',
        }}>{language}</span>
        <button
          onClick={handleCopy}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            color: copied ? 'var(--accent)' : 'var(--text-tertiary)',
            borderColor: copied ? 'var(--accent)' : 'var(--border)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
            padding: '3px 10px',
            cursor: 'pointer',
            borderRadius: '2px',
            transition: 'color 150ms, border-color 150ms',
          }}
        >
          {copied ? 'copied!' : 'copy'}
        </button>
      </div>

      {/* Code */}
      <div style={{
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        maxHeight: maxHeight,
        overflowY: maxHeight ? 'auto' : 'visible',
      }}>
        <pre style={{
          margin: 0,
          padding: '20px 24px',
          fontSize: '13px',
          lineHeight: '1.7',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
          whiteSpace: 'pre',
        }}>
          {lineNumbers ? (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i}>
                    <td style={{
                      paddingRight: '24px',
                      paddingLeft: '0',
                      color: 'var(--text-tertiary)',
                      fontSize: '12px',
                      userSelect: 'none',
                      verticalAlign: 'top',
                      lineHeight: '1.7',
                      textAlign: 'right',
                      minWidth: '32px',
                    }}>{i + 1}</td>
                    <td style={{ lineHeight: '1.7' }}>
                      <code style={{ fontFamily: 'inherit' }}>{line}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <code style={{ fontFamily: 'inherit' }}>{code}</code>
          )}
        </pre>
      </div>
    </div>
  );
}
