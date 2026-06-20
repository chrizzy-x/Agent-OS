'use client';

import { useCallback, useEffect, useState } from 'react';
import { Drawer } from '@/components/os/overlays';
import { Badge, Button, Card } from '@/components/os/ui';
import { fetchBrowserSessionState, fetchWithBrowserSession } from '@/src/auth/browser-session';

type PanicStatus = {
  state: 'healthy' | 'warning' | 'heavy_activity' | 'emergency';
  activeCount: number;
  mcpDisabled: boolean;
  vaultDisabled: boolean;
  requireReauth: boolean;
};

type PanicContext = {
  workspaceId: string | null;
  sessionId: string | null;
};

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

export default function PanicButton({ workspaceId, sessionId }: { workspaceId?: string | null; sessionId?: string | null }) {
  const [status, setStatus] = useState<PanicStatus | null>(null);
  const [context, setContext] = useState<PanicContext>({ workspaceId: workspaceId ?? null, sessionId: sessionId ?? null });
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setContext({
      workspaceId: workspaceId ?? readStoredContext().workspaceId,
      sessionId: sessionId ?? readStoredContext().sessionId,
    });
  }, [sessionId, workspaceId]);

  useEffect(() => {
    function syncStoredContext() {
      setContext({
        workspaceId: workspaceId ?? readStoredContext().workspaceId,
        sessionId: sessionId ?? readStoredContext().sessionId,
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
      setStatus(null);
      return;
    }
    setStatus(await response.response.json() as PanicStatus);
  }, [context.sessionId, context.workspaceId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    function handleOpen() {
      setOpen(true);
      void refresh();
    }

    window.addEventListener('agentos:open-panic', handleOpen);
    return () => window.removeEventListener('agentos:open-panic', handleOpen);
  }, [refresh]);

  async function run(action: 'pause' | 'stop_all' | 'lockdown') {
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

  if (!status) return null;

  const visibleStatus = status;

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
        description="Stop, pause, or lock down active workspace execution"
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
        {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}
        <Card className="panic-action-card">
          <div className="panic-action-grid">
            <Button variant="secondary" onClick={() => void run('pause')} disabled={working}>Pause runs</Button>
            <Button variant="danger" onClick={() => void run('stop_all')} disabled={working}>Stop all</Button>
            <Button variant="danger" onClick={() => void run('lockdown')} disabled={working}>Lockdown</Button>
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
