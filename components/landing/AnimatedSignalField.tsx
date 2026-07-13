import type { CSSProperties } from 'react';

const SIGNALS = [
  {
    className: 'pink',
    stroke: '#F04491',
    d: 'M0 177 C145 52 260 258 410 154 S675 52 825 176 S1110 260 1400 128',
  },
  {
    className: 'yellow',
    stroke: '#FFCA57',
    d: 'M0 150 C160 260 280 58 455 172 S700 275 875 150 S1160 58 1400 178',
  },
  {
    className: 'orange',
    stroke: '#FF6B50',
    d: 'M0 188 C150 86 290 248 452 152 S745 70 906 190 S1180 260 1400 132',
  },
  {
    className: 'cyan',
    stroke: '#5EE5DD',
    d: 'M0 162 C150 262 290 64 442 178 S720 260 895 140 S1175 70 1400 184',
  },
  {
    className: 'blue',
    stroke: '#4AA2FF',
    d: 'M0 182 C190 70 320 258 480 148 S760 72 930 188 S1195 252 1400 140',
  },
  {
    className: 'violet',
    stroke: '#9279FF',
    d: 'M0 132 C165 56 300 220 472 142 S740 58 910 162 S1170 232 1400 108',
  },
] as const;

export default function AnimatedSignalField({ className = '', refracted = false }: { className?: string; refracted?: boolean }) {
  return (
    <svg
      className={`agentos-signal-field ${className} ${refracted ? 'refracted' : ''}`}
      viewBox="0 0 1400 340"
      aria-hidden="true"
      focusable="false"
    >
      {SIGNALS.map((signal, index) => (
        <g key={signal.className} className={`agentos-signal-group ${signal.className}`} style={{ '--signal-delay': `${index * -0.7}s` } as CSSProperties}>
          <path className="agentos-signal-line-blur" d={signal.d} stroke={signal.stroke} />
          <path className="agentos-signal-line" d={signal.d} stroke={signal.stroke} />
          {!refracted ? (
            <circle className="agentos-signal-particle" r="3.4" fill={signal.stroke}>
              <animateMotion dur="7s" begin={`${index * 0.4}s`} repeatCount="indefinite" path={signal.d} />
            </circle>
          ) : null}
        </g>
      ))}
    </svg>
  );
}
