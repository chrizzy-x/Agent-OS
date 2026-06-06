import type { ReactNode } from 'react';
import Nav from '@/components/Nav';

export default function SurfaceShell(props: {
  activePath: string;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Nav activePath={props.activePath} />
      <main className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
        {props.title ? (
          <header
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 16,
              marginBottom: 28,
            }}
          >
            <div style={{ maxWidth: 720 }}>
              <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 40px)', letterSpacing: '-0.04em' }}>{props.title}</h1>
              {props.subtitle ? (
                <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  {props.subtitle}
                </p>
              ) : null}
            </div>
            {props.actions ? <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{props.actions}</div> : null}
          </header>
        ) : null}
        {props.children}
      </main>
    </div>
  );
}
