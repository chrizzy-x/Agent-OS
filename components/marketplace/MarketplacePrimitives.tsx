'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export function formatMarketplaceCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export function ListingMark(props: { name: string; imageUrl?: string | null; className?: string }) {
  return (
    <div className={props.className ?? 'market-listing-mark'}>
      {props.imageUrl ? <img src={props.imageUrl} alt="" loading="lazy" /> : <span>{props.name.slice(0, 2).toUpperCase()}</span>}
    </div>
  );
}

export function ListingBanner(props: { name: string; imageUrl?: string | null; className?: string }) {
  return (
    <div className={props.className ?? 'market-card-banner'} aria-hidden="true">
      {props.imageUrl ? <img src={props.imageUrl} alt="" loading="lazy" /> : <span>{props.name}</span>}
    </div>
  );
}

export function MarketplaceHero(props: {
  bannerUrl?: string | null;
  logoUrl?: string | null;
  eyebrow: string;
  name: string;
  description: string;
  developerHref?: string;
  developerName: string;
  metadata: string[];
  primaryLabel: string;
  primaryDisabled?: boolean;
  secondaryHref: string;
  secondaryLabel: string;
  onPrimary: () => void;
}) {
  const developer = props.developerHref
    ? <Link href={props.developerHref}>{props.developerName}</Link>
    : <span>{props.developerName}</span>;
  return (
    <section className="market-featured-hero">
      <ListingBanner name={props.name} imageUrl={props.bannerUrl} className="market-featured-backdrop" />
      <div className="market-featured-content">
        <ListingMark name={props.name} imageUrl={props.logoUrl} className="market-featured-logo" />
        <div className="market-featured-copy">
          <span>{props.eyebrow}</span>
          <h2>{props.name}</h2>
          <p>{props.description}</p>
          <div className="market-featured-developer">{developer}</div>
          <div className="market-hero-meta">
            {props.metadata.filter(Boolean).map(item => <span key={item}>{item}</span>)}
          </div>
        </div>
        <div className="market-hero-actions">
          <button type="button" className="market-primary-action" disabled={props.primaryDisabled} onClick={props.onPrimary}>
            {props.primaryLabel}
          </button>
          <Link href={props.secondaryHref} className="market-secondary-action">{props.secondaryLabel}</Link>
        </div>
      </div>
    </section>
  );
}

export function LazyMarketplaceSection(props: {
  title: string;
  reason?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '360px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <section ref={ref} className="market-section market-row-section">
      <div className="market-section-head">
        <div>
          <h2>{props.title}</h2>
          {props.reason ? <p>{props.reason}</p> : null}
        </div>
      </div>
      {visible ? props.children : <div className="market-row-placeholder" />}
    </section>
  );
}

export function DeveloperSpotlight(props: {
  title?: string;
  developers: Array<{ handle: string; name: string; appsPublished?: number; skillsPublished?: number; totalInstalls: number; rating: number }>;
}) {
  if (props.developers.length === 0) return null;
  return (
    <section className="market-section">
      <div className="market-section-head"><h2>{props.title ?? 'Developer Spotlight'}</h2></div>
      <div className="market-developer-row">
        {props.developers.map(developer => (
          <Link key={developer.handle} href={`/developer/${developer.handle}`} className="market-developer-card">
            <ListingMark name={developer.name} className="market-developer-avatar" />
            <div>
              <h3>{developer.name}</h3>
              <p>@{developer.handle}</p>
              <span>{developer.appsPublished ?? developer.skillsPublished ?? 0} published</span>
            </div>
            <strong>{formatMarketplaceCount(developer.totalInstalls)} installs</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}
