'use client';

import Nav from '@/components/Nav';
import WorkspaceShell from '@/components/os/workspace-shell';
import { Badge, ComingSoonState, DisabledState, PageHeader } from '@/components/os/ui';

const sections = [
  ['Roadmap', 'Milestones for protocol activation, validator review, governance, and runtime integration.'],
  ['Documentation', 'Concept references for Fabric Furge Protocol compatibility records.'],
  ['Architecture', 'Planned routing between AgentOS execution, validators, and consensus history.'],
  ['Preview', 'Non-interactive preview only. No proposal execution or voting is available.'],
  ['Waitlist', 'Access requests are not open from this build.'],
  ['Future Vision', 'A future protocol layer for governed multi-agent coordination.'],
];

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
        <DisabledState
          title="FFP Disabled"
          body="Multi-agent work continues through the Unified Execution Engine. Existing compatibility records are retained but ignored."
          meta={<Badge tone="warning">No validator routing</Badge>}
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
