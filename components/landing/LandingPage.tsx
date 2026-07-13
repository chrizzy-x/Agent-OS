import AgentOSHero from './AgentOSHero';
import { AGENTOS_ENTRY_ROUTE, AGENTOS_HOME_ROUTE } from './constants';
import LandingNavigation from './LandingNavigation';

export default function LandingPage() {
  return (
    <div className="agentos-landing-page">
      <LandingNavigation entryHref={AGENTOS_ENTRY_ROUTE} homeHref={AGENTOS_HOME_ROUTE} />
      <AgentOSHero entryHref={AGENTOS_ENTRY_ROUTE} homeHref={AGENTOS_HOME_ROUTE} />
    </div>
  );
}
