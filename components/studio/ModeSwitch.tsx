'use client';

import type { StudioMode } from '@/src/studio/types';

export default function ModeSwitch(props: {
  mode: StudioMode;
  onChange: (mode: StudioMode) => void;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: 4,
        borderRadius: 999,
        border: '1px solid var(--border)',
        background: 'rgba(255,255,255,0.03)',
      }}
    >
      {(['nl', 'code'] as StudioMode[]).map(item => (
        <button
          key={item}
          type="button"
          onClick={() => props.onChange(item)}
          style={{
            minWidth: 92,
            minHeight: 38,
            borderRadius: 999,
            border: 'none',
            background: props.mode === item ? 'rgba(20, 184, 166, 0.22)' : 'transparent',
            color: props.mode === item ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          {item === 'nl' ? 'NL Studio' : 'Code Studio'}
        </button>
      ))}
    </div>
  );
}
