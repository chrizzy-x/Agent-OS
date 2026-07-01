import type { ReactNode } from 'react';

export default function SurfaceShell(props: {
  activePath: string;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="surface-shell" data-active-path={props.activePath}>
      <main className="surface-shell-main">
        {props.title ? (
          <header className="surface-shell-header">
            <div>
              <h1>{props.title}</h1>
              {props.subtitle ? (
                <p>{props.subtitle}</p>
              ) : null}
            </div>
            {props.actions ? <div className="surface-shell-actions">{props.actions}</div> : null}
          </header>
        ) : null}
        {props.children}
      </main>
    </div>
  );
}
