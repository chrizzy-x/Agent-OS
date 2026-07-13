import CommandDemonstration from './CommandDemonstration';
import ExecutionStatusStrip from './ExecutionStatusStrip';
import LandingDescriptorDroplet from './LandingDescriptorDroplet';
import LiquidGlassExecutionStage from './LiquidGlassExecutionStage';

function SparkleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path d="M9 1.8 10.7 7.3 16.2 9 10.7 10.7 9 16.2 7.3 10.7 1.8 9 7.3 7.3 9 1.8Z" fill="currentColor" />
    </svg>
  );
}

export default function AgentOSHero({ entryHref, homeHref }: { entryHref: string; homeHref: string }) {
  return (
    <main className="agentos-landing-main">
      <section className="agentos-landing-hero" aria-labelledby="agentos-landing-heading">
        <div className="agentos-super-badge">
          <SparkleMark />
          <span>Super AgentOS</span>
        </div>
        <h1 id="agentos-landing-heading" className="agentos-landing-headline">
          <span className="agentos-headline-primary">One command.</span>
          <span className="agentos-gradient-line">Super AgentOS handles the task end to end.</span>
        </h1>
        <p className="agentos-landing-copy">
          Describe the outcome. Super AgentOS understands the goal, plans the work, uses the right capabilities and delivers the finished result.
        </p>
        <LiquidGlassExecutionStage />
        <CommandDemonstration entryHref={entryHref} />
        <ExecutionStatusStrip />
        <div className="agentos-descriptor-row" aria-hidden="true">
          <LandingDescriptorDroplet tone="#9868F5" label="Built for everything you want to achieve." />
          <LandingDescriptorDroplet tone="#3D91F4" label="The default doorway into AgentOS" href={homeHref} />
        </div>
      </section>
    </main>
  );
}
