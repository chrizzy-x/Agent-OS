import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import LandingNavigation from '@/components/landing/LandingNavigation';
import {
  AGENTOS_ENTRY_ROUTE,
  AGENTOS_HOME_ROUTE,
  AGENTOS_WHITEPAPER_PDF_GITHUB_URL,
} from '@/components/landing/constants';
import { AGENTOS_WHITEPAPER_MARKDOWN } from './content';
import styles from './whitepaper.module.css';

export const metadata: Metadata = {
  title: 'AgentOS Whitepaper — The Operating Ecosystem for Autonomous Intelligence',
  description: 'Read the complete AgentOS strategic and technical whitepaper, including architecture, security, economics, model research and the delivery roadmap.',
  openGraph: {
    title: 'AgentOS Whitepaper',
    description: 'The operating ecosystem for autonomous intelligence.',
    url: '/whitepaper',
    type: 'article',
    images: [{ url: '/agentos-landing-hero.webp', width: 600, height: 600, alt: 'AgentOS' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AgentOS Whitepaper',
    description: 'The operating ecosystem for autonomous intelligence.',
    images: ['/agentos-landing-hero.webp'],
  },
};

const CONTENTS = [
  ['document-status-and-claim-discipline', 'Status and claim discipline'],
  ['abstract', 'Abstract'],
  ['executive-summary', 'Executive summary'],
  ['1-vision-and-market-thesis', '1. Vision and market thesis'],
  ['2-product-definition-and-principles', '2. Product definition'],
  ['3-system-architecture', '3. System architecture'],
  ['4-super-agentos-and-intelligence-modes', '4. Intelligence modes'],
  ['5-core-product-components', '5. Product components'],
  ['6-execution-safety-and-security', '6. Safety and security'],
  ['7-developer-and-ecosystem-architecture', '7. Developer ecosystem'],
  ['8-business-model-and-agent-credits', '8. Business model'],
  ['9-sagent-utility-and-economic-policy', '9. $sAGENT policy'],
  ['10-ffp-future-verification-fabric', '10. FFP'],
  ['11-proprietary-model-research-programme', '11. Model research'],
  ['12-roadmap-and-delivery-gates', '12. Roadmap'],
  ['13-adoption-strategy', '13. Adoption'],
  ['14-governance-metrics-and-operations', '14. Governance'],
  ['15-risks-and-mitigations', '15. Risks'],
  ['16-legal-and-regulatory-position', '16. Legal position'],
  ['17-conclusion', '17. Conclusion'],
] as const;

function slugify(value: ReactNode) {
  return String(value)
    .toLowerCase()
    .replace(/\$sagent/g, 'sagent')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const markdownComponents: Components = {
  h1: ({ children }) => <h2 id={slugify(children)}>{children}</h2>,
  h2: ({ children }) => <h3 id={slugify(children)}>{children}</h3>,
  h3: ({ children }) => <h4 id={slugify(children)}>{children}</h4>,
  a: ({ href, children }) => {
    const external = Boolean(href?.startsWith('http'));
    return (
      <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
        {children}
      </a>
    );
  },
};

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M4 16h12" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11m0 0-4-4m4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

export default function WhitepaperPage() {
  return (
    <div className={`agentos-landing-page agentos-whitepaper-root ${styles.page}`}>
      <LandingNavigation
        entryHref={AGENTOS_ENTRY_ROUTE}
        homeHref={AGENTOS_HOME_ROUTE}
        productHref="/#product-demo"
        activeItem="whitepaper"
      />

      <main>
        <section className={styles.hero} aria-labelledby="whitepaper-title">
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Official AgentOS publication · Version 1.0 · July 2026</span>
            <h1 id="whitepaper-title">The operating ecosystem for autonomous intelligence.</h1>
            <p>
              The complete strategic and technical definition of AgentOS: product thesis, Super AgentOS architecture,
              security boundaries, developer economy, $sAGENT policy, proprietary-model research and the delivery roadmap.
            </p>
            <div className={styles.heroActions}>
              <Link href="#whitepaper-document" className={styles.primaryAction}>
                <span>Read the whitepaper</span>
                <ArrowIcon />
              </Link>
              <a
                href={AGENTOS_WHITEPAPER_PDF_GITHUB_URL}
                className={styles.secondaryAction}
                target="_blank"
                rel="noreferrer"
                aria-label="Download the AgentOS whitepaper PDF from GitHub"
              >
                <DownloadIcon />
                <span>Download PDF on GitHub</span>
              </a>
            </div>
            <p className={styles.downloadNote}>The PDF is hosted and downloadable exclusively through the official AgentOS GitHub repository.</p>
          </div>

          <div className={styles.coverWrap} aria-hidden="true">
            <div className={styles.cover}>
              <span className={styles.coverBrand}>AGENTOS</span>
              <strong>Whitepaper</strong>
              <p>The Operating Ecosystem for Autonomous Intelligence</p>
              <div className={styles.coverLine} />
              <div className={styles.coverFlow}>
                <span>Understand</span><span>Plan</span><span>Authorize</span><span>Execute</span><span>Verify</span><span>Deliver</span>
              </div>
              <small>Version 1.0 · July 2026</small>
            </div>
          </div>
        </section>

        <section className={styles.readerShell}>
          <aside className={styles.toc} aria-label="Whitepaper contents">
            <div className={styles.tocCard}>
              <span>Contents</span>
              <nav>
                {CONTENTS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
              </nav>
              <a href={AGENTOS_WHITEPAPER_PDF_GITHUB_URL} target="_blank" rel="noreferrer" className={styles.tocDownload}>
                <DownloadIcon />
                <span>PDF on GitHub</span>
              </a>
            </div>
          </aside>

          <article id="whitepaper-document" className={styles.document}>
            <header className={styles.documentHeader}>
              <span>AgentOS Whitepaper</span>
              <p>Public strategic and technical whitepaper · Version 1.0 · July 2026</p>
            </header>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {AGENTOS_WHITEPAPER_MARKDOWN}
            </ReactMarkdown>
          </article>
        </section>
      </main>

      <footer className={styles.footer}>
        <strong>AgentOS</strong>
        <span>One command. Super AgentOS coordinates the work end to end.</span>
        <a href={AGENTOS_WHITEPAPER_PDF_GITHUB_URL} target="_blank" rel="noreferrer">Download the official PDF on GitHub</a>
      </footer>
    </div>
  );
}
