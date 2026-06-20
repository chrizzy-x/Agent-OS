'use client';

import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { Button, Card } from '@/components/os/ui';

export default function FfpPage() {
  return (
    <div style={{ minHeight: '100%' }}>
      <Nav activePath="/ffp" />
      <WorkspaceShell activePath="/ffp">
        <div style={{ minHeight: 'calc(100vh - 140px)', display: 'grid', placeItems: 'center' }}>
          <Card style={{ width: 'min(520px, 100%)', padding: 32, textAlign: 'center' }}>
            <div style={{ display: 'grid', gap: 14 }}>
              <div className="os-page-title">FFP</div>
              <div className="os-entity-title">The AgentOS Computer Layer</div>
              <h2 className="os-entity-title" style={{ margin: 0 }}>Coming Soon</h2>
              <Button disabled>Coming Soon</Button>
            </div>
          </Card>
        </div>
      </WorkspaceShell>
    </div>
  );
}
