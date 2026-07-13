import Image from 'next/image';
import Link from 'next/link';

export default function LandingNavigation({ entryHref, homeHref }: { entryHref: string; homeHref: string }) {
  return (
    <header className="agentos-landing-nav" aria-label="AgentOS landing navigation">
      <Link href="/" className="agentos-landing-brand" aria-label="AgentOS home">
        <Image src="/agentos-landing-mark.webp" alt="" width={42} height={42} priority />
        <span>AgentOS</span>
      </Link>
      <nav className="agentos-landing-links" aria-label="Landing links">
        <a href="#product-demo">Product</a>
        <Link href="/appstore">Appstore</Link>
        <Link href="/developer">Developers</Link>
      </nav>
      <div className="agentos-landing-actions">
        <Link href={homeHref} className="agentos-landing-home">
          Homepage
        </Link>
        <Link href={entryHref} className="agentos-landing-open">
          Open AgentOS
        </Link>
      </div>
    </header>
  );
}
