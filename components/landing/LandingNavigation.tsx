import Image from 'next/image';
import Link from 'next/link';
import {
  AGENTOS_APPSTORE_ROUTE,
  AGENTOS_DEVELOPER_ROUTE,
  AGENTOS_NAV_MARK_ASSET,
  AGENTOS_WHITEPAPER_ROUTE,
} from './constants';

function ArrowIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path d="M5 13 13 5M7 5h6v6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

type LandingNavigationProps = {
  entryHref: string;
  homeHref: string;
  productHref?: string;
  activeItem?: 'whitepaper';
};

export default function LandingNavigation({
  entryHref,
  homeHref,
  productHref = '#product-demo',
  activeItem,
}: LandingNavigationProps) {
  return (
    <header className="agentos-landing-nav agentos-liquid-glass" aria-label="AgentOS landing navigation">
      <Link href="/" className="agentos-landing-brand" aria-label="AgentOS home">
        <Image src={AGENTOS_NAV_MARK_ASSET} alt="AgentOS" width={42} height={42} priority />
        <span>AgentOS</span>
      </Link>
      <nav className="agentos-landing-links" aria-label="Landing links">
        <Link href={productHref}>Product</Link>
        <Link href={AGENTOS_WHITEPAPER_ROUTE} aria-current={activeItem === 'whitepaper' ? 'page' : undefined}>
          Whitepaper
        </Link>
        <Link href={AGENTOS_APPSTORE_ROUTE}>Appstore</Link>
        <Link href={AGENTOS_DEVELOPER_ROUTE}>Developers</Link>
      </nav>
      <div className="agentos-landing-actions">
        <Link href={homeHref} className="agentos-landing-home">
          Homepage
        </Link>
        <Link href={entryHref} className="agentos-landing-open">
          <span>Open AgentOS</span>
          <ArrowIcon />
        </Link>
      </div>
    </header>
  );
}
