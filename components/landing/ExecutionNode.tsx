type ExecutionNodeProps = {
  title: string;
  body: string;
  tone: string;
  position: 'understand' | 'plan' | 'execute' | 'deliver';
  delay: string;
};

export default function ExecutionNode({ title, body, tone, position, delay }: ExecutionNodeProps) {
  return (
    <div
      className={`agentos-execution-node ${position}`}
      style={{ '--node-tone': tone, '--node-delay': delay } as CSSProperties}
    >
      <span className="agentos-execution-dot" aria-hidden="true" />
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}
import type { CSSProperties } from 'react';
