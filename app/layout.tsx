import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { APP_URL } from '@/lib/config';
import BrowserSessionFetchGuard from '@/components/os/BrowserSessionFetchGuard';
import PanicButton from '@/components/os/PanicButton';
import ThemeController from '@/components/os/ThemeController';
import ApplicationShell from '@/components/os/application-shell';

export const metadata: Metadata = {
  title: 'AgentOS',
  description:
    'AgentOS v6.6.4 is a workspace operating system for projects, assets, workflows, app discovery, and library ownership.',
  keywords: 'AI operating system, AgentOS, Studio, projects, workflows, library, app store, connectors',
  metadataBase: new URL(APP_URL),
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AgentOS',
  },
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'AgentOS',
    description: 'AgentOS v6.6.4 organizes projects, assets, workflows, App Store discovery, and Library ownership.',
    url: APP_URL,
    type: 'website',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'AgentOS' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AgentOS',
    description: 'AgentOS v6.6.4 organizes projects, assets, workflows, App Store discovery, and Library ownership.',
    images: ['/logo.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=localStorage.getItem('agentos.theme')||'system';var t=p==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):p;document.documentElement.dataset.theme=t;document.documentElement.dataset.themePreference=p;}catch{}`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeController />
        <BrowserSessionFetchGuard />
        <Suspense
          fallback={(
            <div className="agentos-global-shell agentos-global-shell-loading">
              <header className="agentos-global-header">AgentOS</header>
              <aside className="agentos-global-left" />
              <main className="agentos-global-main">{children}</main>
              <aside className="agentos-global-right" />
            </div>
          )}
        >
          <ApplicationShell>{children}</ApplicationShell>
        </Suspense>
        <PanicButton />
      </body>
    </html>
  );
}
