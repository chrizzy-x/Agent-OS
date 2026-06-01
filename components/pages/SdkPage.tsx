'use client';

import { useCallback, useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import { fetchBrowserSession, type BrowserSession } from '@/src/auth/browser-session';
import {
  ActivityFeed,
  AppShell,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  SidebarNav,
  SidebarSection,
} from '@/components/os/ui';

type Credential = {
  id: string;
  name: string;
  publicRef: string;
  scopes: string[];
  status: string;
  expiresAt: string | null;
};

type Kernel = {
  product: string;
  command_topic?: string;
  status_topic?: string;
  status?: string;
  last_heartbeat_at?: string | null;
};

export default function SdkPage() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [kernels, setKernels] = useState<Kernel[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = await fetchBrowserSession().catch(() => null);
      setSession(current);
      if (!current) return;
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

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/sdk" />
      <AppShell
        activePath="/sdk"
        sidebar={(
          <SidebarSection title="SDK">
            <SidebarNav
              items={[
                { href: '/studio', label: 'Studio' },
                { href: '/sdk', label: 'SDK', active: true },
                { href: '/developer', label: 'Developer' },
                { href: '/appstore', label: 'Apps' },
              ]}
            />
          </SidebarSection>
        )}
        aside={(
          <SidebarSection title="Summary">
            <div style={{ display: 'grid', gap: 10 }}>
              <Badge tone={enterprise ? 'accent' : 'default'}>{enterprise ? 'Enterprise SDK enabled' : 'Retail access blocked'}</Badge>
              <div className="os-entity-copy">Credentials: {credentials.length}</div>
              <div className="os-entity-copy">Registered apps: {kernels.length}</div>
            </div>
          </SidebarSection>
        )}
      >
        <PageHeader
          eyebrow="SDK"
          title="SDK access"
          subtitle="Developer credentials, registered SDK apps, and kernel health."
          actions={<Button href="/developer">Open Developer Console</Button>}
        />

        {loading ? <LoadingState label="Loading SDK" /> : !session ? (
          <EmptyState title="Sign in required" body="Sign in to manage SDK credentials and app registrations." action={<Button href="/signin">Sign in</Button>} />
        ) : !enterprise ? (
          <EmptyState title="Enterprise access required" body="Retail workspaces cannot access SDK credentials, registrations, or publishing." action={<Button href="/studio">Open Studio</Button>} />
        ) : (
          <>
            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>SDK credentials</div>
              {credentials.length === 0 ? (
                <div className="os-empty-body">No SDK credentials yet.</div>
              ) : (
                <ActivityFeed items={credentials.map(credential => ({
                  id: credential.id,
                  title: credential.name,
                  subtitle: `${credential.publicRef} · ${credential.scopes.join(', ') || 'kernel'}`,
                  status: credential.status,
                  time: credential.expiresAt ? `Expires ${new Date(credential.expiresAt).toLocaleString()}` : 'No expiry',
                }))} />
              )}
            </Card>

            <Card>
              <div className="os-entity-title" style={{ marginBottom: 12 }}>Registered SDK apps</div>
              {kernels.length === 0 ? (
                <div className="os-empty-body">No SDK apps registered yet.</div>
              ) : (
                <ActivityFeed items={kernels.map(kernel => ({
                  id: kernel.product,
                  title: kernel.product,
                  subtitle: `${kernel.command_topic ?? 'command topic'} · ${kernel.status_topic ?? 'status topic'}`,
                  status: kernel.status,
                  time: kernel.last_heartbeat_at ? new Date(kernel.last_heartbeat_at).toLocaleString() : 'No heartbeat yet',
                }))} />
              )}
            </Card>
          </>
        )}
      </AppShell>
    </div>
  );
}
