import type { Metadata } from 'next';
import './globals.css';
import { APP_URL } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Agent OS — Operating System for AI Agents',
  description:
    '6 primitives that give AI agents production-ready infrastructure: filesystem, network, code execution, caching, database, and messaging.',
  keywords: 'AI agents, autonomous agents, agent infrastructure, AI operating system',
  openGraph: {
    title: 'Agent OS',
    description: 'Operating system infrastructure for AI agents',
    url: APP_URL,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Agent OS',
    description: 'Operating system infrastructure for AI agents',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
