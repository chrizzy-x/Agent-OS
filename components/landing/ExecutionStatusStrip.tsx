import type { CSSProperties } from 'react';
import { STATUS_DEMOS } from './constants';

export default function ExecutionStatusStrip() {
  return (
    <div className="agentos-status-strip agentos-liquid-glass" aria-hidden="true">
      {STATUS_DEMOS.map((status, index) => (
        <div
          key={status.lead}
          className="agentos-status-step"
          style={{ '--status-color': status.color, '--status-delay': `${index * 1.4}s` } as CSSProperties}
        >
          <span className="agentos-status-marker" />
          <span className="agentos-status-label">
            <strong>{status.lead}</strong>
            <em>{status.detail}</em>
          </span>
        </div>
      ))}
      <span className="agentos-status-complete">Task completed</span>
    </div>
  );
}
