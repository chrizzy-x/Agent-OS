const SIGNALS = [
  {
    className: 'pink',
    stroke: '#FF69B4',
    d: 'M0 135 C120 42 190 220 315 125 S520 42 650 135 S890 210 1120 112',
  },
  {
    className: 'yellow',
    stroke: '#FFB53D',
    d: 'M0 118 C130 205 220 50 360 132 S560 220 700 118 S920 48 1120 142',
  },
  {
    className: 'red',
    stroke: '#FF5D55',
    d: 'M0 142 C120 62 230 198 360 120 S590 50 720 146 S930 205 1120 110',
  },
  {
    className: 'green',
    stroke: '#3ED2B7',
    d: 'M0 126 C120 210 230 48 350 138 S570 205 710 112 S940 55 1120 145',
  },
  {
    className: 'blue',
    stroke: '#4AA2FF',
    d: 'M0 139 C150 55 250 206 380 118 S600 52 740 144 S955 200 1120 116',
  },
] as const;

export default function AnimatedSignalField() {
  return (
    <svg
      className="agentos-signal-field"
      viewBox="0 0 1120 260"
      aria-hidden="true"
      focusable="false"
    >
      {SIGNALS.map(signal => (
        <path
          key={signal.className}
          className={`agentos-signal-line ${signal.className}`}
          d={signal.d}
          stroke={signal.stroke}
        />
      ))}
    </svg>
  );
}
