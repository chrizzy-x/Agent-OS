'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  PageHeader,
} from '@/components/os/ui';
import {
  fetchBrowserSessionState,
  type BrowserSession,
  type BrowserSessionAuthState,
} from '@/src/auth/browser-session';

type OnboardingAction = {
  id: string;
  title: string;
  body: string;
  href?: string;
  primary?: boolean;
  disabledReason?: string;
  run?: () => void;
};

const onboardingSurfaces = [
  { label: 'Super AgentOS', href: '/studio?mode=nl', detail: 'primary command surface' },
  { label: 'Workspace', href: '/workspace', detail: 'context and files' },
  { label: 'Appstore', href: '/appstore', detail: 'apps' },
  { label: 'Skill Store', href: '/skillstore', detail: 'skills' },
  { label: 'Library', href: '/library', detail: 'installed assets' },
  { label: 'Vault', href: '/vault', detail: 'secrets' },
  { label: 'Workflows', href: '/workflows', detail: 'execution graphs' },
  { label: 'Subagents', href: '/subagents', detail: 'incognito operators' },
];

function ActionCard({ action, signedIn }: { action: OnboardingAction; signedIn: boolean }) {
  const disabledReason = !signedIn ? 'Sign in to run workspace setup.' : action.disabledReason;
  const button = action.run ? (
    <Button onClick={action.run} disabled={Boolean(disabledReason)} disabledReason={disabledReason} variant={action.primary ? 'primary' : 'secondary'}>
      {action.title}
    </Button>
  ) : (
    <Button href={signedIn && !disabledReason ? action.href : '/signin'} disabled={Boolean(signedIn && disabledReason)} disabledReason={disabledReason} variant={action.primary ? 'primary' : 'secondary'}>
      {!signedIn ? 'Sign in' : action.title}
    </Button>
  );

  return (
    <Card>
      <div className="os-drawer-stack">
        <div className="os-entity-head">
          <div className="os-entity-title">{action.title}</div>
          {action.primary ? <Badge tone="accent">first step</Badge> : null}
        </div>
        <div className="os-entity-copy">{action.body}</div>
        <div className="os-inline-actions">{button}</div>
      </div>
    </Card>
  );
}

function SurfaceRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="os-entity-head">
      <span className="os-entity-copy">{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [authState, setAuthState] = useState<BrowserSessionAuthState>('signed_out');
  const [loading, setLoading] = useState(true);
  const [workspaceName, setWorkspaceName] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void fetchBrowserSessionState()
      .then(state => {
        if (!active) return;
        setSession(state.session);
        setAuthState(state.state);
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setAuthState('signed_out');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const signedIn = Boolean(session);
  const enterprise = session?.accountType === 'enterprise' || session?.capabilities?.includes('access_sdk') === true;

  async function startChat() {
    setBusyAction('chat');
    setMessage('');
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceName,
          starter: 'NL Studio',
          useCase: enterprise ? 'Enterprise workspace setup' : 'Retail workspace usage',
        }),
      });
      const payload = await response.json().catch(() => ({})) as { nextRoute?: string; message?: string; error?: string };
      if (!response.ok || !payload.nextRoute) {
        setMessage(payload.message ?? payload.error ?? 'Workspace setup failed.');
        return;
      }
      router.push(payload.nextRoute);
    } catch {
      setMessage('Workspace setup failed.');
    } finally {
      setBusyAction(null);
    }
  }

  const retailActions = useMemo<OnboardingAction[]>(() => [
    {
      id: 'chat',
      title: busyAction === 'chat' ? 'Opening chat...' : 'Start a chat',
      body: 'Open Super AgentOS in NL Studio with your current workspace context.',
      primary: true,
      run: startChat,
      disabledReason: busyAction ? 'Opening Studio now.' : undefined,
    },
    {
      id: 'project',
      title: 'Create a project',
      body: 'Create a durable project for chats, files, workflows, apps, skills, and subagents.',
      href: '/projects?create=1',
    },
    {
      id: 'app',
      title: 'Install an app',
      body: 'Browse Appstore listings and add apps to Library when real install support is available for the listing.',
      href: '/appstore',
    },
    {
      id: 'skill',
      title: 'Install a skill',
      body: 'Browse Skill Store capabilities and install skills that Super AgentOS can use.',
      href: '/skillstore',
    },
    {
      id: 'subagent',
      title: 'Create a subagent',
      body: 'Create a private operator with instructions, scope, skills, and workspace permissions.',
      href: '/subagents?create=1',
    },
    {
      id: 'tool',
      title: 'Connect a tool',
      body: 'Open Universal MCP to inspect connector health and external tool availability.',
      href: '/mcp',
    },
  ], [busyAction, enterprise, workspaceName]);

  const enterpriseActions = useMemo<OnboardingAction[]>(() => [
    {
      id: 'developer',
      title: 'Open Developer Console',
      body: 'Manage enterprise app, skill, media, analytics, SDK, webhook, and publishing setup.',
      href: enterprise ? '/developer' : undefined,
      disabledReason: enterprise ? undefined : 'Enterprise Plus or Enterprise Max is required.',
    },
    {
      id: 'sdk',
      title: 'Set up SDK access',
      body: 'Review SDK credentials, bearer-token access, app registration, and publishing requirements.',
      href: enterprise ? '/sdk' : undefined,
      disabledReason: enterprise ? undefined : 'SDK access requires Enterprise Plus or Enterprise Max.',
    },
    {
      id: 'app-publish',
      title: 'Create app listing',
      body: 'Prepare SDK app metadata, permissions, visuals, compatibility, and pricing fields.',
      href: enterprise ? '/publish/app' : undefined,
      disabledReason: enterprise ? undefined : 'App publishing is enterprise-gated.',
    },
    {
      id: 'skill-publish',
      title: 'Create skill listing',
      body: 'Prepare skill metadata, examples, supported surfaces, permissions, and test invocation.',
      href: enterprise ? '/publish/skill' : undefined,
      disabledReason: enterprise ? undefined : 'Skill publishing is enterprise-gated.',
    },
  ], [enterprise]);

  return (
    <div className="onboarding-page os-drawer-stack">
        <PageHeader
          eyebrow="First Run"
          title="Set Up AgentOS"
          subtitle="Pick a first action. Every path keeps Super AgentOS connected to workspace context, Library assets, Vault permissions, workflows, subagents, and Universal MCP."
          actions={<Button href="/studio?mode=nl" variant="secondary">Skip to Studio</Button>}
        />

        <div className="onboarding-overview-grid">
          <Card>
            <div className="os-drawer-stack">
              <div className="os-entity-title">First Run Surfaces</div>
              <div className="os-entity-copy">These are the operating surfaces introduced during setup. They stay available in the global AgentOS navigation.</div>
              <div className="onboarding-surface-grid">
                {onboardingSurfaces.map(surface => (
                  <Button key={surface.href} href={surface.href} variant="secondary" title={surface.detail}>
                    {surface.label}
                  </Button>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <div className="os-drawer-stack">
              <div className="os-entity-title">Session</div>
              <SurfaceRow label="Auth">{authState === 'active' ? 'Signed in' : authState === 'expired' ? 'Expired' : 'Signed out'}</SurfaceRow>
              <SurfaceRow label="Plan">{session?.planLabel ?? 'Not loaded'}</SurfaceRow>
              <SurfaceRow label="Intent">{enterprise ? 'Enterprise' : 'Retail'}</SurfaceRow>
            </div>
          </Card>
        </div>

        {loading ? <LoadingState label="Loading onboarding" /> : null}

        {!loading && !signedIn ? (
          <EmptyState
            title={authState === 'expired' ? 'Session expired' : 'Sign in required'}
            body={authState === 'expired' ? 'Sign in again to finish first-run setup.' : 'Create an account or sign in to run workspace setup.'}
            action={<Button href={authState === 'expired' ? '/signin' : '/signup'}>{authState === 'expired' ? 'Sign in again' : 'Create account'}</Button>}
          />
        ) : null}

        {!loading && signedIn ? (
          <div className="os-drawer-stack">
            <Card>
              <div className="os-drawer-stack">
                <div className="os-entity-title">Workspace Context</div>
                <Input
                  value={workspaceName}
                  onChange={event => setWorkspaceName(event.target.value)}
                  placeholder="Workspace name (optional)"
                  aria-label="Workspace name"
                />
                <div className="os-entity-copy">Leave blank to use the workspace created during signup.</div>
              </div>
            </Card>

            <div className="settings-plan-grid">
              {retailActions.map(action => <ActionCard key={action.id} action={action} signedIn={signedIn} />)}
            </div>

            <Card>
              <div className="os-drawer-stack">
                <div className="os-entity-head">
                  <div className="os-entity-title">Enterprise Setup</div>
                  <Badge tone={enterprise ? 'accent' : 'warning'}>{enterprise ? 'available' : 'upgrade required'}</Badge>
                </div>
                <div className="os-entity-copy">SDK, app publishing, and skill publishing stay separate from retail workspace usage.</div>
              </div>
            </Card>

            <div className="settings-plan-grid">
              {enterpriseActions.map(action => <ActionCard key={action.id} action={action} signedIn={signedIn} />)}
            </div>
          </div>
        ) : null}

        {message ? <Card><div className="os-entity-copy">{message}</div></Card> : null}
    </div>
  );
}
