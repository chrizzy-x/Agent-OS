'use client';

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';

type ResponsiveSidebarProps = {
  label: string;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  panelStyle?: CSSProperties;
};

const MOBILE_MEDIA_QUERY = '(max-width: 960px)';

export default function ResponsiveSidebar({
  label,
  children,
  className = '',
  panelClassName = '',
  panelStyle,
}: ResponsiveSidebarProps) {
  const panelId = useId();
  const rootClassName = ['responsive-sidebar', className].filter(Boolean).join(' ');
  const sidebarPanelClassName = ['responsive-sidebar-panel', panelClassName].filter(Boolean).join(' ');
  const [isMobile, setIsMobile] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);

    const syncLayout = (matches: boolean) => {
      setIsMobile(matches);
      setOpen(!matches);
    };

    syncLayout(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      syncLayout(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const handleToggle = () => {
    if (!isMobile) {
      return;
    }
    setOpen(current => !current);
  };

  return (
    <div className={rootClassName} data-mobile={isMobile ? 'true' : 'false'} data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="responsive-sidebar-summary"
        aria-controls={panelId}
        aria-expanded={open}
        onClick={handleToggle}
      >
        <span>{label}</span>
        <span className="responsive-sidebar-summary-hint">{open ? 'Close' : 'Open'}</span>
      </button>
      <aside id={panelId} className={sidebarPanelClassName} style={panelStyle} hidden={isMobile && !open}>
        {children}
      </aside>
    </div>
  );
}
