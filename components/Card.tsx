import { CSSProperties, ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  as?: 'div' | 'article' | 'section';
  style?: CSSProperties;
  onClick?: () => void;
}

export default function Card({
  children,
  className = '',
  hover = false,
  as: Tag = 'div',
  style,
  onClick,
}: CardProps) {
  return (
    <Tag
      className={`card ${hover ? 'card-hover' : ''} ${className}`.trim()}
      style={style}
      onClick={onClick}
    >
      {children}
      <style>{`
        .card-hover {
          cursor: default;
          transition: border-color 200ms ease, box-shadow 200ms ease;
        }
        .card-hover:hover {
          border-color: var(--border-active) !important;
          box-shadow: 0 0 0 1px var(--accent-glow), 0 0 20px var(--accent-glow) !important;
        }
      `}</style>
    </Tag>
  );
}
