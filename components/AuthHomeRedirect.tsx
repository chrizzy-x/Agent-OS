'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchBrowserSession } from '@/src/auth/browser-session';

export default function AuthHomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    void fetchBrowserSession()
      .then(session => {
        if (active && session) {
          router.replace('/studio');
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [router]);

  return null;
}
