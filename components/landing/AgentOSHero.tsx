import Image from 'next/image';
import AnimatedSignalField from './AnimatedSignalField';
import CommandDemonstration from './CommandDemonstration';
import ExecutionNode from './ExecutionNode';

const EXECUTION_NODES = [
  {
    title: 'Understand',
    body: 'Interprets the outcome.',
    tone: '#9D87FF',
    position: 'understand',
    delay: '1.1s',
  },
  {
    title: 'Plan',
    body: 'Breaks down the work.',
    tone: '#44A3FF',
    position: 'plan',
    delay: '2.3s',
  },
  {
    title: 'Execute',
    body: 'Uses apps, skills and tools.',
    tone: '#31C698',
    position: 'execute',
    delay: '3.5s',
  },
  {
    title: 'Deliver',
    body: 'Returns the finished result.',
    tone: '#FF806A',
    position: 'deliver',
    delay: '4.7s',
  },
] as const;

export default function AgentOSHero({ entryHref }: { entryHref: string }) {
  return (
    <main className="agentos-landing-main">
      <section className="agentos-landing-hero" aria-labelledby="agentos-landing-heading">
        <div className="agentos-super-badge">
          <span className="agentos-badge-spark" aria-hidden="true">✦</span>
          <span>Super AgentOS</span>
        </div>
        <h1 id="agentos-landing-heading" className="agentos-landing-headline">
          <span>One command.</span>
          <span className="agentos-gradient-line">Super AgentOS handles the task end to end.</span>
        </h1>
        <p className="agentos-landing-copy">
          Describe the outcome. Super AgentOS understands the goal, plans the work, uses the right capabilities and delivers the finished result.
        </p>
        <div id="product-demo" className="agentos-logo-stage" aria-label="Super AgentOS execution demonstration">
          <div className="agentos-logo-halo" aria-hidden="true" />
          <AnimatedSignalField />
          <div className="agentos-hero-logo-wrap">
            <Image
              src="/agentos-landing-hero.webp"
              alt="AgentOS visual identity"
              width={600}
              height={600}
              priority
              className="agentos-hero-logo"
            />
          </div>
          {EXECUTION_NODES.map(node => (
            <ExecutionNode
              key={node.title}
              title={node.title}
              body={node.body}
              tone={node.tone}
              position={node.position}
              delay={node.delay}
            />
          ))}
        </div>
        <CommandDemonstration entryHref={entryHref} />
      </section>
      <div className="agentos-landing-descriptor">The default doorway into AgentOS</div>
    </main>
  );
}
