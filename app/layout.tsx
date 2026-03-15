import type { Metadata } from 'next';
import './globals.css';
import { APP_URL } from '@/lib/config';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
