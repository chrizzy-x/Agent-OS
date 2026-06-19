'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { BrowserSession } from '@/src/auth/browser-session';

type WorkspaceRef = { id: string; name: string; plan?: string };
type SessionRef = {
  id: string;
  workspaceId: string;
  title: string;
  updatedAt: string;
  status?: string;
  branchLabel?: string | null;
};

type WorkspaceShellProps = {
  activePath: string;
  children: ReactNode;
  aside?: ReactNode;
  session?: BrowserSession | null;
  workspaces?: WorkspaceRef[];
  sessions?: SessionRef[];
  currentWorkspaceId?: string | null;
  currentSessionId?: string | null;
  extraSidebar?: ReactNode;
  mobileTitle?: string;
};

export default function WorkspaceShell(props: WorkspaceShellProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById('agentos-right-panel-slot'));
  }, []);

  return (
    <>
      {props.children}
      {target && props.aside ? createPortal(<div className="agentos-context-extra">{props.aside}</div>, target) : null}
    </>
  );
}
