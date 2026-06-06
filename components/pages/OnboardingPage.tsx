'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import {
  AppShell,
  Button,
  Card,
  FilterChips,
  Input,
  PageHeader,
  SidebarSection,
} from '@/components/os/ui';

const STEPS = ['Account', 'Workspace', 'Team', 'Integrations', 'Complete'];
const USE_CASES = ['Build AI apps', 'Automate workflows', 'Data analysis', 'Developer SDK', 'Other'];
const STARTERS = ['Blank Studio', 'Research Workspace', 'Workflow Builder', 'App Publisher'];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState('Account');
  const [workspaceName, setWorkspaceName] = useState('');
  const [useCase, setUseCase] = useState(USE_CASES[0]);
  const [starter, setStarter] = useState(STARTERS[0]);
  const [teamInput, setTeamInput] = useState('');
  const [integration, setIntegration] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function finish() {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceName,
          useCase,
          starter,
          team: teamInput,
          integration,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? 'Onboarding failed');
        return;
      }
      router.push(data.nextRoute ?? '/studio');
    } catch {
      setMessage('Onboarding failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Nav activePath="/studio" />
      <AppShell
        sidebar={(
          <SidebarSection title="Setup progress">
            <FilterChips items={STEPS} active={step} onChange={setStep} />
          </SidebarSection>
        )}
      >
        <PageHeader
          eyebrow="Onboarding"
          title="Get AgentOS ready"
          subtitle="Create your first workspace, choose a starter, and route directly into Studio."
        />

        <Card>
          {step === 'Account' ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <Input value={useCase} onChange={event => setUseCase(event.target.value)} placeholder="Primary use case" />
              <FilterChips items={USE_CASES} active={useCase} onChange={setUseCase} />
            </div>
          ) : null}

          {step === 'Workspace' ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <Input value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} placeholder="Workspace name" />
              <FilterChips items={STARTERS} active={starter} onChange={setStarter} />
            </div>
          ) : null}

          {step === 'Team' ? (
            <Input value={teamInput} onChange={event => setTeamInput(event.target.value)} placeholder="Invite teammates (optional)" />
          ) : null}

          {step === 'Integrations' ? (
            <Input value={integration} onChange={event => setIntegration(event.target.value)} placeholder="First integration (optional)" />
          ) : null}

          {step === 'Complete' ? (
            <div className="os-entity-copy">Workspace: {workspaceName || 'Default workspace'} · Starter: {starter} · Use case: {useCase}</div>
          ) : null}
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setStep(STEPS[Math.max(0, STEPS.indexOf(step) - 1)])}>Back</Button>
            {step === 'Complete'
              ? <Button onClick={() => void finish()}>{busy ? 'Finishing...' : 'Finish'}</Button>
              : <Button onClick={() => setStep(STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(step) + 1)])}>Next</Button>}
          </div>
          {message ? <div className="os-entity-copy" style={{ marginTop: 12 }}>{message}</div> : null}
        </Card>
      </AppShell>
    </div>
  );
}
