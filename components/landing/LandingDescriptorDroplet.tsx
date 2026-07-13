import Link from 'next/link';
import type { CSSProperties } from 'react';

export default function LandingDescriptorDroplet({ label, tone, href }: { label: string; tone: string; href?: string }) {
  const className = 'agentos-descriptor-droplet agentos-liquid-glass';
  const style = { '--descriptor-tone': tone } as CSSProperties;

  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        <span aria-hidden="true" />
        {label}
      </Link>
    );
  }

  return (
    <span className={className} style={style}>
      <span aria-hidden="true" />
      {label}
    </span>
  );
}
