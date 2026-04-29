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
  title: 'Agent OS | Autonomous Agent Infrastructure',
  description:
    'Agent OS combines primitives, universal MCP routing, consensus controls, a skills marketplace, and an autonomous operations crew for production AI agents.',
  keywords: 'AI agents, MCP, autonomous agents, skills marketplace, agent infrastructure, consensus',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    title: 'Agent OS',
    description: 'Universal MCP, skills, consensus, and production infrastructure for AI agents.',
    url: APP_URL,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Agent OS',
    description: 'Universal MCP, skills, consensus, and production infrastructure for AI agents.',
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
