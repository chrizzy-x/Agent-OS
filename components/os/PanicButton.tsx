'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Drawer } from '@/components/os/overlays';
import { Badge, Button, Card } from '@/components/os/ui';
import { fetchBrowserSessionState, fetchWithBrowserSession } from '@/src/auth/browser-session';

type PanicStatus = {
  state: 'healthy' | 'warning' | 'heavy_activity' | 'emergency';
  activeCount: number;
  mcpDisabled: boolean;
  vaultDisabled: boolean;
  requireReauth: boolean;
  available?: boolean;
};

type PanicContext = {
  workspaceId: string | null;
  sessionId: string | null;
};

const PANIC_EXCLUDED_PREFIXES = ['/', '/signin', '/signup', '/login', '/forgot-password'];

function isPanicExcludedPath(pathname: string): boolean {
  return PANIC_EXCLUDED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function readStoredContext(): PanicContext {
  if (typeof window === 'undefined') return { workspaceId: null, sessionId: null };
  try {
    const workspaceId = window.localStorage.getItem('agentos.shell.workspace');
    const sessionId = workspaceId ? window.localStorage.getItem(`agentos.shell.session.${workspaceId}`) : null;
    return { workspaceId, sessionId };
  } catch {
    return { workspaceId: null, sessionId: null };
  }
}

function tone(state: PanicStatus['state']): 'success' | 'warning' | 'danger' | 'accent' {
  if (state === 'healthy') return 'success';
  if (state === 'warning') return 'warning';
  if (state === 'heavy_activity') return 'accent';
  return 'danger';
}

function label(state: PanicStatus['state']): string {
  return state === 'heavy_activity' ? 'Heavy Activity' : state.replace(/^\w/, char => char.toUpperCase());
}

function fallbackStatus(): PanicStatus {
  return {
    state: 'healthy',
    activeCount: 0,
    mcpDisabled: false,
    vaultDisabled: false,
    requireReauth: false,
    available: false,
  };
}

function panicActionDisabledReason(status: PanicStatus, working: boolean): string | undefined {
  if (working) return 'A panic action is already running.';
  if (status.available === false) return 'Panic backend is unavailable. Refresh sign-in and workspace access, then retry.';
  if (status.activeCount === 0) return 'No active executions in this workspace/session.';
  return undefined;
}

export default function PanicButton({ workspaceId, sessionId }: { workspaceId?: string | null; sessionId?: string | null }) {
  const pathname = usePathname();
  const excluded = isPanicExcludedPath(pathname);
  const [status, setStatus] = useState<PanicStatus | null>(null);
  const [context, setContext] = useState<PanicContext>({ workspaceId: workspaceId ?? null, sessionId: sessionId ?? null });
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setContext({
      workspaceId: workspaceId ?? null,
      sessionId: sessionId ?? null,
    });
  }, [sessionId, workspaceId]);

  useEffect(() => {
    function syncStoredContext(event?: Event) {
      const detail = event instanceof CustomEvent && event.detail && typeof event.detail === 'object'
        ? event.detail as { workspaceId?: string | null; sessionId?: string | null }
        : null;
      if (detail) {
        setContext({
          workspaceId: workspaceId ?? detail.workspaceId ?? null,
          sessionId: sessionId ?? detail.sessionId ?? null,
        });
        return;
      }
      const stored = readStoredContext();
      setContext({
        workspaceId: workspaceId ?? stored.workspaceId,
        sessionId: sessionId ?? stored.sessionId,
      });
    }

    window.addEventListener('agentos:workspace-change', syncStoredContext);
    window.addEventListener('storage', syncStoredContext);
    return () => {
      window.removeEventListener('agentos:workspace-change', syncStoredContext);
      window.removeEventListener('storage', syncStoredContext);
    };
  }, [sessionId, workspaceId]);

  const refresh = useCallback(async () => {
    if (excluded) {
      setStatus(null);
      return;
    }
    const session = await fetchBrowserSessionState().catch(() => ({ state: 'signed_out' as const, session: null }));
    if (session.state !== 'active') {
      setStatus(null);
      return;
    }
    const query = new URLSearchParams();
    if (context.workspaceId) query.set('workspaceId', context.workspaceId);
    if (context.sessionId) query.set('sessionId', context.sessionId);
    const queryString = query.toString();
    const response = await fetchWithBrowserSession(`/api/panic${queryString ? `?${queryString}` : ''}`, { cache: 'no-store' }).catch(() => null);
    if (!response?.response.ok) {
      setStatus(fallbackStatus());
      setMessage('Panic backend is unavailable. Refresh sign-in and workspace access, then retry.');
      return;
    }
    const payload = await response.response.json() as PanicStatus;
    setStatus({ ...payload, available: true });
  }, [context.sessionId, context.workspaceId, excluded]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => window.clearInterval(timer);
  }, [excluded, refresh]);

  useEffect(() => {
    function handleOpen() {
      setOpen(true);
      void refresh();
    }

    window.addEventListener('agentos:open-panic', handleOpen);
    return () => window.removeEventListener('agentos:open-panic', handleOpen);
  }, [refresh]);

  async function run(action: 'pause' | 'stop_all' | 'lockdown') {
    if (!status) return;
    const disabledReason = panicActionDisabledReason(status, working);
    if (disabledReason) {
      setMessage(disabledReason);
      return;
    }
    setWorking(true);
    setMessage('');
    const result = await fetchWithBrowserSession('/api/panic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, workspaceId: context.workspaceId, sessionId: context.sessionId }),
    }).catch(() => null);
    if (!result?.response.ok) {
      const payload = await result?.response.json().catch(() => null) as { message?: string; error?: string } | null;
      setMessage(payload?.message ?? payload?.error ?? 'Panic action unavailable. Refresh sign-in and workspace access, then retry.');
    } else {
      setMessage(action === 'lockdown' ? 'Lockdown enabled.' : action === 'pause' ? 'Active runs paused.' : 'Active runs stopped.');
    }
    await refresh();
    setWorking(false);
  }

  if (excluded || !status) return null;

  const visibleStatus = status;
  const disabledReason = panicActionDisabledReason(visibleStatus, working);

  return (
    <>
      <button
        type="button"
        className={`panic-button ${visibleStatus.state}`}
        onClick={() => setOpen(true)}
        aria-label="Open PANIC kill switch"
      >
        <span className="panic-button-dot" aria-hidden="true" />
        <span className="panic-button-label">PANIC</span>
        <span className="panic-button-count">{visibleStatus.activeCount}</span>
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Panic Control"
        description="Pause, stop, or lock down active execution in the current workspace/session."
        size="sm"
      >
        <Card className="panic-control-card">
          <div className="os-entity-head">
            <div>
              <div className="os-entity-title">Execution state</div>
              <div className="os-entity-copy">{visibleStatus.activeCount} active execution{visibleStatus.activeCount === 1 ? '' : 's'}</div>
            </div>
            <Badge tone={tone(visibleStatus.state)}>{label(visibleStatus.state)}</Badge>
          </div>
        </Card>
        <Card>
          <div className="os-entity-copy">
            Current function: Panic pauses or stops active executions scoped to the active workspace/session. Lockdown also disables MCP and Vault runtime grants until re-authentication.
          </div>
        </Card>
        {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}
        <Card className="panic-action-card">
          <div className="panic-action-grid">
            <Button variant="secondary" onClick={() => void run('pause')} disabled={Boolean(disabledReason)} disabledReason={disabledReason}>Pause runs</Button>
            <Button variant="destructive" onClick={() => void run('stop_all')} disabled={Boolean(disabledReason)} disabledReason={disabledReason}>Stop all</Button>
            <Button variant="destructive" onClick={() => void run('lockdown')} disabled={Boolean(disabledReason)} disabledReason={disabledReason}>Lockdown</Button>
            <Button href="/mcp" variant="secondary">Diagnostics</Button>
          </div>
        </Card>
        <Card>
          <div className="os-drawer-stack">
            <div className="os-entity-head"><span className="os-entity-copy">MCP</span><Badge tone={visibleStatus.mcpDisabled ? 'danger' : 'success'}>{visibleStatus.mcpDisabled ? 'Disabled' : 'Enabled'}</Badge></div>
            <div className="os-entity-head"><span className="os-entity-copy">Vault grants</span><Badge tone={visibleStatus.vaultDisabled ? 'danger' : 'success'}>{visibleStatus.vaultDisabled ? 'Disabled' : 'Enabled'}</Badge></div>
            <div className="os-entity-head"><span className="os-entity-copy">Re-authentication</span><Badge tone={visibleStatus.requireReauth ? 'warning' : 'default'}>{visibleStatus.requireReauth ? 'Required' : 'Clear'}</Badge></div>
          </div>
        </Card>
      </Drawer>
    </>
  );
}
