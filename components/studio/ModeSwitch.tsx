'use client';

import type { StudioMode } from '@/src/studio/types';
import { STUDIO_MODES } from '@/src/studio/modes';

function ModeIcon({ icon }: { icon: string }) {
  if (icon === 'flow') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 6h3a4 4 0 0 1 4 4v4" />
        <path d="M7 18h3a4 4 0 0 0 4-4" />
        <path d="M17 10h1.5A2.5 2.5 0 0 1 21 12.5v0A2.5 2.5 0 0 1 18.5 15H17" />
        <circle cx="5" cy="6" r="2" />
        <circle cx="5" cy="18" r="2" />
        <circle cx="16" cy="12" r="2" />
      </svg>
    );
  }
  if (icon === 'code') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m9 8-4 4 4 4" />
        <path d="m15 8 4 4-4 4" />
        <path d="m13 5-2 14" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="m6.8 6.8 2.8 2.8" />
      <path d="m14.4 14.4 2.8 2.8" />
      <path d="m17.2 6.8-2.8 2.8" />
      <path d="m9.6 14.4-2.8 2.8" />
    </svg>
  );
}

export default function ModeSwitch(props: {
  mode: StudioMode;
  onChange: (mode: StudioMode) => void;
}) {
  return (
    <div className="studio-mode-switch" role="tablist" aria-label="Studio mode">
      {STUDIO_MODES.map(item => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={props.mode === item.key}
          aria-label={item.label}
          title={item.description}
          data-mode={item.key}
          onClick={() => props.onChange(item.key)}
        >
          <span className="studio-mode-icon" aria-hidden="true"><ModeIcon icon={item.icon} /></span>
          <span className="studio-mode-full">{item.label}</span>
          <span className="studio-mode-short">{item.shortLabel}</span>
        </button>
      ))}
      <style>{`
        .studio-mode-switch {
          position: relative;
          display: inline-grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 4px;
          width: min(430px, 100%);
          padding: 3px;
          border: 1px solid var(--border);
          border-radius: 14px;
          background: color-mix(in srgb, var(--bg-secondary) 72%, transparent);
        }

        .studio-mode-switch button {
          min-width: 0;
          min-height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: 0;
          border-radius: 11px;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 0.78rem;
          font-weight: 700;
        }

        .studio-mode-switch button[aria-selected="true"] {
          color: var(--text-primary);
          background: color-mix(in srgb, var(--accent) 17%, transparent);
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent), 0 8px 20px rgba(0,0,0,0.10);
        }

        .studio-mode-icon {
          width: 24px;
          height: 24px;
          display: inline-grid;
          place-items: center;
          border-radius: 8px;
          background: rgba(255,255,255,0.04);
          color: var(--text-tertiary);
        }

        .studio-mode-icon svg {
          width: 14px;
          height: 14px;
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
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

        @media (max-width: 520px) {
          .studio-mode-switch {
            gap: 4px;
            padding: 5px;
            border-radius: 14px;
          }

          .studio-mode-switch button {
            min-height: 36px;
            gap: 0;
            font-size: 0.8rem;
          }

          .studio-mode-icon {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
