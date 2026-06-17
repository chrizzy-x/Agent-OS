'use client';

import type { StudioMode } from '@/src/studio/types';

const MODES: Array<{ key: StudioMode; label: string; short: string; icon: string; legacyLabel?: string }> = [
  { key: 'nl', label: 'NL Studio', short: 'NL', icon: 'N' },
  { key: 'workflow', label: 'Workflow Studio', short: 'Flow', icon: 'W' },
  { key: 'code', label: 'Terminal', short: 'Term', icon: 'T', legacyLabel: 'Code Studio' },
];

export default function ModeSwitch(props: {
  mode: StudioMode;
  onChange: (mode: StudioMode) => void;
}) {
  return (
    <div className="studio-mode-switch" role="tablist" aria-label="Studio mode">
      {MODES.map(item => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={props.mode === item.key}
          aria-label={item.legacyLabel ? `${item.label} (${item.legacyLabel})` : item.label}
          onClick={() => props.onChange(item.key)}
        >
          <span className="studio-mode-icon" aria-hidden="true">{item.icon}</span>
          <span className="studio-mode-full">{item.label}</span>
          <span className="studio-mode-short">{item.short}</span>
        </button>
      ))}
      <style>{`
        .studio-mode-switch {
          position: relative;
          display: inline-grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 3px;
          width: min(430px, 100%);
          padding: 4px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: rgba(255,255,255,0.026);
        }

        .studio-mode-switch button {
          min-width: 0;
          min-height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 0.82rem;
          font-weight: 700;
        }

        .studio-mode-switch button[aria-selected="true"] {
          color: var(--text-primary);
          background: rgba(20, 184, 166, 0.16);
          box-shadow: inset 0 0 0 1px rgba(20, 184, 166, 0.24), 0 8px 24px rgba(0,0,0,0.12);
        }

        .studio-mode-icon {
          width: 22px;
          height: 22px;
          display: inline-grid;
          place-items: center;
          border-radius: 7px;
          background: rgba(255,255,255,0.04);
          color: var(--text-tertiary);
          font-family: var(--font-mono), monospace;
          font-size: 0.68rem;
        }

        .studio-mode-switch button[aria-selected="true"] .studio-mode-icon {
          color: var(--text-primary);
          background: rgba(20, 184, 166, 0.18);
        }

        .studio-mode-short {
          display: none;
        }

        @media (max-width: 960px) {
          .studio-mode-switch {
            width: 100%;
          }

          .studio-mode-full {
            display: none;
          }

          .studio-mode-short {
            display: inline;
          }
        }
      `}</style>
    </div>
  );
}
