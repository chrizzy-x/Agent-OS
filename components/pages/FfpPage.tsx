'use client';

import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { Badge, Card, PageHeader } from '@/components/os/ui';

export default function FfpPage() {
  return (
    <div style={{ minHeight: '100%' }}>
      <Nav activePath="/ffp" />
      <WorkspaceShell activePath="/ffp">
        <PageHeader
          eyebrow="FFP"
          title="Coming Soon"
          subtitle="Fabric Furge Protocol is visible in AgentOS but disabled. No routing, consensus, validator voting, proposal history, or activation control is available."
          actions={<Badge tone="default">Disabled</Badge>}
        />
        <Card>
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="os-entity-title">FFP Disabled</div>
            <div className="os-entity-copy">
              Multi-agent work continues through the Unified Execution Engine. Existing compatibility records are retained but ignored.
            </div>
          </div>
        </Card>
      </WorkspaceShell>
    </div>
  );
}
