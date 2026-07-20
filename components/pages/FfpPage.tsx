'use client';

import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { Badge, ComingSoonState, DisabledState, PageHeader } from '@/components/os/ui';

const sections = [
  ['Current State', 'FFP is visible for product continuity, but protocol execution is disabled.'],
  ['Compatibility Records', 'Historical compatibility fields may exist, but they are not active validator, proof, transaction, or consensus events.'],
  ['Architecture', 'Future routing may connect AgentOS execution to protocol primitives after a real backend exists.'],
  ['Preview', 'Non-interactive preview only. No proposal execution, proof routing, or voting is available.'],
  ['Activation', 'There is no user or admin control to enable FFP in this build.'],
  ['Future Role', 'A future protocol layer for governed multi-agent coordination.'],
];

export default function FfpPage() {
  return (
    <div style={{ minHeight: '100%' }}>
      <Nav activePath="/ffp" />
      <WorkspaceShell activePath="/ffp">
        <PageHeader
          eyebrow="FFP"
          title="FFP Disabled / Coming Soon"
          subtitle="Fabric Furge Protocol is visible in AgentOS but disabled. No active protocol routing, consensus, validator voting, proof events, transactions, proposal history, or activation control is available."
          actions={<Badge tone="default">Disabled</Badge>}
        />
        <DisabledState
          title="FFP is disabled"
          body="Multi-agent work continues through the Unified Execution Engine. AgentOS does not claim live FFP consensus, validator architecture, proof routing, decentralization, or transaction settlement in this build."
          meta={<Badge tone="warning">No active protocol</Badge>}
        />
        <div className="resources-main">
          {sections.map(([title, body]) => (
            <section key={title} className="resources-section">
              <h2>{title}</h2>
              <p>{body}</p>
              <ComingSoonState title="Coming soon" body="This FFP capability is documented as future work and is disabled in V6.6.8." />
            </section>
          ))}
        </div>
      </WorkspaceShell>
    </div>
  );
}
