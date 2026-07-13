import type { CSSProperties } from 'react';

type ExecutionNodeProps = {
  title: string;
  body: string;
  tone: string;
  position: 'understand' | 'plan' | 'execute' | 'deliver';
  icon: 'target' | 'path' | 'bolt' | 'check';
  index: number;
};

function NodeIcon({ icon }: { icon: ExecutionNodeProps['icon'] }) {
  if (icon === 'path') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M4 5.5h4.2c2.2 0 3.3 1.1 3.3 3.1v2.8c0 2 1.1 3.1 3.3 3.1H16M4 14.5h3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <path d="m14 3.5 2.5 2-2.5 2M14 12.5l2.5 2-2.5 2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === 'bolt') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M11.5 2.8 4.8 11h4.8l-1 6.2 6.7-8.2h-4.8l1-6.2Z" fill="currentColor" />
      </svg>
    );
  }

  if (icon === 'check') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="m6.8 10.1 2.1 2.1 4.4-4.7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="10" cy="10" r="2.1" fill="currentColor" />
      <path d="M10 1.9v3M10 15.1v3M1.9 10h3M15.1 10h3" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

export default function ExecutionNode({ title, body, tone, position, icon, index }: ExecutionNodeProps) {
  return (
    <div
      className={`agentos-execution-node agentos-liquid-glass ${position}`}
      style={{ '--node-tone': tone, '--node-delay': `${0.6 + index * 1.4}s`, '--float-delay': `${index * -0.9}s` } as CSSProperties}
    >
      <span className="agentos-execution-icon" aria-hidden="true">
        <NodeIcon icon={icon} />
      </span>
      <span className="agentos-execution-copy">
        <strong>{title}</strong>
        <span>{body}</span>
      </span>
      <span className="agentos-execution-connector" aria-hidden="true" />
    </div>
  );
}
