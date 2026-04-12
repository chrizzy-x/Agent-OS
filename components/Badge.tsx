import { CSSProperties, ReactNode } from 'react';

type Variant = 'accent' | 'dim' | 'danger' | 'warning' | 'outline';

interface BadgeProps {
  variant?: Variant;
  children: ReactNode;
  dot?: boolean;
  className?: string;
  style?: CSSProperties;
}

const variantStyles: Record<Variant, CSSProperties> = {
  accent: {
    background: 'rgba(0, 255, 136, 0.08)',
    borderColor: 'rgba(0, 255, 136, 0.3)',
    color: 'var(--accent)',
  },
  dim: {
    background: 'var(--bg-tertiary)',
    borderColor: 'var(--border)',
    color: 'var(--text-secondary)',
  },
  danger: {
    background: 'rgba(255, 68, 68, 0.08)',
    borderColor: 'rgba(255, 68, 68, 0.3)',
    color: 'var(--danger)',
  },
  warning: {
    background: 'rgba(255, 170, 0, 0.08)',
    borderColor: 'rgba(255, 170, 0, 0.3)',
    color: 'var(--warning)',
  },
  outline: {
    background: 'transparent',
    borderColor: 'var(--border-active)',
    color: 'var(--text-secondary)',
  },
};

export default function Badge({ variant = 'dim', children, dot, className = '', style }: BadgeProps) {
  const baseStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.6875rem',
    fontWeight: 500,
    padding: '4px 10px',
    borderRadius: '2px',
    border: '1px solid',
    fontFamily: 'var(--font-mono), JetBrains Mono, monospace',
    lineHeight: 1,
    ...variantStyles[variant],
    ...style,
  };

  return (
    <span className={className} style={baseStyle}>
      {dot && (
        <span
          className="animate-dot"
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: 'currentColor',
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
}
