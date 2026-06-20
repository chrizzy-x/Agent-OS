import Link from 'next/link';
import { CSSProperties, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  style?: CSSProperties;
  fullWidth?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-outline',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

const sizeStyle: Record<Size, CSSProperties> = {
  sm: { padding: '6px 14px', fontSize: '0.8125rem' },
  md: { padding: '10px 20px', fontSize: '0.875rem' },
  lg: { padding: '14px 28px', fontSize: '1rem' },
};

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  href,
  onClick,
  disabled,
  loading,
  className = '',
  type = 'button',
  style,
  fullWidth,
}: ButtonProps) {
  const combinedStyle: CSSProperties = {
    ...sizeStyle[size],
    ...(fullWidth ? { width: '100%', justifyContent: 'center' } : {}),
    ...(disabled || loading ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' } : {}),
    ...style,
  };

  const cls = `${variantClass[variant]} ${className}`.trim();

  if (href) {
    return (
      <Link href={href} className={cls} style={combinedStyle}>
        {loading ? 'Loading...' : children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={cls}
      style={combinedStyle}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? 'Loading...' : children}
    </button>
  );
}
