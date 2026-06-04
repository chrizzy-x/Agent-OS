'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { ConfirmModal, Drawer } from '@/components/os/overlays';
import { useRouteDrawer } from '@/components/os/drawer-state';
import { resolveBrowserAccessState } from '@/src/auth/browser-access';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import {
  ActivityFeed,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  MetricCard,
  PageHeader,
} from '@/components/os/ui';

type Credential = {
  id: string;
  name: string;
  publicRef: string;
  scopes: string[];
  status: string;
  expiresAt: string | null;
  revokedAt?: string | null;
  createdAt?: string;
};

type Kernel = {
  product: string;
  command_topic?: string;
  status_topic?: string;
  status?: string;
  last_heartbeat_at?: string | null;
  discovery_status?: string;
  discovery_error?: string | null;
  app_slug?: string | null;
};

type DrawerId = 'credential-detail' | 'kernel-detail';

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : 'Not recorded';
}

export default function SdkPage() {
  const drawer = useRouteDrawer<DrawerId>();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [kernels, setKernels] = useState<Kernel[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScopes, setNewScopes] = useState('kernel.read');
  const [createdToken, setCreatedToken] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = await fetchBrowserSession().catch(() => null);
      setSession(current);
      if (!current) {
        setCredentials([]);
        setKernels([]);
        return;
      }
      const [credentialsRes, kernelsRes] = await Promise.all([
        fetch('/api/sdk/credentials', { cache: 'no-store' }).catch(() => null),
        fetch('/api/kernel/registry', { cache: 'no-store' }).catch(() => null),
      ]);
      if (credentialsRes?.ok) {
        const payload = await credentialsRes.json();
        setCredentials(payload.credentials ?? []);
      } else {
        setCredentials([]);
      }
      if (kernelsRes?.ok) {
        const payload = await kernelsRes.json();
        setKernels(payload.kernels ?? []);
      } else {
        setKernels([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const enterprise = session?.capabilities?.includes('access_sdk') === true;
  const accessState = resolveBrowserAccessState(session, loading, 'access_sdk');
  const selectedCredential = useMemo(
    () => credentials.find(item => item.id === drawer.current?.entityId) ?? null,
    [credentials, drawer.current?.entityId],
  );
  const selectedKernel = useMemo(
    () => kernels.find(item => item.product === drawer.current?.entityId) ?? null,
    [drawer.current?.entityId, kernels],
  );
  const recoveryNeeded = useMemo(
    () => kernels.filter(item => item.discovery_status === 'metadata_required' || item.discovery_status === 'hidden'),
    [kernels],
  );

  async function createCredential() {
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch('/api/sdk/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          scopes: newScopes.split(',').map(scope => scope.trim()).filter(Boolean),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? 'Credential created.' : payload.error ?? 'Create failed');
      if (response.ok) {
        setCreatedToken(typeof payload.token === 'string' ? payload.token : '');
        setNewName('');
        setNewScopes('kernel.read');
        await load();
      }
    } finally {
      setWorking(false);
    }
  }

  async function revokeCredential() {
    if (!selectedCredential) return;
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch(`/api/sdk/credentials?credentialId=${encodeURIComponent(selectedCredential.id)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      setMessage(response.ok ? 'Credential revoked.' : payload.error ?? 'Revoke failed');
      if (response.ok) {
        setRevokeConfirm(false);
        drawer.closeDrawer();
        await load();
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/sdk" />
      <WorkspaceShell
        activePath="/sdk"
        aside={(
          <Card>
            <div className="os-entity-title" style={{ marginBottom: 12 }}>Summary</div>
            <div className="os-drawer-stack">
              <Badge tone={enterprise ? 'accent' : 'default'}>
                {accessState === 'loading'
                  ? 'Checking SDK access'
                  : enterprise
                    ? 'Enterprise SDK enabled'
                    : accessState === 'signed_out'
                      ? 'Sign in required'
                      : 'Retail access blocked'}
              </Badge>
              <div className="os-entity-copy">Credentials: {credentials.length}</div>
              <div className="os-entity-copy">Registered apps: {kernels.length}</div>
              <div className="os-entity-copy">Recovery needed: {recoveryNeeded.length}</div>
            </div>
          </Card>
        )}
      >
        {accessState === 'allowed' ? (
          <PageHeader
            eyebrow="SDK"
            title="Credentials and app registrations"
            subtitle="Manage SDK keys, inspect registered apps, and recover legacy registrations from drawers."
            actions={<Button onClick={() => setCreateOpen(true)}>Create credential</Button>}
          />
        ) : accessState === 'signed_out' ? (
          <PageHeader eyebrow="SDK Access" title="Sign in required" subtitle="SDK credentials and registrations are available only after sign-in." />
        ) : accessState === 'blocked' ? (
          <PageHeader eyebrow="SDK Access" title="Enterprise access required" subtitle="Retail workspaces cannot access SDK credentials, registrations, or publishing." />
        ) : (
          <PageHeader eyebrow="SDK Access" title="Checking access" subtitle="Validating SDK permissions for this workspace." />
        )}

        {loading ? <LoadingState label="Loading SDK access" /> : !session ? (
          <EmptyState title="Sign in required" body="Sign in to manage SDK credentials and app registrations." action={<Button href="/signin">Sign in</Button>} />
        ) : !enterprise ? (
          <EmptyState title="Enterprise access required" body="Retail workspaces cannot access SDK credentials, registrations, or publishing." action={<Button href="/studio">Open Studio</Button>} />
        ) : (
          <div className="os-drawer-stack">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <MetricCard label="Credentials" value={credentials.length} />
              <MetricCard label="Active credentials" value={credentials.filter(item => item.status === 'active').length} />
              <MetricCard label="Registered apps" value={kernels.length} />
              <MetricCard label="Recovery needed" value={recoveryNeeded.length} />
            </div>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>SDK credentials</div>
              {credentials.length === 0 ? (
                <div className="os-empty-body">No SDK credentials yet.</div>
              ) : (
                <ActivityFeed items={credentials.map(credential => ({
                  id: credential.id,
                  title: credential.name,
                  subtitle: `${credential.publicRef} | ${credential.scopes.join(', ') || 'kernel.read'}`,
                  status: credential.status,
                  time: credential.expiresAt ? `Expires ${formatDate(credential.expiresAt)}` : 'No expiry',
                }))} />
              )}
              {credentials.length > 0 ? (
                <div className="os-inline-actions" style={{ marginTop: 12 }}>
                  {credentials.slice(0, 4).map(credential => (
                    <Button key={credential.id} variant="secondary" onClick={() => drawer.openDrawer('credential-detail', credential.id)}>Inspect {credential.name}</Button>
                  ))}
                </div>
              ) : null}
            </Card>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Registered SDK apps</div>
              {kernels.length === 0 ? (
                <div className="os-empty-body">No SDK apps registered yet.</div>
              ) : (
                <ActivityFeed items={kernels.map(kernel => ({
                  id: kernel.product,
                  title: kernel.product,
                  subtitle: `${kernel.command_topic ?? 'command topic'} | ${kernel.status_topic ?? 'status topic'}`,
                  status: kernel.status ?? kernel.discovery_status ?? 'unknown',
                  time: kernel.last_heartbeat_at ? formatDate(kernel.last_heartbeat_at) : 'No heartbeat yet',
                }))} />
              )}
              {kernels.length > 0 ? (
                <div className="os-inline-actions" style={{ marginTop: 12 }}>
                  {kernels.slice(0, 4).map(kernel => (
                    <Button key={kernel.product} variant="secondary" onClick={() => drawer.openDrawer('kernel-detail', kernel.product)}>Inspect {kernel.product}</Button>
                  ))}
                </div>
              ) : null}
            </Card>
          </div>
        )}

        {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}
      </WorkspaceShell>

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create SDK credential"
        description="New tokens are shown once. Copy the token immediately after creation."
        footer={<Button onClick={() => void createCredential()} disabled={working || !newName.trim()}>{working ? 'Working...' : 'Create credential'}</Button>}
      >
        <div className="os-drawer-stack">
          <Input value={newName} onChange={event => setNewName(event.target.value)} placeholder="Credential name" />
          <Input value={newScopes} onChange={event => setNewScopes(event.target.value)} placeholder="Scopes, comma separated" />
          {createdToken ? (
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Token</div>
              <div className="os-entity-copy">{createdToken}</div>
            </Card>
          ) : null}
        </div>
      </Drawer>

      <Drawer
        open={drawer.current?.id === 'credential-detail'}
        onClose={drawer.closeDrawer}
        title={selectedCredential?.name ?? 'Credential detail'}
        description="Scope, status, expiry, and revocation controls."
        routeSafe
        footer={selectedCredential?.status === 'active' ? <Button variant="danger" onClick={() => setRevokeConfirm(true)}>Revoke credential</Button> : undefined}
      >
        {!selectedCredential ? <EmptyState title="Credential unavailable" body="This credential could not be loaded." /> : (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-inline-actions">
                <Badge tone={selectedCredential.status === 'active' ? 'success' : 'warning'}>{selectedCredential.status}</Badge>
                <Badge tone="accent">{selectedCredential.publicRef}</Badge>
              </div>
              <div className="os-drawer-stack" style={{ marginTop: 12 }}>
                <div className="os-entity-copy">Scopes: {selectedCredential.scopes.join(', ') || 'kernel.read'}</div>
                <div className="os-entity-copy">Created: {formatDate(selectedCredential.createdAt)}</div>
                <div className="os-entity-copy">Expires: {formatDate(selectedCredential.expiresAt)}</div>
                <div className="os-entity-copy">Revoked: {formatDate(selectedCredential.revokedAt)}</div>
              </div>
            </Card>
          </div>
        )}
      </Drawer>

      <Drawer
        open={drawer.current?.id === 'kernel-detail'}
        onClose={drawer.closeDrawer}
        title={selectedKernel?.product ?? 'SDK app detail'}
        description="Registration health, discovery state, and legacy recovery detail."
        routeSafe
      >
        {!selectedKernel ? <EmptyState title="Registration unavailable" body="This SDK registration could not be loaded." /> : (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-inline-actions">
                <Badge tone={selectedKernel.status === 'online' ? 'success' : 'warning'}>{selectedKernel.status ?? 'unknown'}</Badge>
                <Badge tone="accent">{selectedKernel.discovery_status ?? 'unknown'}</Badge>
              </div>
              <div className="os-drawer-stack" style={{ marginTop: 12 }}>
                <div className="os-entity-copy">Command topic: {selectedKernel.command_topic ?? 'Missing'}</div>
                <div className="os-entity-copy">Status topic: {selectedKernel.status_topic ?? 'Missing'}</div>
                <div className="os-entity-copy">App slug: {selectedKernel.app_slug ?? 'Not indexed'}</div>
                <div className="os-entity-copy">Last heartbeat: {formatDate(selectedKernel.last_heartbeat_at)}</div>
              </div>
            </Card>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Recovery</div>
              <div className="os-entity-copy">{selectedKernel.discovery_error ?? 'No recovery action needed.'}</div>
              <div className="os-inline-actions" style={{ marginTop: 12 }}>
                <Button href="/developer/publish" variant="secondary">Open publishing</Button>
                <Button href="/developer">Open Developer Console</Button>
              </div>
            </Card>
          </div>
        )}
      </Drawer>

      {selectedCredential ? (
        <ConfirmModal
          open={revokeConfirm}
          onClose={() => setRevokeConfirm(false)}
          title={`Revoke ${selectedCredential.name}?`}
          body="This immediately disables the credential for runtime SDK access."
          confirmLabel="Revoke credential"
          tone="danger"
          busy={working}
          onConfirm={() => void revokeCredential()}
        />
      ) : null}
    </div>
  );
}
