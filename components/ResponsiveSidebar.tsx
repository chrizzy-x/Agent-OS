import type { CSSProperties, ReactNode } from 'react';

type ResponsiveSidebarProps = {
  label: string;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  panelStyle?: CSSProperties;
};

export default function ResponsiveSidebar({
  label,
  children,
  className = '',
  panelClassName = '',
  panelStyle,
}: ResponsiveSidebarProps) {
  const rootClassName = ['responsive-sidebar', className].filter(Boolean).join(' ');
  const sidebarPanelClassName = ['responsive-sidebar-panel', panelClassName].filter(Boolean).join(' ');

  return (
    <details className={rootClassName}>
      <summary className="responsive-sidebar-summary">
        <span>{label}</span>
        <span className="responsive-sidebar-summary-hint">Toggle</span>
      </summary>
      <aside className={sidebarPanelClassName} style={panelStyle}>
        {children}
      </aside>
    </details>
  );
}
