import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { APP_URL } from '@/lib/config';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AgentOS by PRIME',
  description:
    'Agent OS combines primitives, universal MCP routing, consensus controls, a Skill Store, an App Store, and an autonomous operations crew for production AI agents.',
  keywords: 'AI agents, MCP, autonomous agents, skill store, agentic app store, agent infrastructure, consensus',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AgentOS by PRIME',
  },
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'AgentOS by PRIME',
    description: 'Universal MCP, skills, agentic apps, consensus, and production infrastructure for AI agents.',
    url: APP_URL,
    type: 'website',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'AgentOS by PRIME' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AgentOS by PRIME',
    description: 'Universal MCP, skills, agentic apps, consensus, and production infrastructure for AI agents.',
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
    <html lang="en" className={`${jetbrainsMono.variable} ${ibmPlexSans.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
