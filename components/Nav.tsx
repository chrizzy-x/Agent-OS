'use client';

import type { BrowserSession } from '@/src/auth/browser-session';

interface NavProps {
  activePath?: string;
}

export function buildSessionNavLinks(_session: BrowserSession | null): Array<{ href: string; label: string }> {
  return [
    { href: '/search', label: 'Search' },
    { href: '/notifications', label: 'Notifications' },
  ];
}

export default function Nav(_props: NavProps) {
  return null;
}
